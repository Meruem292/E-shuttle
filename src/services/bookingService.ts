import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Booking,
  BookingStatus,
  DriverProfile,
  LocationPoint,
  RideHistoryItem,
  AdminSettings,
  ShuttleStation,
} from '../types';
import { calculateDistanceKm } from '../constants/fare';
import { checkLocationWithinStationArea, getShuttleStations } from './stationService';
import { logActivity } from './activityLogService';

// 1. Create new booking (with active booking and station proximity validation for pickup & drop-off)
export async function createBooking(
  customerId: string,
  customerName: string,
  customerPhone: string,
  pickup: LocationPoint,
  destination: LocationPoint,
  distanceKm: number,
  estimatedDurationMinutes: number,
  estimatedFare: number,
  zoneId?: string | null,
  zoneName?: string | null
): Promise<string> {
  // 0. Check User Account Suspension Status
  try {
    const userSnap = await getDoc(doc(db, 'users', customerId));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.accountStatus === 'SUSPENDED') {
        const suspendedUntil = userData.suspendedUntil;
        if (!suspendedUntil || Date.now() < suspendedUntil) {
          const untilStr = suspendedUntil ? new Date(suspendedUntil).toLocaleString() : 'further notice (Permanent)';
          throw new Error(`Your account is suspended until ${untilStr}. You cannot book a ride while under suspension.`);
        }
      }
    }
  } catch (suspendErr: any) {
    if (suspendErr.message && suspendErr.message.includes('suspended until')) {
      throw suspendErr;
    }
  }

  // 1. Proximity Geofence Verification: Verify pickup and destination are within allowed radius of designated stations
  try {
    const stations = await getShuttleStations();
    if (stations && stations.length > 0) {
      // Check Pick-up Station Proximity
      const pickupCheck = checkLocationWithinStationArea(pickup.latitude, pickup.longitude, stations, 'pickup');
      if (!pickupCheck.isWithinRadius) {
        const nearestName = pickupCheck.nearestStation?.name || 'Central Terminal';
        throw new Error(
          `Pick-up location is outside the authorized shuttle service zone. You are ${pickupCheck.distanceMeters}m away from the nearest station (${nearestName}). Please tag an official designated station pin.`
        );
      }

      // Check Drop-off Station Proximity
      const destCheck = checkLocationWithinStationArea(destination.latitude, destination.longitude, stations, 'dropoff');
      if (!destCheck.isWithinRadius) {
        const nearestDestName = destCheck.nearestStation?.name || 'Destination Hub';
        throw new Error(
          `Drop-off destination is outside authorized shuttle station radius (${destCheck.distanceMeters}m from ${nearestDestName}). Shuttles only operate to designated station pins.`
        );
      }

      // Enforce Intra-Zone Booking: If pickup station belongs to a zone, ensure dropoff station is in the same zone
      if (pickupCheck.nearestStation?.zoneId && destCheck.nearestStation?.zoneId) {
        if (pickupCheck.nearestStation.zoneId !== destCheck.nearestStation.zoneId) {
          throw new Error(
            `Cross-zone trips are not permitted. Both pick-up and drop-off must be within the same operational area (${pickupCheck.nearestStation.zoneName || 'Assigned Zone'}).`
          );
        }
      }
    }
  } catch (err: any) {
    if (
      err.message &&
      (err.message.includes('outside the authorized shuttle service zone') ||
        err.message.includes('outside authorized shuttle station radius') ||
        err.message.includes('Cross-zone trips are not permitted'))
    ) {
      throw err;
    }
    // If fetching stations encounters an error or db is booting, allow fallback
    console.warn('Station proximity check warning:', err);
  }

  // 2. Check if user already has an active booking
  const activeStatuses: BookingStatus[] = [
    'SEARCHING',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'RIDE_STARTED',
  ];

  const q = query(
    collection(db, 'bookings'),
    where('customerId', '==', customerId),
    where('status', 'in', activeStatuses)
  );

  const activeSnap = await getDocs(q);
  if (!activeSnap.empty) {
    throw new Error('You already have an active booking in progress.');
  }

  const bookingData = {
    customerId,
    customerName,
    customerPhone: customerPhone || 'N/A',
    driverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicleInfo: null,
    zoneId: zoneId || null,
    zoneName: zoneName || null,
    status: 'SEARCHING' as BookingStatus,
    pickup,
    destination,
    distanceKm,
    estimatedDurationMinutes,
    estimatedFare,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'bookings'), bookingData);

  // Audit log ride request creation
  logActivity({
    action: 'CREATE',
    actionLabel: 'Requested Ride',
    entityType: 'RIDE',
    entityId: docRef.id,
    entityName: `Ride #${docRef.id.slice(-6).toUpperCase()}`,
    summary: `Passenger "${customerName}" requested ride from "${pickup.address}" to "${destination.address}" (Fare: ₱${estimatedFare})`,
    details: {
      summary: `Booking created: ${distanceKm} km, ~${estimatedDurationMinutes} mins`,
      after: {
        bookingId: docRef.id,
        customerId,
        customerName,
        pickup: pickup.address,
        destination: destination.address,
        distanceKm,
        estimatedFare,
        zoneName,
      },
    },
    performedBy: { uid: customerId, name: customerName, role: 'customer' },
    severity: 'info',
  }).catch(() => {});

  return docRef.id;
}

