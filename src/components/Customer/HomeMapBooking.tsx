import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MapView } from '../MapView';
import { LocationPoint, Booking, DriverProfile, ShuttleStation, OperationalZone } from '../../types';
import {
  Crosshair,
  MapPin,
  Search,
  Phone,
  X,
  Star,
  Send,
  Bike,
  CheckCircle2,
  AlertTriangle,
  Navigation,
  Compass,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  calculateFare,
  calculateDistanceKm,
  estimateDurationMinutes,
} from '../../constants/fare';
import {
  listenToShuttleStations,
  checkLocationWithinStationArea,
  calculateDistanceMeters,
} from '../../services/stationService';
import { listenToOperationalZones, checkLocationWithinZone, findNearestZone } from '../../services/zoneService';
import {
  createBooking,
  updateBookingStatus,
  listenToCustomerActiveBooking,
  listenToOnlineDrivers,
  submitRideRating,
} from '../../services/bookingService';
import { useBackHandler } from '../../contexts/NativeBackContext';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from '../../services/logoService';
import { sanitizeVehicleInfo } from '../../utils/sanitizeVehicle';
import {
  playPickupChime,
  triggerHapticVibrate,
  sendNativePickupNotification,
  speakPickupAnnouncement,
  requestNotificationPermission,
  addAppNotification,
} from '../../services/notificationService';
import {
  PickupNotificationBanner,
  PickupNotificationData,
} from '../Common/PickupNotificationBanner';
import { NotificationBellButton } from '../Common/NotificationBellButton';

