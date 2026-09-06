import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MapView } from '../MapView';
import { Booking, DriverAvailability, LocationPoint } from '../../types';
import {
  Power,
  CheckCircle2,
  Play,
  CheckSquare,
  Zap,
  Phone,
  Bike,
  Info,
  X,
} from 'lucide-react';
import {
  listenToNearbySearchingBookings,
  listenToDriverActiveBooking,
  acceptBookingAtomic,
  updateBookingStatus,
  updateDriverLocation,
} from '../../services/bookingService';
import { updateEBikeGpsLocation } from '../../services/ebikeService';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from '../../services/logoService';
import { sanitizeVehicleInfo } from '../../utils/sanitizeVehicle';

export const DriverHome: React.FC = () => {
  const { driverProfile, currentUser, logout } = useAuth();
  const { logoUrl: appLogo } = useAppLogo();

  const [availability, setAvailability] = useState<DriverAvailability>(
    driverProfile?.availability || 'OFFLINE'
  );
  const [nearbyRequests, setNearbyRequests] = useState<Booking[]>([]);
  const [activeRide, setActiveRide] = useState<Booking | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState<boolean>(false);

  // Sync driver profile state
  useEffect(() => {
    if (driverProfile) {
      setAvailability(driverProfile.availability);
    }
  }, [driverProfile]);

  // 0. Auto-reconcile & disconnect if active E-Shuttle was taken over by another driver
  useEffect(() => {
    if (!currentUser || !driverProfile?.activeEbikeId) return;

    const ebikeRef = doc(db, 'ebikes', driverProfile.activeEbikeId);
    const unsub = onSnapshot(
      ebikeRef,
      async (snap) => {
        if (snap.exists()) {
          const bikeData = snap.data();
          if (bikeData.currentDriverId && bikeData.currentDriverId !== currentUser.uid) {
            // E-Shuttle has been taken over by another driver
            await updateDoc(doc(db, 'drivers', currentUser.uid), {
              activeEbikeId: null,
              availability: 'OFFLINE',
              vehicleInfo: 'Unassigned E-Shuttle',
              disconnectNotice: `Disconnected from ${bikeData.name || 'E-Shuttle'}: Vehicle was taken over by another driver.`,
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          await updateDoc(doc(db, 'drivers', currentUser.uid), {
            activeEbikeId: null,
            availability: 'OFFLINE',
            vehicleInfo: 'Unassigned E-Shuttle',
            updatedAt: serverTimestamp(),
          });
        }
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Error monitoring ebike takeover:', err);
        }
      }
    );

    return () => unsub();
  }, [currentUser, driverProfile?.activeEbikeId]);

  // 1. Subscribe to active ride assigned to this driver
  useEffect(() => {
    if (!currentUser) return;
    const unsub = listenToDriverActiveBooking(currentUser.uid, (booking) => {
      setActiveRide(booking);
      if (booking) {
        setAvailability('BUSY');
      }
    });
    return () => unsub();
  }, [currentUser]);

  // 2. Subscribe to nearby searching requests when driver is ONLINE and approved
  useEffect(() => {
    if (!driverProfile || driverProfile.accountStatus !== 'APPROVED' || availability !== 'ONLINE' || activeRide) {
      setNearbyRequests([]);
      return;
    }

    const unsub = listenToNearbySearchingBookings(
      driverProfile.currentLocation,
      5, // 5 km search radius
      (bookings) => {
        setNearbyRequests(bookings);
      },
      driverProfile.zoneId
    );

    return () => unsub();
  }, [driverProfile, availability, activeRide]);

  // 3. Periodic driver / e-shuttle location update & automatic device GPS watch
  useEffect(() => {
    if (!navigator.geolocation || !currentUser) return;

    const handleDriverGpsSuccess = async (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      if (availability === 'ONLINE' && driverProfile) {
        try {
          if (driverProfile.activeEbikeId) {
            await updateEBikeGpsLocation(driverProfile.activeEbikeId, latitude, longitude, 22);
          } else {
            const updatedPoint: LocationPoint = {
              latitude,
              longitude,
              address: driverProfile.currentLocation?.address || 'Live Driver GPS Location',
            };
            await updateDriverLocation(currentUser.uid, updatedPoint, activeRide?.id);
          }
        } catch (err) {
          console.error('Error updating driver live GPS:', err);
        }
      }
    };

    navigator.geolocation.getCurrentPosition(handleDriverGpsSuccess, () => {}, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    const watchId = navigator.geolocation.watchPosition(handleDriverGpsSuccess, () => {}, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentUser, availability, driverProfile, activeRide?.id]);

  // Toggle Online/Offline State
  const handleToggleOnline = async () => {
    if (!currentUser || !driverProfile) return;
    setActionError(null);

    const nextState: DriverAvailability = availability === 'OFFLINE' ? 'ONLINE' : 'OFFLINE';
    try {
      await updateDoc(doc(db, 'drivers', currentUser.uid), {
        availability: nextState,
        updatedAt: serverTimestamp(),
      });
      setAvailability(nextState);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update availability.');
    }
  };

  // Handle Accepting Ride (Atomic Transaction)
  const handleAcceptRide = async (booking: Booking) => {
    if (!driverProfile || !booking.id) return;
    setAcceptingId(booking.id);
    setActionError(null);

    try {
      await acceptBookingAtomic(booking.id, driverProfile);
      setAvailability('BUSY');
    } catch (err: any) {
      console.error('Accept booking failed:', err);
      setActionError(err.message || 'Ride already accepted by another driver.');
    } finally {
      setAcceptingId(null);
    }
  };

  // Driver Ride Lifecycle Actions
  const handleDriverAction = async (newStatus: 'DRIVER_ARRIVED' | 'RIDE_STARTED' | 'COMPLETED') => {
    if (!activeRide || !activeRide.id) return;
    setStatusUpdating(true);
    setActionError(null);

    try {
      await updateBookingStatus(activeRide.id, newStatus, currentUser?.uid);
      if (newStatus === 'COMPLETED') {
        setAvailability('ONLINE');
        setActiveRide(null);
      }
    } catch (err: any) {
      console.error('Error updating ride status:', err);
      setActionError(err.message || 'Failed to update ride status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  // PENDING VERIFICATION SCREEN
  if (driverProfile?.accountStatus === 'PENDING') {
    return (
      <div className="min-h-full bg-[#E3F2FD] text-[#0D47A1] p-6 flex flex-col items-center justify-center text-center space-y-5">
        <div className="w-16 h-16 bg-white border-2 border-[#0D47A1] rounded-full flex items-center justify-center text-[#0D47A1] font-bold text-xs uppercase shadow-md">
          WAIT
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-black text-[#0D47A1]">Application Pending Approval</h2>
          <p className="text-xs text-slate-600 font-medium">
            Your e-shuttle driver account has been created and is currently awaiting administrator review. Once approved by the administrator, you will be able to go online and accept requests.
          </p>
        </div>
        <button
          onClick={() => logout()}
          className="mt-4 px-6 py-2.5 bg-white hover:bg-slate-50 text-[#0D47A1] border-2 border-[#0D47A1] rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all active:scale-95"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-[#E3F2FD] overflow-hidden select-none">
      {/* Top Driver Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 pointer-events-none">
        <div className="flex items-center justify-between gap-2 pointer-events-auto max-w-md mx-auto w-full">
          {/* Driver Profile & Status Pill (Click/Tap for Full Details Tooltip) */}
          <div
            onClick={() => setShowInfoTooltip((prev) => !prev)}
            title="Tap to view vehicle, zone & RFID details"
            className="flex items-center gap-2 bg-white/95 border-2 border-[#0D47A1] backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg min-w-0 flex-1 cursor-pointer hover:bg-slate-50 transition-all active:scale-[0.98]"
          >
            <img
              src={appLogo}
              onError={(e) => {
                markLogoUrlAsFailed(appLogo);
                (e.target as HTMLImageElement).src = officialLogoFallback;
              }}
              alt="E-Shuttle Official Logo"
              className="w-7 h-7 rounded-full object-cover border border-[#0D47A1] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <h1 className="text-xs font-black text-[#0D47A1] leading-none truncate">
                  {driverProfile?.fullName || 'Driver'}
                </h1>
                <Info className="w-3 h-3 text-[#0D47A1]/70 shrink-0" />
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-[10px] text-[#0D47A1] font-bold truncate">
                  {driverProfile?.zoneName
                    ? `📍 ${driverProfile.zoneName}`
                    : sanitizeVehicleInfo(driverProfile?.vehicleInfo)}
                </p>
                {driverProfile?.activeEbikeId ? (
                  <span className="text-[8px] font-black bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] px-1 rounded uppercase shrink-0">
                    GPS
                  </span>
                ) : (
                  <span className="text-[8px] font-bold bg-amber-50 text-amber-800 border border-amber-300 px-1 rounded uppercase shrink-0">
                    RFID
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ONLINE / OFFLINE TOGGLE BUTTON */}
          <button
            onClick={handleToggleOnline}
            disabled={availability === 'BUSY'}
            className={`shrink-0 px-3.5 py-1.5 rounded-full font-black text-xs shadow-lg backdrop-blur transition-transform active:scale-95 uppercase flex items-center gap-1.5 border-2 ${
              availability === 'ONLINE'
                ? 'bg-emerald-600 text-white border-emerald-700'
                : availability === 'BUSY'
                ? 'bg-[#0D47A1] text-white border-[#0D47A1] cursor-not-allowed'
                : 'bg-white text-[#0D47A1] border-[#0D47A1]'
            }`}
          >
            <Power className="w-3.5 h-3.5 shrink-0" />
            <span>{availability}</span>
          </button>
        </div>

        {/* Floating Interactive Tooltip Popover */}
        {showInfoTooltip && (
          <div className="mt-2.5 pointer-events-auto max-w-md mx-auto bg-white border-2 border-[#0D47A1] rounded-2xl p-3.5 shadow-2xl text-xs space-y-2.5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-2">
              <div className="flex items-center gap-1.5 font-black text-[#0D47A1]">
                <Info className="w-4 h-4 text-[#0D47A1]" />
                <span>Vehicle & Operating Zone Details</span>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoTooltip(false)}
                className="p-1 text-slate-400 hover:text-[#0D47A1] hover:bg-[#E3F2FD] rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500 text-[10px] uppercase">Driver Name:</span>
                <span className="font-black text-[#0D47A1]">{driverProfile?.fullName || 'Driver'}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500 text-[10px] uppercase">Assigned Vehicle:</span>
                <span className="font-bold text-[#0D47A1]">
                  {sanitizeVehicleInfo(driverProfile?.vehicleInfo)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500 text-[10px] uppercase">Operational Zone:</span>
                <span className="font-bold text-[#0D47A1] flex items-center gap-1">
                  {driverProfile?.zoneName ? `📍 ${driverProfile.zoneName}` : 'All Operational Zones'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                <span className="font-bold text-slate-500 text-[10px] uppercase">Hardware Linking:</span>
                {driverProfile?.activeEbikeId ? (
                  <span className="text-[10px] font-black bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] px-2 py-0.5 rounded-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-[#0D47A1] rounded-full animate-pulse"></span>
                    <span>GPS LINKED</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-md">
                    SWIPE RFID CARD TO LINK
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Map View */}
      <div className="flex-1 w-full h-full">
        <MapView
          pickup={activeRide?.pickup || null}
          destination={activeRide?.destination || null}
          driverLocation={driverProfile?.currentLocation || null}
          rideStatus={activeRide?.status}
          showNavigationBanner={!!activeRide}
          className="w-full h-full"
        />
      </div>

      {/* DRIVER BOTTOM CONTROL SHEET */}
      <div className="absolute bottom-20 left-0 right-0 z-20 max-w-md mx-auto px-4 pb-2">
        {driverProfile?.disconnectNotice && (
          <div className="mb-2 bg-amber-50 border-2 border-amber-400 text-amber-900 text-xs p-3.5 rounded-2xl shadow-xl flex items-center justify-between gap-2 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping shrink-0"></span>
              <span className="font-bold leading-tight">{driverProfile.disconnectNotice}</span>
            </div>
            <button
              onClick={async () => {
                if (currentUser) {
                  await updateDoc(doc(db, 'drivers', currentUser.uid), {
                    disconnectNotice: null,
                  });
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] px-2.5 py-1.5 rounded-xl uppercase tracking-wider shrink-0 shadow-sm"
            >
              DISMISS
            </button>
          </div>
        )}

        {actionError && (
          <div className="mb-2 bg-rose-50 border border-rose-300 text-rose-700 text-xs p-3 rounded-2xl flex items-center justify-between font-medium">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-800 font-bold text-xs uppercase">
              DISMISS
            </button>
          </div>
        )}

        {/* ACTIVE RIDE NAVIGATION STEP CONTROLS */}
        {activeRide ? (
          <div className="bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] rounded-3xl p-5 shadow-2xl space-y-4 text-[#0D47A1]">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/30 pb-3">
              <div>
                <span className="text-[10px] font-extrabold text-[#0D47A1] uppercase tracking-wider">
                  {activeRide.status === 'DRIVER_ASSIGNED' && 'Step 1: Heading to Pickup'}
                  {activeRide.status === 'DRIVER_ARRIVED' && 'Step 2: User Waiting at Pickup'}
                  {activeRide.status === 'RIDE_STARTED' && 'Step 3: En Route to Destination'}
                </span>
                <h3 className="text-base font-black text-[#0D47A1]">{activeRide.customerName || 'User'}</h3>
              </div>
              <div className="text-right">
                <div className="inline-block bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                  Free Shuttle
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">{activeRide.distanceKm} km</div>
              </div>
            </div>

            {/* Addresses */}
            <div className="space-y-2 text-xs bg-[#F8FAFC] p-3 rounded-2xl border border-[#0D47A1]/40">
              <div className="flex items-start gap-2">
                <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">FROM</span>
                <div>
                  <span className="text-[10px] text-[#0D47A1] font-bold block">PICKUP LOCATION</span>
                  <span className="text-slate-700 font-medium">{activeRide.pickup.address}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 pt-1 border-t border-[#0D47A1]/30">
                <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">TO</span>
                <div>
                  <span className="text-[10px] text-[#0D47A1] font-bold block">DESTINATION</span>
                  <span className="text-slate-700 font-medium">{activeRide.destination.address}</span>
                </div>
              </div>
            </div>

            {/* STEP BUTTON CONTROLS */}
            {activeRide.status === 'DRIVER_ASSIGNED' && (
              <button
                onClick={() => handleDriverAction('DRIVER_ARRIVED')}
                disabled={statusUpdating}
                title="Notify user that driver has arrived at the pick-up location"
                className="w-full py-3.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform uppercase border border-[#0D47A1]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{statusUpdating ? 'Updating...' : 'Arrived at Pick-up'}</span>
              </button>
            )}

            {activeRide.status === 'DRIVER_ARRIVED' && (
              <button
                onClick={() => handleDriverAction('RIDE_STARTED')}
                disabled={statusUpdating}
                title="Confirm user boarded and start the drop-off trip"
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform uppercase border border-emerald-700"
              >
                <Play className="w-4 h-4" />
                <span>{statusUpdating ? 'Starting...' : 'Start Trip'}</span>
              </button>
            )}

            {activeRide.status === 'RIDE_STARTED' && (
              <button
                onClick={() => handleDriverAction('COMPLETED')}
                disabled={statusUpdating}
                title="Complete trip upon arrival at destination"
                className="w-full py-3.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform uppercase border border-[#0D47A1]"
              >
                <CheckSquare className="w-4 h-4" />
                <span>{statusUpdating ? 'Completing...' : 'Complete Drop-off'}</span>
              </button>
            )}
          </div>
        ) : availability === 'ONLINE' ? (
          /* NEARBY RIDE REQUESTS LIST */
          <div className="bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] rounded-3xl p-4 shadow-2xl space-y-3 text-[#0D47A1]">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-[#0D47A1] rounded-full animate-ping"></span>
                <h3 className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
                  Nearby Pick-up Requests ({nearbyRequests.length})
                </h3>
              </div>
            </div>

            {nearbyRequests.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs space-y-2">
                <div className="font-mono text-[#0D47A1] font-bold uppercase tracking-widest text-xs animate-pulse">RADAR SCANNING</div>
                <p className="font-medium">Scanning for nearby user pick-up requests...</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {nearbyRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-2xl p-3 space-y-3 shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-[#0D47A1]">{req.customerName || 'User'}</h4>
                        <div className="text-[10px] text-[#0D47A1] font-bold">{req.distanceKm} km trip</div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                          Free Shuttle
                        </span>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">~{req.estimatedDurationMinutes} mins</div>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-[#0D47A1]/40">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1 py-0.5 rounded uppercase shrink-0">FROM</span>
                        <span className="truncate font-medium">{req.pickup.address}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1 py-0.5 rounded uppercase shrink-0">TO</span>
                        <span className="truncate font-medium">{req.destination.address}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAcceptRide(req)}
                      disabled={acceptingId === req.id}
                      title="Accept this user pick-up and drop-off request"
                      className="w-full py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl font-black text-xs shadow-md flex items-center justify-center gap-2 active:scale-95 transition-transform uppercase border border-[#0D47A1]"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{acceptingId === req.id ? 'Assigning...' : 'Accept Request'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* OFFLINE BANNER */
          <div className="bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] rounded-3xl p-5 shadow-2xl text-center space-y-3 text-[#0D47A1]">
            <p className="text-xs text-slate-600 font-medium">You are currently <b className="text-[#0D47A1]">OFFLINE</b>.</p>
            <button
              onClick={handleToggleOnline}
              title="Go online to start receiving pick-up and drop-off requests from users"
              className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-2xl shadow-lg flex items-center justify-center gap-2 uppercase tracking-wider border border-[#0D47A1]"
            >
              <Power className="w-4 h-4" />
              <span>Receive Shuttle Requests</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