// 2. ATOMIC TRANSACTION: Driver accepts booking
// Guarantees two drivers NEVER get the same booking
export async function acceptBookingAtomic(
  bookingId: string,
  driver: DriverProfile
): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);
  const driverRef = doc(db, 'drivers', driver.uid);

  await runTransaction(db, async (transaction) => {
    const bookingDoc = await transaction.get(bookingRef);

    if (!bookingDoc.exists()) {
      throw new Error('Booking no longer exists.');
    }

    const bookingData = bookingDoc.data();

    // Verify booking is still SEARCHING and unassigned
    if (bookingData.status !== 'SEARCHING' || bookingData.driverId) {
      throw new Error('This ride request has already been accepted by another driver.');
    }

    // Verify driver is approved and online
    const driverDoc = await transaction.get(driverRef);
    if (!driverDoc.exists()) {
      throw new Error('Driver account not found.');
    }
    const driverData = driverDoc.data();
    if (driverData.accountStatus === 'SUSPENDED') {
      const suspendedUntil = driverData.suspendedUntil;
      if (!suspendedUntil || Date.now() < suspendedUntil) {
        const untilStr = suspendedUntil ? new Date(suspendedUntil).toLocaleString() : 'further notice (Permanent)';
        throw new Error(`Your driver account is suspended until ${untilStr}. You cannot receive or accept bookings while suspended.`);
      }
    }
    if (driverData.accountStatus !== 'APPROVED') {
      throw new Error('Your driver account is not approved.');
    }
    if (driverData.availability === 'BUSY') {
      throw new Error('You already have an active ride.');
    }

    // Atomically assign booking
    transaction.update(bookingRef, {
      driverId: driver.uid,
      driverName: driver.fullName,
      driverPhone: driver.phone || 'N/A',
      driverVehicleInfo: driver.vehicleInfo || 'E-Shuttle Transit',
      driverLocation: driver.currentLocation || null,
      status: 'DRIVER_ASSIGNED',
      acceptedAt: serverTimestamp(),
    });

    // Mark driver as BUSY
    transaction.update(driverRef, {
      availability: 'BUSY',
      activeBookingId: bookingId,
      updatedAt: serverTimestamp(),
    });
  });

  // Audit log driver dispatch acceptance
  logActivity({
    action: 'STATUS_CHANGE',
    actionLabel: 'Driver Accepted Ride',
    entityType: 'RIDE',
    entityId: bookingId,
    entityName: `Ride #${bookingId.slice(-6).toUpperCase()}`,
    summary: `Driver "${driver.fullName}" accepted dispatch for ride #${bookingId.slice(-6).toUpperCase()}`,
    details: {
      summary: `Booking assigned to driver ${driver.fullName}`,
      after: {
        bookingId,
        driverId: driver.uid,
        driverName: driver.fullName,
        driverVehicleInfo: driver.vehicleInfo,
        status: 'DRIVER_ASSIGNED',
      },
    },
    performedBy: { uid: driver.uid, name: driver.fullName, role: 'driver' },
    severity: 'info',
  }).catch(() => {});
}

