import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { EBikeDevice, DriverProfile } from '../types';
import { logActivity } from './activityLogService';

/**
 * Real-time listener for all E-Bike hardware devices
 */
export function subscribeToEBikes(callback: (bikes: EBikeDevice[]) => void) {
  const ebikesRef = collection(db, 'ebikes');
  return onSnapshot(
    ebikesRef,
    (snapshot) => {
      const bikes: EBikeDevice[] = snapshot.docs.map((d) => ({
        ...(d.data() as EBikeDevice),
        deviceId: d.id,
      }));
      callback(bikes);
    },
    (err) => {
      if (err.code !== 'permission-denied') {
        console.error('Error listening to ebikes:', err);
      }
      callback([]);
    }
  );
}

/**
 * Register a new E-Bike Hardware Device in Firestore
 */
export async function registerEBike(data: {
  deviceId: string;
  serialNumber: string;
  name: string;
  zoneId?: string | null;
  zoneName?: string | null;
  initialLat?: number;
  initialLng?: number;
}): Promise<void> {
  const deviceId = data.deviceId.trim().toUpperCase();
  const ebikeRef = doc(db, 'ebikes', deviceId);

  const newBike: EBikeDevice = {
    deviceId,
    serialNumber: data.serialNumber.trim(),
    name: data.name.trim(),
    zoneId: data.zoneId || null,
    zoneName: data.zoneName || null,
    status: 'AVAILABLE',
    currentDriverId: null,
    currentDriverName: null,
    currentDriverPhone: null,
    lastRfidCardUid: null,
    location: {
      latitude: data.initialLat || 14.5995,
      longitude: data.initialLng || 120.9842,
      address: 'Station Depot Position',
      updatedAt: new Date().toISOString(),
    },
    speedKmH: 0,
    lastSeen: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ebikeRef, newBike);

  // Audit log creation
  logActivity({
    action: 'CREATE',
    actionLabel: 'Registered E-Shuttle',
    entityType: 'SHUTTLE',
    entityId: deviceId,
    entityName: newBike.name,
    summary: `Registered e-shuttle hardware device "${newBike.name}" (ID: ${deviceId}, S/N: ${newBike.serialNumber})`,
    details: {
      summary: `E-shuttle added to fleet inventory in zone "${newBike.zoneName || 'Default'}"`,
      after: {
        deviceId,
        name: newBike.name,
        serialNumber: newBike.serialNumber,
        zoneId: newBike.zoneId,
        zoneName: newBike.zoneName,
      },
    },
    severity: 'success',
  }).catch(() => {});
}

/**
 * Delete an E-Bike device
 */
export async function deleteEBike(deviceId: string, nameHint?: string): Promise<void> {
  const existingDoc = await getDoc(doc(db, 'ebikes', deviceId)).catch(() => null);
  const existingData = existingDoc?.exists() ? existingDoc.data() : null;
  const ebikeName = nameHint || existingData?.name || deviceId;

  await deleteDoc(doc(db, 'ebikes', deviceId));

  // Audit log deletion
  await logActivity({
    action: 'DELETE',
    actionLabel: 'Decommissioned E-Shuttle',
    entityType: 'SHUTTLE',
    entityId: deviceId,
    entityName: ebikeName,
    summary: `Decommissioned and deleted e-shuttle device "${ebikeName}" from fleet`,
    details: {
      summary: `Device removed from active fleet inventory`,
      before: existingData,
    },
    severity: 'danger',
  });
}

/**
 * Normalizes RFID Card UIDs to uppercase alphanumeric string for flexible format matching
 */
export function normalizeRfidUid(uid: string | null | undefined): string {
  if (!uid) return '';
  return uid.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
}

/**
 * Assign an RFID Card UID to a Driver Profile
 */