export const HomeMapBooking: React.FC = () => {
  const { userProfile, currentUser } = useAuth();
  const { logoUrl: appLogo } = useAppLogo();

  // Step management: 'select_zone' (Initial Page) | 'booking' (Stations & Request)
  const [bookingStep, setBookingStep] = useState<'select_zone' | 'booking'>('select_zone');
  const [zones, setZones] = useState<OperationalZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('all');
  const [detectedUserZone, setDetectedUserZone] = useState<OperationalZone | null>(null);
  const [stations, setStations] = useState<ShuttleStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState<boolean>(true);

  // In-app pickup notification state
  const [pickupNotification, setPickupNotification] = useState<PickupNotificationData | null>(null);
  const lastBookingStatusRef = React.useRef<string | null>(null);
  const alerted300mBookingIdRef = React.useRef<string | null>(null);

  // Location state (Default to first station once loaded)
  const [pickup, setPickup] = useState<LocationPoint>({
    latitude: 14.5547,
    longitude: 121.0244,
    address: 'Central Station Hub',
  });
  const [destination, setDestination] = useState<LocationPoint | null>(null);
  const [isSelectingOnMap, setIsSelectingOnMap] = useState<'pickup' | 'destination' | null>(null);
  const [showDestinationModal, setShowDestinationModal] = useState<boolean>(false);
  const [showPickupModal, setShowPickupModal] = useState<boolean>(false);
  const [destinationSearch, setDestinationSearch] = useState<string>('');
  const [pickupSearch, setPickupSearch] = useState<string>('');

  // Fare & Active Booking State
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [onlineDrivers, setOnlineDrivers] = useState<DriverProfile[]>([]);
  const [isBookingLoading, setIsBookingLoading] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [hasGpsAcquired, setHasGpsAcquired] = useState<boolean>(false);
  const hasGpsAcquiredRef = React.useRef<boolean>(false);

  // Auto-detect operational zone strictly based on user's REAL GPS coordinates (when acquired)
  useEffect(() => {
    // CRITICAL: Do NOT fake GPS zone detection if real device GPS has not been acquired!
    if (!hasGpsAcquired || !pickup.latitude || !pickup.longitude || zones.length === 0) {
      setDetectedUserZone(null);
      return;
    }

    // 1. Try to find zone matching real coordinates directly
    const nearest = findNearestZone(pickup.latitude, pickup.longitude, zones, stations);
    if (nearest.nearestZone) {
      setDetectedUserZone(nearest.nearestZone);
      if (selectedZoneId === 'all' || selectedZoneId === 'auto') {
        setSelectedZoneId(nearest.nearestZone.id);
      }
      return;
    }

    // 2. Fallback: check if nearest station has a zone ID
    const stationCheck = checkLocationWithinStationArea(pickup.latitude, pickup.longitude, stations);
    if (stationCheck.nearestStation?.zoneId) {
      const matchedZone = zones.find((z) => z.id === stationCheck.nearestStation!.zoneId);
      if (matchedZone) {
        setDetectedUserZone(matchedZone);
        if (selectedZoneId === 'all' || selectedZoneId === 'auto') {
          setSelectedZoneId(matchedZone.id);
        }
        return;
      }
    }

    setDetectedUserZone(null);
  }, [hasGpsAcquired, pickup.latitude, pickup.longitude, zones, stations]);

  // Auto-acquire device GPS immediately upon opening the app
  useEffect(() => {
    if (!navigator.geolocation) return;

    setIsLocatingGps(true);

    const handleGpsSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      hasGpsAcquiredRef.current = true;
      setHasGpsAcquired(true);
      setIsLocatingGps(false);

      setPickup((prev) => {
        // Don't overwrite if user actively customized or has active booking
        if (activeBooking) return prev;

        const check = checkLocationWithinStationArea(latitude, longitude, stations, 'pickup');
        let addr = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

        if (check.isWithinRadius && check.nearestStation) {
          addr = `GPS: Near ${check.nearestStation.name} (${check.distanceMeters}m)`;
        } else if (check.nearestStation) {
          addr = `Current GPS (${check.distanceMeters >= 1000 ? (check.distanceMeters / 1000).toFixed(1) + 'km' : check.distanceMeters + 'm'} from ${check.nearestStation.name})`;
        }

        return {
          latitude,
          longitude,
          address: addr,
        };
      });
    };

    const handleGpsError = (err: GeolocationPositionError) => {
      console.warn('Auto GPS location acquisition notice:', err.message);
      setIsLocatingGps(false);
      setHasGpsAcquired(false);
      hasGpsAcquiredRef.current = false;
      setDetectedUserZone(null);
    };

    // 1. Initial high-accuracy location lookup
    navigator.geolocation.getCurrentPosition(handleGpsSuccess, handleGpsError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    // 2. Continuous watch position to keep live GPS updated as user moves
    const watchId = navigator.geolocation.watchPosition(handleGpsSuccess, handleGpsError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [stations, activeBooking]);

  // Rating Modal
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [completedBookingToRate, setCompletedBookingToRate] = useState<Booking | null>(null);
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');

  // Native Back Button Handlers
  useBackHandler(
    showRatingModal,
    () => {
      setShowRatingModal(false);
      return true;
    },
    20,
    'rating-modal'
  );

  useBackHandler(
    showDestinationModal,
    () => {
      setShowDestinationModal(false);
      return true;
    },
    15,
    'destination-modal'
  );

  useBackHandler(
    showPickupModal,
    () => {
      setShowPickupModal(false);
      return true;
    },
    15,
    'pickup-modal'
  );

  useBackHandler(
    isSelectingOnMap !== null,
    () => {
      setIsSelectingOnMap(null);
      return true;
    },
    12,
    'map-select'
  );

  useBackHandler(
    !activeBooking && destination !== null && !showDestinationModal && isSelectingOnMap === null && !showPickupModal,
    () => {
      setDestination(null);
      return true;
    },
    10,
    'destination-clear'
  );

  // 1. Subscribe to Operational Zones & Shuttle Stations
  useEffect(() => {
    const unsubZones = listenToOperationalZones((zoneList) => {
      setZones(zoneList);
    });

    const unsubStations = listenToShuttleStations((list) => {
      setStations(list);
      setStationsLoading(false);

      // If initial station exists and GPS has not been acquired yet, set to first active station as temporary fallback
      if (!hasGpsAcquiredRef.current && list.length > 0 && (!pickup.address || pickup.address === 'Central Station Hub')) {
        const firstActive = list.find((s) => s.isActive !== false) || list[0];
        setPickup({
          latitude: firstActive.latitude,
          longitude: firstActive.longitude,
          address: `${firstActive.name} (${firstActive.address})`,
        });
      }
    });

    return () => {
      unsubZones();
      unsubStations();
    };
  }, []);

  // 2. Real-time Service Zone Proximity Validation for Pickup & Destination
  const proximityCheck = useMemo(() => {
    return checkLocationWithinStationArea(pickup.latitude, pickup.longitude, stations, 'pickup');
  }, [pickup, stations]);

  const destinationProximityCheck = useMemo(() => {
    if (!destination) return null;
    return checkLocationWithinStationArea(destination.latitude, destination.longitude, stations, 'dropoff');
  }, [destination, stations]);

  // Format distance cleanly
  const formattedDistanceToNearest = useMemo(() => {
    if (!proximityCheck.nearestStation) return '';
    if (proximityCheck.distanceMeters >= 1000) {
      return `${(proximityCheck.distanceMeters / 1000).toFixed(1)} km`;
    }
    return `${proximityCheck.distanceMeters} meters`;
  }, [proximityCheck]);

  const formattedDistanceToNearestDest = useMemo(() => {
    if (!destinationProximityCheck?.nearestStation) return '';
    if (destinationProximityCheck.distanceMeters >= 1000) {
      return `${(destinationProximityCheck.distanceMeters / 1000).toFixed(1)} km`;
    }
    return `${destinationProximityCheck.distanceMeters} meters`;
  }, [destinationProximityCheck]);

  // Snap to Nearest Designated Station
  const handleSnapToNearestStation = () => {
    if (proximityCheck.nearestStation) {
      const st = proximityCheck.nearestStation;
      setPickup({
        latitude: st.latitude,
        longitude: st.longitude,
        address: `${st.name} (${st.address})`,
      });
      setBookingError(null);
    }
  };

  const handleSnapToNearestDestStation = () => {
    if (destinationProximityCheck?.nearestStation) {
      const st = destinationProximityCheck.nearestStation;
      setDestination({
        latitude: st.latitude,
        longitude: st.longitude,
        address: `${st.name} (${st.address})`,
      });
      setBookingError(null);
    }
  };

  // Phone GPS Location Handler (checks station catchment)
  const handleUseCurrentGpsLocation = () => {
    if (!navigator.geolocation) {
      setBookingError('Geolocation is not supported on this device.');
      return;
    }
    setIsLocatingGps(true);
    setBookingError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        hasGpsAcquiredRef.current = true;
        setHasGpsAcquired(true);
        // Verify proximity to nearest station
        const check = checkLocationWithinStationArea(latitude, longitude, stations);

        if (check.isWithinRadius && check.nearestStation) {
          setPickup({
            latitude,
            longitude,
            address: `GPS: Near ${check.nearestStation.name} (${check.distanceMeters}m)`,
          });
        } else if (check.nearestStation) {
          setPickup({
            latitude,
            longitude,
            address: `Current GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
          });
        } else {
          setPickup({
            latitude,
            longitude,
            address: `Current GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
          });
        }
        setIsLocatingGps(false);
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setIsLocatingGps(false);
        if (error.code === error.PERMISSION_DENIED) {
          setBookingError('Location permission denied. Please pick a designated station on the map.');
        } else {
          setBookingError('Unable to retrieve phone GPS position.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  // 3. Subscribe to active customer booking
  useEffect(() => {
    if (!currentUser) return;

    const unsub = listenToCustomerActiveBooking(currentUser.uid, (booking) => {
      if (booking) {
        const prevStatus = lastBookingStatusRef.current;
        lastBookingStatusRef.current = booking.status;

        // Trigger pickup notification when driver accepts, approaches, or arrives
        if (prevStatus && prevStatus !== booking.status) {
          if (booking.status === 'DRIVER_ASSIGNED') {
            playPickupChime('driver_assigned');
            triggerHapticVibrate([150, 80, 150]);
            speakPickupAnnouncement(`E-Shuttle ride confirmed. Driver ${booking.driverName || ''} is on the way to ${booking.pickup.address}.`);
            sendNativePickupNotification('E-Shuttle Assigned!', {
              body: `Driver ${booking.driverName || 'E-Shuttle'} is heading to your pickup at ${booking.pickup.address}`,
            });
            addAppNotification({
              title: 'Shuttle Assigned & On The Way',
              message: `Driver ${booking.driverName || 'E-Shuttle'} is heading to your pickup at ${booking.pickup.address}`,
              type: 'pickup',
              meta: { bookingId: booking.id, driverName: booking.driverName },
            }, currentUser?.uid);
            setPickupNotification({
              id: String(Date.now()),
              type: 'driver_assigned',
              title: 'Shuttle Assigned & On The Way!',
              message: `Driver ${booking.driverName || 'E-Shuttle'} accepted your ride to ${booking.destination.address}.`,
              driverName: booking.driverName || undefined,
              driverPhone: booking.driverPhone || undefined,
            });
          } else if (booking.status === 'DRIVER_ARRIVING') {
            playPickupChime('driver_approaching');
            triggerHapticVibrate([150, 100, 150]);
            speakPickupAnnouncement(`Your shuttle is approaching your pickup at ${booking.pickup.address}.`);
            sendNativePickupNotification('E-Shuttle Arriving Soon!', {
              body: `Your shuttle is approaching your pickup at ${booking.pickup.address}`,
            });
            addAppNotification({
              title: 'Shuttle Arriving in ~2 Minutes',
              message: `Please head to the pickup point at ${booking.pickup.address}`,
              type: 'pickup',
              meta: { bookingId: booking.id },
            }, currentUser?.uid);
            setPickupNotification({
              id: String(Date.now()),
              type: 'driver_approaching',
              title: 'Shuttle Arriving in ~2 Minutes!',
              message: `Please head to the pickup point at ${booking.pickup.address}.`,
              driverName: booking.driverName || undefined,
              driverPhone: booking.driverPhone || undefined,
            });
          } else if (booking.status === 'DRIVER_ARRIVED') {
            playPickupChime('driver_arrived');
            triggerHapticVibrate([250, 100, 250, 100, 250]);
            speakPickupAnnouncement(`Your E-Shuttle has arrived at ${booking.pickup.address}. Please proceed to board.`);
            sendNativePickupNotification('Your E-Shuttle Has Arrived!', {
              body: `Your driver is waiting at ${booking.pickup.address}. Please proceed to board.`,
            });
            addAppNotification({
              title: 'Your E-Shuttle Has Arrived!',
              message: `Driver is waiting at ${booking.pickup.address}. Vehicle: ${sanitizeVehicleInfo(booking.driverVehicleInfo)}.`,
              type: 'pickup',
              meta: { bookingId: booking.id },
            }, currentUser?.uid);
            setPickupNotification({
              id: String(Date.now()),
              type: 'driver_arrived',
              title: 'Your E-Shuttle Has Arrived!',
              message: `Driver is waiting at ${booking.pickup.address}. Look for vehicle info: ${sanitizeVehicleInfo(booking.driverVehicleInfo)}.`,
              driverName: booking.driverName || undefined,
              driverPhone: booking.driverPhone || undefined,
            });
          }
        }

        // 300-METER PROXIMITY TRIGGER: Proximity alert when driver approaches within 300m
        if (
          (booking.status === 'DRIVER_ASSIGNED' || booking.status === 'DRIVER_ARRIVING') &&
          booking.driverLocation?.latitude &&
          booking.driverLocation?.longitude &&
          booking.pickup?.latitude &&
          booking.pickup?.longitude
        ) {
          const distToPickupMeters = calculateDistanceMeters(
            booking.driverLocation.latitude,
            booking.driverLocation.longitude,
            booking.pickup.latitude,
            booking.pickup.longitude
          );

          if (distToPickupMeters <= 300 && alerted300mBookingIdRef.current !== booking.id) {
            alerted300mBookingIdRef.current = booking.id;
            playPickupChime('driver_approaching');
            triggerHapticVibrate([200, 100, 200]);
            speakPickupAnnouncement(`Your E-Shuttle is within 300 meters. Please prepare to board at ${booking.pickup.address}.`);
            sendNativePickupNotification('E-Shuttle is 300m Away!', {
              body: `Driver ${booking.driverName || 'E-Shuttle'} is approximately ${Math.round(distToPickupMeters)}m from your pickup at ${booking.pickup.address}.`,
            });
            addAppNotification({
              title: `Shuttle Nearby (~${Math.round(distToPickupMeters)}m)!`,
              message: `Driver ${booking.driverName || 'E-Shuttle'} is within 300m of ${booking.pickup.address}. Please proceed to the boarding area.`,
              type: 'proximity',
              meta: { bookingId: booking.id, distance: Math.round(distToPickupMeters) },
            }, currentUser?.uid);
            setPickupNotification({
              id: String(Date.now()),
              type: 'driver_approaching',
              title: `Shuttle Nearby (~${Math.round(distToPickupMeters)}m)!`,
              message: `Driver ${booking.driverName || 'E-Shuttle'} is within 300m of ${booking.pickup.address}. Please proceed to the boarding area.`,
              driverName: booking.driverName || undefined,
              driverPhone: booking.driverPhone || undefined,
            });
          }
        }

        setActiveBooking(booking);
        setPickup(booking.pickup);
        setDestination(booking.destination);
      } else {
        lastBookingStatusRef.current = null;
        alerted300mBookingIdRef.current = null;
        if (activeBooking && activeBooking.status === 'RIDE_STARTED') {
          setCompletedBookingToRate(activeBooking);
          setShowRatingModal(true);
        }
        setActiveBooking(null);
      }
    });

    return () => unsub();
  }, [currentUser]);

  // 4. Subscribe to online drivers for map display
  useEffect(() => {
    if (!currentUser) return;

    const unsub = listenToOnlineDrivers((drivers) => {
      setOnlineDrivers(drivers);
    });
    return () => unsub();
  }, [currentUser]);

  // Handle map tap selection
  const handleMapLocationSelect = (lat: number, lng: number) => {
    if (isSelectingOnMap === 'pickup') {
      const check = checkLocationWithinStationArea(lat, lng, stations, 'pickup');
      if (check.isWithinRadius && check.nearestStation) {
        setPickup({
          latitude: lat,
          longitude: lng,
          address: `${check.nearestStation.name} (Tagged)`,
        });
      } else {
        setPickup({
          latitude: lat,
          longitude: lng,
          address: `Pinned Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
      }
      setBookingError(null);
    } else if (isSelectingOnMap === 'destination') {
      const check = checkLocationWithinStationArea(lat, lng, stations, 'dropoff');
      if (check.isWithinRadius && check.nearestStation) {
        setDestination({
          latitude: check.nearestStation.latitude,
          longitude: check.nearestStation.longitude,
          address: `${check.nearestStation.name} (${check.nearestStation.address})`,
        });
      } else if (check.nearestStation) {
        setDestination({
          latitude: lat,
          longitude: lng,
          address: `Pinned near ${check.nearestStation.name} (${check.distanceMeters}m)`,
        });
      } else {
        setDestination({
          latitude: lat,
          longitude: lng,
          address: `Drop-off Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
      }
      setBookingError(null);
    }
    setIsSelectingOnMap(null);
  };

  // Handle direct Station Pin tagging from MapView popup buttons
  const handleDirectStationTag = (station: ShuttleStation, type: 'pickup' | 'destination') => {
    if (type === 'pickup') {
      setPickup({
        latitude: station.latitude,
        longitude: station.longitude,
        address: `${station.name} (${station.address})`,
      });
      setBookingError(null);
    } else {
      setDestination({
        latitude: station.latitude,
        longitude: station.longitude,
        address: `${station.name} (${station.address})`,
      });
      setBookingError(null);
    }
  };

  // Compute calculated values
  const distanceKm = destination
    ? calculateDistanceKm(pickup.latitude, pickup.longitude, destination.latitude, destination.longitude)
    : 0;
  const estMinutes = destination ? estimateDurationMinutes(distanceKm) : 0;
  const fareAmount = destination ? calculateFare(distanceKm) : 0;

  // Handle Book Ride (Blocked if outside station service zone for pickup OR drop-off)
  const handleConfirmBooking = async () => {
    if (!currentUser || !userProfile || !destination) return;

    if (!proximityCheck.isWithinRadius) {
      setBookingError(
        `Pickup point is outside the 100m pin geofence. Please select or walk within 100m of a designated station pin (${proximityCheck.nearestStation?.name || 'Nearest Station'}).`
      );
      return;
    }

    if (destinationProximityCheck && !destinationProximityCheck.isWithinRadius) {
      setBookingError(
        `Drop-off destination is outside the 100m pin geofence. Please select a point within 100m of a designated station pin (${destinationProximityCheck.nearestStation?.name || 'Nearest Destination'}).`
      );
      return;
    }

    // Get the zone of the pickup station
    const effectiveZoneId = proximityCheck.nearestStation?.zoneId || null;
    const effectiveZoneName = proximityCheck.nearestStation?.zoneName || null;

    setIsBookingLoading(true);
    setBookingError(null);

    try {
      await createBooking(
        currentUser.uid,
        userProfile.fullName || 'Customer',
        userProfile.phone || 'N/A',
        pickup,
        destination,
        distanceKm,
        estMinutes,
        fareAmount,
        effectiveZoneId,
        effectiveZoneName
      );
    } catch (err: any) {
      console.error('Booking error:', err);
      setBookingError(err.message || 'Failed to create booking.');
    } finally {
      setIsBookingLoading(false);
    }
  };

  // Handle Cancel Booking
  const handleCancelBooking = async () => {
    if (!activeBooking || !activeBooking.id) return;
    try {
      await updateBookingStatus(activeBooking.id, 'CANCELLED');
      setActiveBooking(null);
    } catch (err) {
      console.error('Error cancelling booking:', err);
    }
  };

  // Handle Submit Rating
  const handleRatingSubmit = async () => {
    if (!completedBookingToRate || !completedBookingToRate.id || !completedBookingToRate.driverId || !currentUser) return;
    try {
      await submitRideRating(
        completedBookingToRate.id,
        currentUser.uid,
        completedBookingToRate.driverId,
        ratingValue,
        ratingComment
      );
      setShowRatingModal(false);
      setCompletedBookingToRate(null);
      setDestination(null);
    } catch (err) {
      console.error('Error submitting rating:', err);
    }
  };

  // Active stations only for lists
  const activeStations = useMemo(() => {
    return stations.filter((s) => s.isActive !== false);
  }, [stations]);

  // Zone derived from nearest station OR user's GPS detected zone
  const pickupStationZoneId = proximityCheck.nearestStation?.zoneId || detectedUserZone?.id;

  // Effective zone active for station filtering
  const effectiveZoneId = useMemo(() => {
    if (selectedZoneId && selectedZoneId !== 'all') {
      return selectedZoneId;
    }
    return detectedUserZone?.id || (zones.length > 0 ? zones[0].id : undefined);
  }, [selectedZoneId, detectedUserZone, zones]);

  const activeZoneObj = useMemo(() => {
    if (effectiveZoneId) {
      return zones.find((z) => z.id === effectiveZoneId) || detectedUserZone;
    }
    return detectedUserZone;
  }, [effectiveZoneId, zones, detectedUserZone]);

  // Handle explicit zone switching by customer
  const handleSelectZone = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setBookingError(null);
    setBookingStep('booking');

    const targetZone = zones.find((z) => z.id === zoneId);
    const activeSts = stations.filter((s) => s.isActive !== false);
    const zoneStations = activeSts.filter((s) => !s.zoneId || s.zoneId === zoneId);

    if (zoneStations.length > 0) {
      let nearest = zoneStations[0];
      let minDist = Infinity;
      for (const st of zoneStations) {
        const dist = calculateDistanceMeters(pickup.latitude, pickup.longitude, st.latitude, st.longitude);
        if (dist < minDist) {
          minDist = dist;
          nearest = st;
        }
      }

      setPickup({
        latitude: nearest.latitude,
        longitude: nearest.longitude,
        address: `${nearest.name} (${nearest.address})`,
      });

      if (destination) {
        const destInZone = zoneStations.some(
          (s) => calculateDistanceMeters(destination.latitude, destination.longitude, s.latitude, s.longitude) <= (s.radiusMeters || 100)
        );
        if (!destInZone) {
          setDestination(null);
        }
      }
    }
  };

  const filteredDestinationStations = useMemo(() => {
    let allowed = activeStations.filter(
      (s) => s.allowedType !== 'pickup_only' && s.allowDropoff !== false
    );

    // Filter strictly by effective zone if selected or auto-detected
    if (effectiveZoneId) {
      const inZone = allowed.filter((s) => !s.zoneId || s.zoneId === effectiveZoneId);
      if (inZone.length > 0) {
        allowed = inZone;
      }
    }

    if (!destinationSearch.trim()) return allowed;
    return allowed.filter(
      (s) =>
        s.name.toLowerCase().includes(destinationSearch.toLowerCase()) ||
        s.address.toLowerCase().includes(destinationSearch.toLowerCase())
    );
  }, [activeStations, destinationSearch, effectiveZoneId]);

  const filteredPickupStations = useMemo(() => {
    let allowed = activeStations.filter(
      (s) => s.allowedType !== 'dropoff_only' && s.allowPickup !== false
    );

    // Filter strictly by effective zone if selected or auto-detected
    if (effectiveZoneId) {
      const inZone = allowed.filter((s) => !s.zoneId || s.zoneId === effectiveZoneId);
      if (inZone.length > 0) {
        allowed = inZone;
      }
    }

    if (pickupSearch.trim()) {
      allowed = allowed.filter(
        (s) =>
          s.name.toLowerCase().includes(pickupSearch.toLowerCase()) ||
          s.address.toLowerCase().includes(pickupSearch.toLowerCase())
      );
    }

    // Sort by proximity to user's current GPS / pickup coordinates
    if (pickup.latitude && pickup.longitude) {
      return [...allowed].sort((a, b) => {
        const distA = calculateDistanceMeters(pickup.latitude, pickup.longitude, a.latitude, a.longitude);
        const distB = calculateDistanceMeters(pickup.latitude, pickup.longitude, b.latitude, b.longitude);
        return distA - distB;
      });
    }

    return allowed;
  }, [activeStations, pickupSearch, effectiveZoneId, pickup]);

  // Stations visible on map (filtered by pickup station zone if a station with a zone is selected)
  const displayStationsOnMap = useMemo(() => {
    if (!pickupStationZoneId) return stations;
    return stations.filter((s) => !s.zoneId || s.zoneId === pickupStationZoneId);
  }, [stations, pickupStationZoneId]);

  // Shuttles visible to customer (filtered by zone if user has picked a station with a zone)
  const displayOnlineDrivers = useMemo(() => {
    if (!pickupStationZoneId) return onlineDrivers;
    return onlineDrivers.filter(
      (d) => !d.zoneId || d.zoneId === pickupStationZoneId
    );
  }, [onlineDrivers, pickupStationZoneId]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#E3F2FD] overflow-hidden select-none">
      {/* Real-time In-App Pickup Notification Banner */}
      <PickupNotificationBanner
        notification={pickupNotification}
        onDismiss={() => setPickupNotification(null)}
      />

      {/* Map Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto max-w-md mx-auto">
          <div className="flex items-center gap-2.5 bg-white/95 border-2 border-[#0D47A1] backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg">
            <img
              src={appLogo}
              onError={(e) => {
                markLogoUrlAsFailed(appLogo);
                (e.target as HTMLImageElement).src = officialLogoFallback;
              }}
              alt="E-Shuttle Logo"
              className="w-7 h-7 rounded-full object-cover border border-[#0D47A1] shrink-0"
            />
            <div>
              <h1 className="text-sm font-black text-[#0D47A1] leading-none">E-Shuttle</h1>
              <p className="text-[10px] text-[#0D47A1] font-bold">Designated Station Transit</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online Drivers & Stations Badge */}
            <div
              title="E-Shuttles currently active in service"
              className="flex items-center gap-1.5 bg-white/95 border-2 border-[#0D47A1] backdrop-blur-md px-3 py-1.5 rounded-full text-[#0D47A1] text-xs font-bold shadow-lg"
            >
              <span className="w-2 h-2 bg-[#0D47A1] rounded-full animate-ping"></span>
              <span className="hidden sm:inline">{displayOnlineDrivers.length} Shuttles Active</span>
              <span className="sm:hidden">{displayOnlineDrivers.length} Active</span>
            </div>

            {/* Notification Bell Button */}
            <NotificationBellButton
              className="bg-white/95 border-2 border-[#0D47A1] text-[#0D47A1] shadow-lg backdrop-blur-md hover:bg-slate-50 shrink-0"
              iconClassName="w-4 h-4 text-[#0D47A1]"
            />
          </div>
        </div>
      </div>

      {/* Main Interactive Map View */}
      <div className="flex-1 w-full h-full relative">
        <MapView
          pickup={pickup}
          destination={destination}
          driverLocation={activeBooking?.driverLocation || null}
          nearbyDrivers={activeBooking ? [] : displayOnlineDrivers}
          stations={displayStationsOnMap}
          onStationTag={handleDirectStationTag}
          isSelectingLocation={isSelectingOnMap}
          onLocationSelect={handleMapLocationSelect}
          rideStatus={activeBooking?.status}
          showNavigationBanner={!!activeBooking}
          className="w-full h-full"
        />

        {/* Floating Quick Phone GPS Pin Button */}
        {!activeBooking && (
          <button
            onClick={handleUseCurrentGpsLocation}
            disabled={isLocatingGps}
            title="Pin My Current Phone GPS Location"
            className="absolute right-4 top-20 z-20 bg-white hover:bg-[#0D47A1] hover:text-white border-2 border-[#0D47A1] text-[#0D47A1] px-3.5 py-2 rounded-2xl shadow-xl backdrop-blur flex items-center gap-2 active:scale-95 transition-all group"
          >
            <Crosshair className="w-4 h-4 text-[#0D47A1] group-hover:text-white transition-colors" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              {isLocatingGps ? 'Locating...' : 'GPS Pin'}
            </span>
          </button>
        )}
      </div>

      {/* ACTIVE RIDE DISPLAY SHEET (When customer has active booking) */}
      {activeBooking ? (
        <div className="absolute bottom-20 left-0 right-0 z-20 max-w-md mx-auto px-4 pb-2">
          <div className="bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] rounded-3xl p-5 shadow-2xl text-[#0D47A1] animate-in slide-in-from-bottom duration-300">
            {/* Status Header */}
            {activeBooking.status === 'SEARCHING' && (
              <div className="flex flex-col items-center justify-center text-center py-4 space-y-3">
                <div className="relative flex items-center justify-center">
                  <div className="w-16 h-16 bg-[#E3F2FD] border-2 border-[#0D47A1] rounded-full flex items-center justify-center animate-pulse text-[#0D47A1] font-black text-xs uppercase">
                    <Bike className="w-8 h-8 text-[#0D47A1]" />
                  </div>
                  <span className="absolute inset-0 rounded-full border-2 border-[#0D47A1]/40 animate-ping"></span>
                </div>
                <div>
                  <h3 className="text-base font-black text-[#0D47A1]">Searching for Nearby E-Shuttle...</h3>
                  <p className="text-xs text-slate-500 font-medium">Broadcasting request to nearby drivers</p>
                </div>
                <div className="w-full bg-[#E3F2FD] h-2 rounded-full overflow-hidden border border-[#0D47A1]/40">
                  <div className="bg-[#0D47A1] h-full w-2/3 animate-pulse"></div>
                </div>
                <button
                  onClick={handleCancelBooking}
                  title="Cancel current pick-up request"
                  className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-700 py-1.5 px-4 rounded-full border border-rose-200 hover:bg-rose-50 transition-colors uppercase flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Request</span>
                </button>
              </div>
            )}

            {(activeBooking.status === 'DRIVER_ASSIGNED' ||
              activeBooking.status === 'DRIVER_ARRIVING' ||
              activeBooking.status === 'DRIVER_ARRIVED' ||
              activeBooking.status === 'RIDE_STARTED') && (
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center justify-between bg-[#E3F2FD] border-2 border-[#0D47A1] p-3 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#0D47A1] rounded-xl flex items-center justify-center text-white font-black text-xs uppercase shadow-md">
                      <Bike className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
                        {activeBooking.status === 'DRIVER_ASSIGNED' && 'Driver Found!'}
                        {activeBooking.status === 'DRIVER_ARRIVING' && 'Driver Arriving'}
                        {activeBooking.status === 'DRIVER_ARRIVED' && 'Driver Has Arrived!'}
                        {activeBooking.status === 'RIDE_STARTED' && 'Trip in Progress'}
                      </div>
                      <div className="text-sm font-black text-[#0D47A1]">
                        {activeBooking.status === 'RIDE_STARTED'
                          ? 'En Route to Destination'
                          : 'Pickup Arrival in ~3 mins'}
                      </div>
                    </div>
                  </div>
                  {activeBooking.driverPhone && (
                    <a
                      href={`tel:${activeBooking.driverPhone}`}
                      title="Direct call driver"
                      className="px-3 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-bold text-xs rounded-xl shadow-md active:scale-95 transition-transform uppercase flex items-center gap-1.5 border border-[#0D47A1]"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>
                  )}
                </div>

                {/* Driver Info Card */}
                <div className="flex items-center justify-between bg-[#F8FAFC] border border-[#0D47A1]/40 p-3 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#0D47A1] text-white rounded-full flex items-center justify-center text-xl font-black shadow-sm">
                      {activeBooking.driverName?.charAt(0) || 'D'}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#0D47A1]">{activeBooking.driverName || 'E-Shuttle Driver'}</h4>
                      <p className="text-xs text-slate-500 font-medium">{sanitizeVehicleInfo(activeBooking.driverVehicleInfo)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-block bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                      Free Shuttle
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">{activeBooking.distanceKm} km trip</div>
                  </div>
                </div>

                {/* Pickup & Destination Summary */}
                <div className="space-y-2 text-xs bg-[#F8FAFC] p-3 rounded-xl border border-[#0D47A1]/40">
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">FROM</span>
                    <span className="text-slate-700 font-medium truncate">{activeBooking.pickup.address}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">TO</span>
                    <span className="text-slate-700 font-medium truncate">{activeBooking.destination.address}</span>
                  </div>
                </div>

                {/* Cancel option before ride starts */}
                {activeBooking.status !== 'RIDE_STARTED' && (
                  <button
                    onClick={handleCancelBooking}
                    title="Cancel pick-up request"
                    className="w-full text-xs font-bold text-slate-500 hover:text-rose-600 text-center py-1.5 transition-colors uppercase font-mono flex items-center justify-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Request</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : bookingStep === 'select_zone' ? (
        /* SEPARATE INITIAL STEP PAGE FOR ZONE SELECTION (Matching Image 2 Reference) */
        <div className="absolute bottom-20 left-0 right-0 z-20 max-w-md mx-auto px-4 pb-2 animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] rounded-3xl p-5 shadow-2xl space-y-4 text-[#0D47A1]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#0D47A1]" />
                  <h3 className="font-black text-base text-[#0D47A1] uppercase tracking-wide">
                    Select Operational Zone
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Choose your service area to view stations & request rides
                </p>
              </div>
              {isLocatingGps ? (
                <span className="text-[9px] bg-blue-50 text-[#0D47A1] border border-blue-200 px-2.5 py-1 rounded-full font-black flex items-center gap-1 shrink-0 animate-pulse">
                  <Compass className="w-3.5 h-3.5 text-[#0D47A1] animate-spin" />
                  <span>Locating...</span>
                </span>
              ) : hasGpsAcquired && detectedUserZone ? (
                <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full font-extrabold flex items-center gap-1 shrink-0">
                  <Compass className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span>GPS: {detectedUserZone.name}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleUseCurrentGpsLocation}
                  className="text-[9px] bg-[#E3F2FD] hover:bg-[#0D47A1] text-[#0D47A1] hover:text-white border border-[#0D47A1]/40 px-2.5 py-1 rounded-full font-black flex items-center gap-1 shrink-0 transition-all active:scale-95 shadow-sm"
                  title="Trigger GPS permission to detect your operational zone"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Detect Zone (GPS)</span>
                </button>
              )}
            </div>

            {/* Error Banner */}
            {bookingError && (
              <div className="bg-rose-50 border border-rose-300 text-rose-700 text-xs p-2.5 rounded-xl font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{bookingError}</span>
              </div>
            )}

            {/* Zone Cards List (Matching Image 2 Reference Layout) */}
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {zones.length === 0 ? (
                <div className="p-6 text-center bg-[#F8FAFC] rounded-2xl border border-dashed border-[#0D47A1]/30 text-xs text-slate-500 font-medium">
                  Loading operational zones...
                </div>
              ) : (
                zones.map((z) => {
                  const isGpsMatch = hasGpsAcquired && detectedUserZone?.id === z.id;
                  const stationCount = activeStations.filter((s) => s.zoneId === z.id).length;

                  return (
                    <div
                      key={z.id}
                      onClick={() => handleSelectZone(z.id)}
                      style={{ height: '100px' }}
                      className="group relative h-[100px] bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-[26px] p-4 sm:p-5 flex items-center justify-between shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all cursor-pointer border-2 border-[#0D47A1] overflow-hidden"
                    >
                      {/* Background subtle shine */}
                      <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-white/10 to-transparent pointer-events-none" />

                      {/* Left: Official Logo & Details */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] shrink-0 rounded-2xl bg-white p-0.5 flex items-center justify-center shadow-md border border-white/50 overflow-hidden">
                          <img
                            src={appLogo}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              markLogoUrlAsFailed(appLogo);
                              (e.target as HTMLImageElement).src = officialLogoFallback;
                            }}
                            alt="E-Shuttle Official Logo"
                            className="w-full h-full object-cover rounded-[14px]"
                          />
                        </div>

                        {/* Zone details */}
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-black text-base sm:text-lg text-white leading-tight truncate">
                              {z.name}
                            </h4>
                            {isGpsMatch && (
                              <span className="text-[8px] bg-emerald-400 text-emerald-950 font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 animate-pulse">
                                GPS Match
                              </span>
                            )}
                          </div>
                          <p className="text-blue-100 font-medium text-xs flex items-center gap-1 mt-1 italic">
                            <span className="text-[10px]" style={{ fontSize: '10px' }}>See available E-shuttle</span>
                            <span className="text-[10px] font-mono not-italic bg-white/20 px-1.5 py-0.2 rounded font-extrabold text-white">
                              ({stationCount} stops)
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Right: Circular Arrow Action Button */}
                      <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center text-[#0D47A1] shrink-0 shadow-md group-hover:translate-x-1 transition-transform">
                        <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* BOOKING SELECTION SHEET (STEP 2: STATIONS & CONFIRMATION) */
        <div className="absolute bottom-20 left-0 right-0 z-20 max-w-md mx-auto px-4 pb-2 animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] rounded-3xl p-4 shadow-2xl space-y-3 text-[#0D47A1]">
            {/* Active Zone Header Banner */}
            <div className="flex items-center justify-between bg-[#E3F2FD] border-2 border-[#0D47A1] p-3 rounded-2xl">
              <div className="flex items-center gap-2 overflow-hidden">
                <Layers className="w-4 h-4 text-[#0D47A1] shrink-0" />
                <div className="truncate">
                  <span className="text-[9px] font-black text-[#0D47A1]/70 uppercase block leading-none">Operational Zone</span>
                  <span className="text-sm font-black text-[#0D47A1] truncate">{activeZoneObj?.name || 'Selected Zone'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBookingStep('select_zone')}
                className="px-3 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white text-[10px] font-black uppercase rounded-xl border border-[#0D47A1] shrink-0 shadow-sm transition-all active:scale-95 flex items-center gap-1"
              >
                <span>Change Zone</span>
              </button>
            </div>

            {/* Error Banner */}
            {bookingError && (
              <div className="bg-rose-50 border border-rose-300 text-rose-700 text-xs p-2.5 rounded-xl font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{bookingError}</span>
              </div>
            )}

            {/* PICKUP GEOFENCE PROXIMITY WARNING IF FAR FROM PINNED STATIONS */}
            {!proximityCheck.isWithinRadius && (
              <div className="bg-amber-50 border-2 border-amber-400 p-3 rounded-2xl space-y-2 animate-in slide-in-from-bottom duration-200">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-black block uppercase text-amber-800">Pick-up Outside Shuttle Service Zone</span>
                    <span className="font-medium text-amber-700">
                      Pick-up is <b>{formattedDistanceToNearest}</b> from nearest station in {activeZoneObj?.name || 'Zone'} (<b>{proximityCheck.nearestStation?.name || 'Central Terminal'}</b>).
                    </span>
                  </div>
                </div>

                {proximityCheck.nearestStation && (
                  <button
                    type="button"
                    onClick={handleSnapToNearestStation}
                    className="w-full py-1.5 px-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Tag Nearest Station in {activeZoneObj?.name || 'Zone'} ({proximityCheck.nearestStation.name})</span>
                  </button>
                )}
              </div>
            )}

            {/* DESTINATION GEOFENCE PROXIMITY WARNING IF FAR FROM PINNED STATIONS */}
            {destination && destinationProximityCheck && !destinationProximityCheck.isWithinRadius && (
              <div className="bg-amber-50 border-2 border-amber-400 p-3 rounded-2xl space-y-2 animate-in slide-in-from-bottom duration-200">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-black block uppercase text-amber-800">Drop-off Outside Station Radius</span>
                    <span className="font-medium text-amber-700">
                      Destination is <b>{formattedDistanceToNearestDest}</b> from designated stop (<b>{destinationProximityCheck.nearestStation?.name || 'Nearest Station'}</b>).
                    </span>
                  </div>
                </div>

                {destinationProximityCheck.nearestStation && (
                  <button
                    type="button"
                    onClick={handleSnapToNearestDestStation}
                    className="w-full py-1.5 px-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Tag Nearest Drop-off Station ({destinationProximityCheck.nearestStation.name})</span>
                  </button>
                )}
              </div>
            )}

            {/* IN-ZONE SUCCESS BADGE */}
            {hasGpsAcquired && proximityCheck.isWithinRadius && proximityCheck.nearestStation && (!destination || destinationProximityCheck?.isWithinRadius) && (
              <div className="bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl flex items-center justify-between text-[10px] text-emerald-800 font-bold">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Verified Location in {activeZoneObj?.name || 'Zone'} ({proximityCheck.nearestStation.name})</span>
                </div>
                <span className="text-[9px] bg-emerald-200/80 px-2 py-0.5 rounded-md font-mono">
                  {proximityCheck.distanceMeters}m away
                </span>
              </div>
            )}

            {/* STEP 2: PICKUP LOCATION SELECTOR */}
            <div className="bg-[#F8FAFC] rounded-2xl p-3 border border-[#0D47A1]/40 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                  <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-1 rounded uppercase shrink-0">FROM</span>
                  <div className="overflow-hidden">
                    <div className="text-[10px] uppercase font-extrabold text-[#0D47A1] tracking-wider">
                      Step 2: Pickup Station ({activeZoneObj?.name || 'Selected Zone'})
                    </div>
                    <div className="text-xs font-bold text-[#0D47A1] truncate">{pickup.address}</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Choose Station vs GPS vs Map */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-[#0D47A1]/30">
                <button
                  type="button"
                  onClick={() => setShowPickupModal(true)}
                  title="Choose from official designated stations under this zone"
                  className="flex-1 py-1.5 px-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-1 uppercase shadow-sm transition-all active:scale-95"
                >
                  <Layers className="w-3.5 h-3.5 text-white" />
                  <span>Choose Station</span>
                </button>

                <button
                  type="button"
                  onClick={handleUseCurrentGpsLocation}
                  disabled={isLocatingGps}
                  title="Use my phone GPS location"
                  className="py-1.5 px-2.5 bg-white hover:bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-1 shadow-sm"
                >
                  <Crosshair className="w-3.5 h-3.5 text-current" />
                  <span>GPS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSelectingOnMap('pickup')}
                  title="Select pick-up station directly on map"
                  className="py-1.5 px-2.5 bg-white hover:bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-1 shadow-sm"
                >
                  <MapPin className="w-3.5 h-3.5 text-current" />
                  <span>Map</span>
                </button>
              </div>
            </div>

            {/* DESTINATION SELECTOR */}
            <div
              onClick={() => setShowDestinationModal(true)}
              title="Select your drop-off designated station"
              className="bg-[#F8FAFC] hover:bg-[#E3F2FD] rounded-2xl p-3 border border-[#0D47A1]/40 flex items-center justify-between gap-2 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-1 rounded uppercase shrink-0">TO</span>
                <div className="overflow-hidden">
                  <div className="text-[10px] uppercase font-extrabold text-[#0D47A1] tracking-wider">
                    Destination Station ({activeZoneObj?.name || 'Selected Zone'})
                  </div>
                  <div className="text-xs font-bold text-[#0D47A1] truncate">
                    {destination ? destination.address : `Select Destination Station in ${activeZoneObj?.name || 'Zone'}...`}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-white bg-[#0D47A1] border border-[#0D47A1] px-2.5 py-1 rounded-xl uppercase flex items-center gap-1">
                <Search className="w-3 h-3 text-white" />
                <span>Choose</span>
              </span>
            </div>

            {/* Route & Shuttle Preview Card */}
            {destination && (
              <div className="bg-[#E3F2FD] border-2 border-[#0D47A1] rounded-2xl p-3 flex items-center justify-between text-[#0D47A1] animate-in fade-in duration-200">
                <div className="space-y-0.5">
                  <div className="inline-block bg-white text-[#0D47A1] border border-[#0D47A1] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    Complimentary Shuttle
                  </div>
                  <div className="text-base font-black text-[#0D47A1]">Free Ride</div>
                  <div className="text-[10px] text-slate-600 font-medium">Designated Route Transit</div>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="text-xs font-black text-[#0D47A1]">{distanceKm} km distance</div>
                  <div className="text-[11px] text-[#0D47A1] font-bold">~{estMinutes} mins trip</div>
                </div>
              </div>
            )}

            {/* Confirm Book Ride Button (Disabled if outside proximity radius for pickup or drop-off, or no destination) */}
            <button
              onClick={handleConfirmBooking}
              disabled={
                !destination ||
                isBookingLoading ||
                !proximityCheck.isWithinRadius ||
                (destinationProximityCheck !== null && !destinationProximityCheck.isWithinRadius)
              }
              title={
                !proximityCheck.isWithinRadius
                  ? 'Booking disabled: Pick-up must be within a designated shuttle station area'
                  : destinationProximityCheck && !destinationProximityCheck.isWithinRadius
                  ? 'Booking disabled: Drop-off must be within a designated shuttle station area'
                  : !destination
                  ? 'Please select a destination station'
                  : 'Request complimentary E-Shuttle pick-up and drop-off'
              }
              className={`w-full py-3.5 rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                destination &&
                !isBookingLoading &&
                proximityCheck.isWithinRadius &&
                (!destinationProximityCheck || destinationProximityCheck.isWithinRadius)
                  ? 'bg-[#0D47A1] hover:bg-[#1565C0] text-white shadow-blue-900/30 border border-[#0D47A1]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
              }`}
            >
              <Send className="w-4 h-4" />
              {isBookingLoading ? (
                <span>Requesting Shuttle...</span>
              ) : !proximityCheck.isWithinRadius ? (
                <span>Pick-up Outside Service Zone</span>
              ) : destination && destinationProximityCheck && !destinationProximityCheck.isWithinRadius ? (
                <span>Drop-off Outside Station Radius</span>
              ) : (
                <span>{destination ? 'Request Pick-up' : 'Select Destination Station'}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* PICKUP STATION SELECTION MODAL */}
      {showPickupModal && (
        <div className="fixed inset-0 z-50 bg-[#0D47A1]/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl w-full max-w-md p-5 space-y-3.5 max-h-[85vh] flex flex-col shadow-2xl text-[#0D47A1]">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div>
                <h3 className="text-base font-black text-[#0D47A1] flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#0D47A1]" />
                  <span>Select Pick-up Station</span>
                </h3>
                {activeZoneObj && (
                  <div className="text-[10px] text-emerald-800 font-bold flex items-center gap-1 mt-0.5">
                    <Crosshair className="w-3 h-3 text-emerald-600 animate-pulse" />
                    <span>Active Zone: <b>{activeZoneObj.name}</b></span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowPickupModal(false)}
                className="text-[#0D47A1] hover:bg-[#0D47A1] hover:text-white px-2.5 py-1 rounded-lg bg-[#E3F2FD] text-xs font-bold uppercase flex items-center gap-1 border border-[#0D47A1] transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>

            {/* STEP 1: OPERATIONAL ZONE SELECTOR */}
            {zones.length > 0 && (
              <div className="space-y-1 bg-[#E3F2FD]/60 p-2.5 rounded-2xl border border-[#0D47A1]/30">
                <div className="flex items-center justify-between text-[10px] font-black text-[#0D47A1] uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-[#0D47A1]" />
                    <span>Step 1: Select Operational Zone</span>
                  </span>
                  <span className="text-[#0D47A1] font-extrabold">{filteredPickupStations.length} Stops Available</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {zones.map((z) => {
                    const isDetected = detectedUserZone?.id === z.id;
                    const isSelected = effectiveZoneId === z.id;
                    const count = activeStations.filter((s) => s.zoneId === z.id).length;

                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => handleSelectZone(z.id)}
                        className={`px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase shrink-0 transition-all border flex items-center gap-1.5 active:scale-95 ${
                          isSelected
                            ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                            : isDetected
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-400 font-black'
                            : 'bg-white text-[#0D47A1] border-[#0D47A1]/30 hover:bg-[#E3F2FD]'
                        }`}
                      >
                        {isDetected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />}
                        <span>{z.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-[#E3F2FD] text-[#0D47A1]'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder={`Search stations in ${activeZoneObj?.name || 'Zone'}...`}
                value={pickupSearch}
                onChange={(e) => setPickupSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs text-[#0D47A1] font-bold placeholder-slate-400 focus:outline-none"
              />
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                Step 2: Choose Pickup Station ({activeZoneObj?.name || 'Selected Zone'})
              </div>

              {filteredPickupStations.length === 0 ? (
                <div className="p-4 text-center bg-[#F8FAFC] rounded-2xl border border-dashed border-[#0D47A1]/30 text-xs text-slate-500 font-medium">
                  No stations found in this zone. Try selecting another zone above.
                </div>
              ) : (
                filteredPickupStations.map((st) => {
                  const distMeters = pickup.latitude && pickup.longitude ? calculateDistanceMeters(pickup.latitude, pickup.longitude, st.latitude, st.longitude) : null;
                  const formattedDist = distMeters !== null ? (distMeters >= 1000 ? `${(distMeters / 1000).toFixed(1)} km` : `${distMeters}m away`) : null;

                  return (
                    <button
                      key={st.id}
                      onClick={() => {
                        setPickup({
                          latitude: st.latitude,
                          longitude: st.longitude,
                          address: `${st.name} (${st.address})`,
                        });
                        setBookingError(null);
                        setShowPickupModal(false);
                      }}
                      className="w-full text-left p-3 rounded-2xl bg-[#F8FAFC] hover:bg-[#E3F2FD] border border-[#0D47A1]/30 hover:border-[#0D47A1] flex items-start gap-3 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#E3F2FD] border border-[#0D47A1] flex items-center justify-center text-[#0D47A1] shrink-0 group-hover:bg-[#0D47A1] group-hover:text-white transition-colors">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <div className="text-sm font-bold text-[#0D47A1] truncate">{st.name}</div>
                          <div className="flex items-center gap-1 shrink-0">
                            {formattedDist && (
                              <span className="text-[9px] font-mono font-extrabold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded">
                                {formattedDist}
                              </span>
                            )}
                            <span className="text-[9px] font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase">
                              {st.category || 'Stop'}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 truncate">{st.address}</div>
                        {st.description && <div className="text-[10px] text-slate-400 italic truncate mt-0.5">{st.description}</div>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <button
              onClick={() => {
                setShowPickupModal(false);
                setIsSelectingOnMap('pickup');
              }}
              className="w-full py-3 rounded-2xl bg-[#0D47A1] hover:bg-[#1565C0] text-white border border-[#0D47A1] font-black text-xs uppercase flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              <Crosshair className="w-4 h-4 text-white" />
              <span>Tap Station Pin on Map</span>
            </button>
          </div>
        </div>
      )}

      {/* DESTINATION SELECTION MODAL */}
      {showDestinationModal && (
        <div className="fixed inset-0 z-50 bg-[#0D47A1]/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl w-full max-w-md p-5 space-y-3.5 max-h-[85vh] flex flex-col shadow-2xl text-[#0D47A1]">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div>
                <h3 className="text-base font-black text-[#0D47A1] flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#0D47A1]" />
                  <span>Select Destination Station</span>
                </h3>
                {activeZoneObj && (
                  <div className="text-[10px] text-emerald-800 font-bold flex items-center gap-1 mt-0.5">
                    <Crosshair className="w-3 h-3 text-emerald-600 animate-pulse" />
                    <span>Active Zone: <b>{activeZoneObj.name}</b></span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowDestinationModal(false)}
                className="text-[#0D47A1] hover:bg-[#0D47A1] hover:text-white px-2.5 py-1 rounded-lg bg-[#E3F2FD] text-xs font-bold uppercase flex items-center gap-1 border border-[#0D47A1] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>

            {/* STEP 1: OPERATIONAL ZONE SELECTOR */}
            {zones.length > 0 && (
              <div className="space-y-1 bg-[#E3F2FD]/60 p-2.5 rounded-2xl border border-[#0D47A1]/30">
                <div className="flex items-center justify-between text-[10px] font-black text-[#0D47A1] uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-[#0D47A1]" />
                    <span>Step 1: Select Operational Zone</span>
                  </span>
                  <span className="text-[#0D47A1] font-extrabold">{filteredDestinationStations.length} Stops Available</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {zones.map((z) => {
                    const isDetected = detectedUserZone?.id === z.id;
                    const isSelected = effectiveZoneId === z.id;
                    const count = activeStations.filter((s) => s.zoneId === z.id).length;

                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => handleSelectZone(z.id)}
                        className={`px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase shrink-0 transition-all border flex items-center gap-1.5 active:scale-95 ${
                          isSelected
                            ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                            : isDetected
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-400 font-black'
                            : 'bg-white text-[#0D47A1] border-[#0D47A1]/30 hover:bg-[#E3F2FD]'
                        }`}
                      >
                        {isDetected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />}
                        <span>{z.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-[#E3F2FD] text-[#0D47A1]'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder={`Search destination stations in ${activeZoneObj?.name || 'Zone'}...`}
                value={destinationSearch}
                onChange={(e) => setDestinationSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs text-[#0D47A1] font-bold placeholder-slate-400 focus:outline-none"
              />
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                Step 2: Choose Destination Station ({activeZoneObj?.name || 'Selected Zone'})
              </div>

              {filteredDestinationStations.length === 0 ? (
                <div className="p-4 text-center bg-[#F8FAFC] rounded-2xl border border-dashed border-[#0D47A1]/30 text-xs text-slate-500 font-medium">
                  No destination stations found in this zone. Try selecting another zone above.
                </div>
              ) : (
                filteredDestinationStations.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => {
                      setDestination({
                        latitude: st.latitude,
                        longitude: st.longitude,
                        address: `${st.name} (${st.address})`,
                      });
                      setShowDestinationModal(false);
                    }}
                    className="w-full text-left p-3 rounded-2xl bg-[#F8FAFC] hover:bg-[#E3F2FD] border border-[#0D47A1]/30 hover:border-[#0D47A1] flex items-start gap-3 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[#E3F2FD] border border-[#0D47A1] flex items-center justify-center text-[#0D47A1] shrink-0 group-hover:bg-[#0D47A1] group-hover:text-white transition-colors">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-sm font-bold text-[#0D47A1] truncate">{st.name}</div>
                        <span className="text-[9px] font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase">
                          {st.category || 'Stop'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">{st.address}</div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => {
                setShowDestinationModal(false);
                setIsSelectingOnMap('destination');
              }}
              className="w-full py-3 rounded-2xl bg-[#0D47A1] hover:bg-[#1565C0] text-white border border-[#0D47A1] font-black text-xs uppercase flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              <Crosshair className="w-4 h-4 text-white" />
              <span>Tap Station Pin on Map</span>
            </button>
          </div>
        </div>
      )}

      {/* RIDE COMPLETED RATING MODAL */}
      {showRatingModal && (
        <div className="fixed inset-0 z-50 bg-[#0D47A1]/25 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl w-full max-w-md p-6 space-y-4 text-center shadow-2xl text-[#0D47A1]">
            <div className="w-16 h-16 bg-[#E3F2FD] border-2 border-[#0D47A1] rounded-full flex items-center justify-center mx-auto text-[#0D47A1]">
              <CheckCircle2 className="w-8 h-8 text-[#0D47A1]" />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#0D47A1]">Trip Completed!</h3>
              <p className="text-xs text-slate-500 font-medium">How was your E-Shuttle journey with {completedBookingToRate?.driverName}?</p>
            </div>

            {/* Stars Selector */}
            <div className="flex items-center justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingValue(star)}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 border ${
                    star <= ratingValue
                      ? 'bg-amber-400 text-[#0D47A1] border-amber-500 font-extrabold shadow-sm'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  <span>{star}</span>
                  <Star className="w-3.5 h-3.5 fill-current" />
                </button>
              ))}
            </div>

            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Leave feedback for driver (optional)..."
              rows={3}
              className="w-full bg-[#F8FAFC] border border-[#0D47A1]/60 rounded-2xl p-3 text-xs text-[#0D47A1] placeholder-slate-400 focus:outline-none focus:border-[#0D47A1] focus:bg-white"
            />

            <button
              onClick={handleRatingSubmit}
              title="Submit feedback and rating for your driver"
              className="w-full py-3.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 border border-[#0D47A1]"
            >
              <Send className="w-4 h-4" />
              <span>Submit Rating</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