// 3. Update booking status state machine
export async function updateBookingStatus(
  bookingId: string,
  newStatus: BookingStatus,
  driverId?: string
): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);
  const updatePayload: Record<string, any> = {
    status: newStatus,
  };

  const now = serverTimestamp();

  if (newStatus === 'DRIVER_ARRIVING') {
    // optional transition flag
  } else if (newStatus === 'DRIVER_ARRIVED') {
    updatePayload.driverArrivedAt = now;
  } else if (newStatus === 'RIDE_STARTED') {
    updatePayload.startedAt = now;
  } else if (newStatus === 'COMPLETED') {
    updatePayload.completedAt = now;
  } else if (newStatus === 'CANCELLED') {
    updatePayload.cancelledAt = now;
  }

  await updateDoc(bookingRef, updatePayload);

  // Audit log status transition
  logActivity({
    action: 'STATUS_CHANGE',
    actionLabel: `Ride ${newStatus.replace('_', ' ')}`,
    entityType: 'RIDE',
    entityId: bookingId,
    entityName: `Ride #${bookingId.slice(-6).toUpperCase()}`,
    summary: `Ride #${bookingId.slice(-6).toUpperCase()} status changed to ${newStatus}`,
    details: {
      summary: `Trip progress milestone reached`,
      after: { bookingId, status: newStatus, driverId: driverId || null },
    },
    severity: newStatus === 'COMPLETED' ? 'success' : newStatus === 'CANCELLED' ? 'danger' : 'info',
  }).catch(() => {});

  // Handle completion or cancellation driver state cleanup
  if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
    const bookingSnap = await getDoc(bookingRef);
    if (bookingSnap.exists()) {
      const bData = bookingSnap.data();
      const assignedDriverId = driverId || bData.driverId;

      if (assignedDriverId) {
        const driverRef = doc(db, 'drivers', assignedDriverId);
        await updateDoc(driverRef, {
          availability: 'ONLINE',
          activeBookingId: null,
          updatedAt: now,
        });
      }

      // If completed, record in rides history collection
      if (newStatus === 'COMPLETED') {
        await addDoc(collection(db, 'rides'), {
          bookingId,
          customerId: bData.customerId,
          customerName: bData.customerName,
          driverId: assignedDriverId,
          driverName: bData.driverName,
          driverVehicleInfo: bData.driverVehicleInfo,
          pickup: bData.pickup,
          destination: bData.destination,
          distanceKm: bData.distanceKm,
          durationMinutes: bData.estimatedDurationMinutes,
          fare: bData.estimatedFare,
          startedAt: bData.startedAt || now,
          completedAt: now,
          createdAt: now,
        });
      }
    }
  }
}