export async function pairDriverRfidCard(driverUid: string, rfidCardUid: string): Promise<void> {
  const cleanRfid = rfidCardUid.trim().toUpperCase();
  const normalizedNewRfid = normalizeRfidUid(cleanRfid);
  
  // Check if another driver already has this RFID card
  const driversRef = collection(db, 'drivers');
  const snap = await getDocs(driversRef);

  for (const driverDoc of snap.docs) {
    if (driverDoc.id !== driverUid) {
      const dData = driverDoc.data() as DriverProfile;
      if (dData.rfidCardUid && normalizeRfidUid(dData.rfidCardUid) === normalizedNewRfid) {
        // Clear RFID from previous driver to avoid duplicate card conflicts
        await updateDoc(doc(db, 'drivers', driverDoc.id), {
          rfidCardUid: null,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  // Update current driver
  const driverRef = doc(db, 'drivers', driverUid);
  await updateDoc(driverRef, {
    rfidCardUid: cleanRfid,
    updatedAt: serverTimestamp(),
  });

  // Audit log RFID pairing
  const currentDriverSnap = await getDoc(driverRef).catch(() => null);
  const driverData = currentDriverSnap?.data() as DriverProfile | undefined;
  logActivity({
    action: 'UPDATE',
    actionLabel: 'Paired RFID Card',
    entityType: 'DRIVER',
    entityId: driverUid,
    entityName: driverData?.fullName || driverUid,
    summary: `Paired RFID card "${cleanRfid}" to driver "${driverData?.fullName || driverUid}"`,
    details: {
      summary: `Hardware RFID card linked to driver credentials for tap-in/out authentication`,
      after: { driverUid, rfidCardUid: cleanRfid },
    },
    severity: 'info',
  }).catch(() => {});
}

/**
 * Process RFID Tap-In / Tap-Out Event from ESP32 or Simulator
 * Handles automatic takeover, clocking out previous drivers, and setting driver status.
 */
export async function processRfidTapEvent(
  deviceId: string,
  rawRfidCardUid: string
): Promise<{ success: boolean; message: string; action: 'TAP_IN' | 'TAP_OUT' | 'ERROR' }> {
  const cleanDeviceId = deviceId.trim().toUpperCase();
  const cleanRfid = rawRfidCardUid.trim().toUpperCase();
  const normalizedRfid = normalizeRfidUid(cleanRfid);

  // 1. Fetch E-Bike Document
  const ebikeRef = doc(db, 'ebikes', cleanDeviceId);
  const ebikeSnap = await getDoc(ebikeRef);

  if (!ebikeSnap.exists()) {
    return {
      success: false,
      message: `E-Bike Device "${cleanDeviceId}" not found in system registry.`,
      action: 'ERROR',
    };
  }

  const ebike = ebikeSnap.data() as EBikeDevice;

  // 2. Find Driver associated with this RFID Card (normalized comparison)
  const driversRef = collection(db, 'drivers');
  const driversSnap = await getDocs(driversRef);
  const matchingDriverDoc = driversSnap.docs.find((d) => {
    const drvData = d.data() as DriverProfile;
    return drvData.rfidCardUid && normalizeRfidUid(drvData.rfidCardUid) === normalizedRfid;
  });

  if (!matchingDriverDoc) {
    return {
      success: false,
      message: `Unrecognized RFID Card [${rawRfidCardUid}]. Please pair this card to a Driver in the Admin Portal.`,
      action: 'ERROR',
    };
  }

  const driver = matchingDriverDoc.data() as DriverProfile;
  const driverUid = matchingDriverDoc.id;

  // 3. CASE A: SAME DRIVER TAPS AGAIN (TAP-OUT / CLOCK OUT)
  if (ebike.currentDriverId === driverUid) {
    // Unassign E-Bike
    await updateDoc(ebikeRef, {
      currentDriverId: null,
      currentDriverName: null,
      currentDriverPhone: null,
      status: 'AVAILABLE',
      lastRfidCardUid: cleanRfid,
      updatedAt: serverTimestamp(),
    });

    // Toggle Driver to OFFLINE
    await updateDoc(doc(db, 'drivers', driverUid), {
      availability: 'OFFLINE',
      activeEbikeId: null,
      updatedAt: serverTimestamp(),
    });

    logActivity({
      action: 'STATUS_CHANGE',
      actionLabel: 'Driver Tapped Out',
      entityType: 'SHUTTLE',
      entityId: cleanDeviceId,
      entityName: ebike.name,
      summary: `Driver "${driver.fullName}" tapped out of shuttle "${ebike.name}" (OFFLINE)`,
      details: {
        summary: `RFID card tap-out recorded for vehicle ${cleanDeviceId}`,
        after: { availability: 'OFFLINE', shuttleStatus: 'AVAILABLE' },
      },
      performedBy: { uid: driverUid, name: driver.fullName, role: 'driver' },
      severity: 'info',
    }).catch(() => {});

    return {
      success: true,
      message: `Driver ${driver.fullName} tapped out of ${ebike.name}. Status toggled to OFFLINE.`,
      action: 'TAP_OUT',
    };
  }

  // 4. CASE B: NEW DRIVER TAPS IN (AUTOMATIC TAKEOVER)

  // Subcase B1: Query ALL drivers in database currently paired to this E-Bike (cleanDeviceId) and disconnect them
  let prevDriverNames: string[] = [];
  const activeDriversQuery = query(driversRef, where('activeEbikeId', '==', cleanDeviceId));
  const activeDriversSnap = await getDocs(activeDriversQuery);

  for (const prevDoc of activeDriversSnap.docs) {
    if (prevDoc.id !== driverUid) {
      const prevData = prevDoc.data() as DriverProfile;
      if (prevData.fullName) prevDriverNames.push(prevData.fullName);
      await updateDoc(doc(db, 'drivers', prevDoc.id), {
        availability: 'OFFLINE',
        activeEbikeId: null,
        vehicleInfo: 'Unassigned E-Shuttle',
        disconnectNotice: `Disconnected from ${ebike.name}: Driver ${driver.fullName} scanned a new RFID card on this vehicle.`,
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Also check ebike.currentDriverId if different from driverUid and not covered in query above
  if (ebike.currentDriverId && ebike.currentDriverId !== driverUid) {
    const prevDriverRef = doc(db, 'drivers', ebike.currentDriverId);
    const prevDriverSnap = await getDoc(prevDriverRef);
    if (prevDriverSnap.exists()) {
      const prevDriver = prevDriverSnap.data() as DriverProfile;
      if (!prevDriverNames.includes(prevDriver.fullName)) {
        prevDriverNames.push(prevDriver.fullName);
      }
      await updateDoc(prevDriverRef, {
        availability: 'OFFLINE',
        activeEbikeId: null,
        vehicleInfo: 'Unassigned E-Shuttle',
        disconnectNotice: `Disconnected from ${ebike.name}: Driver ${driver.fullName} scanned a new RFID card on this vehicle.`,
        updatedAt: serverTimestamp(),
      });
    }
  }

  const prevDriverName = prevDriverNames.join(', ');

  // Subcase B2: If current driver was on another E-Bike previously, release that E-Bike
  if (driver.activeEbikeId && driver.activeEbikeId !== cleanDeviceId) {
    const prevBikeRef = doc(db, 'ebikes', driver.activeEbikeId);
    const prevBikeSnap = await getDoc(prevBikeRef);
    if (prevBikeSnap.exists()) {
      await updateDoc(prevBikeRef, {
        currentDriverId: null,
        currentDriverName: null,
        currentDriverPhone: null,
        status: 'AVAILABLE',
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Assign New Driver to this E-Bike & Set Driver ONLINE
  const vehicleInfo = `${ebike.name} (Plate #${ebike.serialNumber})`;
  await updateDoc(ebikeRef, {
    currentDriverId: driverUid,
    currentDriverName: driver.fullName,
    currentDriverPhone: driver.phone,
    status: 'IN_USE',
    lastRfidCardUid: cleanRfid,
    updatedAt: serverTimestamp(),
  });

  const driverUpdates: Record<string, any> = {
    availability: 'ONLINE',
    activeEbikeId: cleanDeviceId,
    vehicleInfo,
    disconnectNotice: null, // clear any previous disconnect notice
    updatedAt: serverTimestamp(),
  };

  if (ebike.location) {
    driverUpdates.currentLocation = ebike.location;
  }

  await updateDoc(doc(db, 'drivers', driverUid), driverUpdates);

  // If driver has an active booking, sync location immediately to customer booking
  if (driver.activeBookingId && ebike.location) {
    await updateDoc(doc(db, 'bookings', driver.activeBookingId), {
      driverLocation: ebike.location,
    });
  }

  const takeoverDetail = prevDriverName
    ? ` Disconnected previous driver (${prevDriverName}).`
    : '';

  logActivity({
    action: 'STATUS_CHANGE',
    actionLabel: 'Driver Tapped In',
    entityType: 'SHUTTLE',
    entityId: cleanDeviceId,
    entityName: ebike.name,
    summary: `Driver "${driver.fullName}" tapped in to shuttle "${ebike.name}" (ONLINE)${takeoverDetail}`,
    details: {
      summary: `RFID card tap-in authorized vehicle deployment`,
      after: {
        driverUid,
        driverName: driver.fullName,
        availability: 'ONLINE',
        shuttleStatus: 'IN_USE',
        prevDriverName: prevDriverName || null,
      },
    },
    performedBy: { uid: driverUid, name: driver.fullName, role: 'driver' },
    severity: 'success',
  }).catch(() => {});

  return {
    success: true,
    message: `Driver ${driver.fullName} successfully took over ${ebike.name}!${takeoverDetail} Driver is now ONLINE.`,
    action: 'TAP_IN',
  };
}

/**
 * Auto-resolves driver pairing if an E-Bike has a scanned lastRfidCardUid
 * that belongs to a paired driver who is not currently assigned to the bike.
 */
export async function autoResolveRfidAssignment(
  bike: EBikeDevice,
  drivers: DriverProfile[]
): Promise<boolean> {
  if (!bike.lastRfidCardUid) return false;
  const cleanRfid = bike.lastRfidCardUid.trim();
  const normalizedScannedRfid = normalizeRfidUid(cleanRfid);
  if (!normalizedScannedRfid) return false;

  const matchingDriver = drivers.find(
    (d) => d.rfidCardUid && normalizeRfidUid(d.rfidCardUid) === normalizedScannedRfid
  );

  if (matchingDriver && bike.currentDriverId !== matchingDriver.uid) {
    await processRfidTapEvent(bike.deviceId, cleanRfid);
    return true;
  }
  return false;
}

/**
 * Update Live GPS Telemetry for an E-Bike (from ESP32 or Simulator)
 * Automatically syncs with Driver's live location and active customer booking.
 */
export async function updateEBikeGpsLocation(
  deviceId: string,
  latitude: number,
  longitude: number,
  speedKmH: number = 0,
  address: string = 'Live GPS Position'
): Promise<void> {
  const cleanDeviceId = deviceId.trim().toUpperCase();
  const ebikeRef = doc(db, 'ebikes', cleanDeviceId);
  const ebikeSnap = await getDoc(ebikeRef);

  if (!ebikeSnap.exists()) return;

  const ebike = ebikeSnap.data() as EBikeDevice;
  const nowIso = new Date().toISOString();

  const locationData = {
    latitude,
    longitude,
    address,
    updatedAt: nowIso,
  };

  // Update E-Bike document
  await updateDoc(ebikeRef, {
    location: locationData,
    speedKmH,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // If a driver is currently assigned to this E-Bike, update driver location & active booking
  if (ebike.currentDriverId) {
    const driverRef = doc(db, 'drivers', ebike.currentDriverId);
    const driverSnap = await getDoc(driverRef);

    if (driverSnap.exists()) {
      const driver = driverSnap.data() as DriverProfile;

      await updateDoc(driverRef, {
        currentLocation: locationData,
        updatedAt: serverTimestamp(),
      });

      // If driver has an active booking, sync location to booking for customer live map tracking
      if (driver.activeBookingId) {
        const bookingRef = doc(db, 'bookings', driver.activeBookingId);
        await updateDoc(bookingRef, {
          driverLocation: locationData,
        });
      }
    }
  }
}

/**
  * Subscribe to real-time RFID scans sent via ESP32 Admin Registration Mode
  */
export function subscribeToAdminRegistrationRfid(
  callback: (data: { rfidUid: string; scannedAt?: string } | null) => void
) {
  const regRef = doc(db, 'system', 'adminRegistration');
  return onSnapshot(
    regRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data?.lastScannedRegistrationRfid) {
          callback({
            rfidUid: data.lastScannedRegistrationRfid,
            scannedAt: data.scannedAt,
          });
          return;
        }
      }
      callback(null);
    },
    (err) => {
      if (err.code !== 'permission-denied') {
        console.error('Error listening to admin registration rfid:', err);
      }
      callback(null);
    }
  );
}

/**
 * Broadcast an RFID scan in Admin Registration Mode (from ESP32 hardware or Simulator)
 */
export async function sendAdminRegistrationScan(rfidUid: string): Promise<void> {
  const cleanRfid = rfidUid.trim().toUpperCase();
  const regRef = doc(db, 'system', 'adminRegistration');
  await setDoc(
    regRef,
    {
      lastScannedRegistrationRfid: cleanRfid,
      scannedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