// 4. Update live driver location
export async function updateDriverLocation(
  driverId: string,
  location: LocationPoint,
  activeBookingId?: string | null
): Promise<void> {
  const driverRef = doc(db, 'drivers', driverId);
  const updatedLocation = {
    ...location,
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(driverRef, {
    currentLocation: updatedLocation,
    updatedAt: serverTimestamp(),
  });

  // If driver has active booking, also mirror current location to booking for real-time tracking
  if (activeBookingId) {
    const bookingRef = doc(db, 'bookings', activeBookingId);
    await updateDoc(bookingRef, {
      driverLocation: updatedLocation,
    });
  }
}

// 5. Submit Customer Rating
export async function submitRideRating(
  bookingId: string,
  customerId: string,
  driverId: string,
  rating: number,
  comment: string
): Promise<void> {
  await addDoc(collection(db, 'ratings'), {
    bookingId,
    customerId,
    driverId,
    rating,
    comment,
    createdAt: serverTimestamp(),
  });

  // Update booking doc with rating
  await updateDoc(doc(db, 'bookings', bookingId), {
    rating,
    comment,
  });

  // Recalculate average driver rating
  const ratingsQuery = query(
    collection(db, 'ratings'),
    where('driverId', '==', driverId)
  );
  const snap = await getDocs(ratingsQuery);
  let totalStars = 0;
  let count = 0;
  snap.forEach((d) => {
    const data = d.data();
    if (data.rating) {
      totalStars += data.rating;
      count += 1;
    }
  });

  if (count > 0) {
    const avg = Math.round((totalStars / count) * 10) / 10;
    await updateDoc(doc(db, 'drivers', driverId), {
      rating: avg,
      totalRides: count,
    });
  }

  // Audit log rating submission
  logActivity({
    action: 'UPDATE',
    actionLabel: 'Submitted Ride Review',
    entityType: 'RIDE',
    entityId: bookingId,
    entityName: `Ride #${bookingId.slice(-6).toUpperCase()}`,
    summary: `Passenger rated ride #${bookingId.slice(-6).toUpperCase()} ${rating}★${comment ? ` - "${comment}"` : ''}`,
    details: {
      summary: `Customer feedback recorded for driver ${driverId}`,
      after: { rating, comment, bookingId, driverId },
    },
    performedBy: { uid: customerId, role: 'customer' },
    severity: 'info',
  }).catch(() => {});
}

// 6. Listeners

// Listen to customer active booking
export function listenToCustomerActiveBooking(
  customerId: string,
  callback: (booking: Booking | null) => void
) {
  const activeStatuses: BookingStatus[] = [
    'SEARCHING',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'RIDE_STARTED',
  ];

  const q = query(
    collection(db, 'bookings'),
    where('customerId', '==', customerId),
    where('status', 'in', activeStatuses)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
      } else {
        const docSnap = snapshot.docs[0];
        callback({
          id: docSnap.id,
          ...docSnap.data(),
        } as Booking);
      }
    },
    (err) => {
      if (err.code !== 'permission-denied') {
        console.error('Error listening to active booking:', err);
      }
      callback(null);
    }
  );
}

// Listen to nearby searching ride requests for online drivers (filtered by driver's assigned operational zone)
export function listenToNearbySearchingBookings(
  driverLocation: LocationPoint | undefined,
  radiusKm: number,
  callback: (bookings: Booking[]) => void,
  driverZoneId?: string | null
) {
  const q = query(
    collection(db, 'bookings'),
    where('status', '==', 'SEARCHING')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const results: Booking[] = [];
      snapshot.forEach((docSnap) => {
        const b = { id: docSnap.id, ...docSnap.data() } as Booking;

        // Zone filtering: If driver has an assigned zone, only show bookings from that zone
        if (driverZoneId && b.zoneId && b.zoneId !== driverZoneId) {
          return;
        }

        // Filter by radius if driver location is available
        if (driverLocation && b.pickup) {
          const dist = calculateDistanceKm(
            driverLocation.latitude,
            driverLocation.longitude,
            b.pickup.latitude,
            b.pickup.longitude
          );
          if (dist <= radiusKm) {
            results.push(b);
          }
        } else {
          results.push(b);
        }
      });
      callback(results);
    },
    (err) => {
      if (err.code !== 'permission-denied') {
        console.error('Error listening to nearby bookings:', err);
      }
      callback([]);
    }
  );
}

// Listen to driver active booking
export function listenToDriverActiveBooking(
  driverId: string,
  callback: (booking: Booking | null) => void
) {
  const activeStatuses: BookingStatus[] = [
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'RIDE_STARTED',
  ];

  const q = query(
    collection(db, 'bookings'),
    where('driverId', '==', driverId),
    where('status', 'in', activeStatuses)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
      } else {
        const docSnap = snapshot.docs[0];
        callback({
          id: docSnap.id,
          ...docSnap.data(),
        } as Booking);
      }
    },
    (err) => {
      if (err.code !== 'permission-denied') {
        console.error('Error listening to driver active booking:', err);
      }
      callback(null);
    }
  );
}

// Listen to online drivers for customer map view
export function listenToOnlineDrivers(callback: (drivers: DriverProfile[]) => void) {
  const q = query(
    collection(db, 'drivers'),
    where('accountStatus', '==', 'APPROVED'),
    where('availability', 'in', ['ONLINE', 'BUSY'])
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const drivers: DriverProfile[] = [];
      snapshot.forEach((docSnap) => {
        drivers.push({
          uid: docSnap.id,
          ...docSnap.data(),
        } as DriverProfile);
      });
      callback(drivers);
    },
    (err) => {
      if (err.code !== 'permission-denied') {
        console.error('Error listening to online drivers:', err);
      }
      callback([]);
    }
  );
}
