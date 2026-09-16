import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationBellButton } from '../Common/NotificationBellButton';
import { ShieldAlert, CheckCircle2, ChevronRight } from 'lucide-react';
import {
  IncidentTicket,
  TripSnapshotInfo,
  subscribeToTickets,
  openSupportTicketsModal,
} from '../../services/ticketService';
import { ReportIncidentModal } from '../Common/ReportIncidentModal';

export const DriverRides: React.FC = () => {
  const { currentUser, driverProfile, role } = useAuth();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tickets, setTickets] = useState<IncidentTicket[]>([]);

  // Trip reporting state
  const [reportingRide, setReportingRide] = useState<any | null>(null);

  // Subscribe to driver's tickets
  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeToTickets(currentUser.uid, role || 'driver', (list) => {
      setTickets(list);
    });
    return () => unsub();
  }, [currentUser, role]);

  useEffect(() => {
    if (!currentUser) return;

    const fetchDriverRides = async () => {
      try {
        const q = query(
          collection(db, 'bookings'),
          where('driverId', '==', currentUser.uid),
          where('status', 'in', ['COMPLETED', 'CANCELLED'])
        );
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRides(list);
      } catch (err) {
        console.error('Error loading driver rides:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDriverRides();
  }, [currentUser]);

  const completedTrips = rides.filter((r) => r.status === 'COMPLETED');
  const totalDistance = completedTrips.reduce((acc, curr) => acc + (curr.distanceKm || 0), 0);

  return (
    <div className="h-full overflow-y-auto bg-[#E3F2FD] text-[#0D47A1] p-4 pb-36 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-xl font-black text-[#0D47A1]">
            <span>Pick-up & Drop-off History</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">Completed user transit and distance log</p>
        </div>
        <NotificationBellButton
          className="bg-white border-2 border-[#0D47A1] text-[#0D47A1] shadow-md hover:bg-[#E3F2FD] p-2"
          iconClassName="w-4 h-4 text-[#0D47A1]"
        />
      </div>

      {/* Summary Stat Card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 shadow-lg space-y-1">
          <div className="text-xs font-bold text-[#0D47A1]">Completed Trips</div>
          <div className="text-2xl font-black text-[#0D47A1]">{completedTrips.length}</div>
          <div className="text-[10px] text-slate-500 font-medium">Users Served</div>
        </div>

        <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 shadow-lg space-y-1">
          <div className="text-xs font-bold text-[#0D47A1]">Transit Distance</div>
          <div className="text-2xl font-black text-[#0D47A1]">{totalDistance.toFixed(1)} km</div>
          <div className="text-[10px] text-slate-500 font-medium">Clean E-Mobility</div>
        </div>
      </div>

      {/* Ride History List */}
      {loading ? (
        <div className="p-8 text-center text-[#0D47A1] text-xs animate-pulse font-mono uppercase font-bold">Loading trips...</div>
      ) : rides.length === 0 ? (
        <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-8 text-center space-y-3 shadow-lg">
          <div className="text-[#0D47A1] font-black text-2xl tracking-widest uppercase">E-SHUTTLE</div>
          <h3 className="text-sm font-bold text-[#0D47A1]">No Trips Completed Yet</h3>
          <p className="text-xs text-slate-500 font-medium">Go online on the Drive screen to start accepting user pick-up requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rides.map((ride) => {
            const linkedTicket = tickets.find(
              (t) => t.rideId === ride.id || t.tripSnapshot?.bookingId === ride.id
            );

            const tripSnapshotData: TripSnapshotInfo = {
              bookingId: ride.id,
              pickupAddress: ride.pickup?.address,
              destinationAddress: ride.destination?.address,
              pickupTime: ride.pickupTime,
              dropoffTime: ride.dropoffTime,
              status: ride.status,
              driverId: currentUser?.uid,
              driverName: driverProfile?.fullName || 'Driver',
              driverVehicleInfo: driverProfile?.vehicleInfo || driverProfile?.rfidCardUid || '',
              customerId: ride.customerId,
              customerName: ride.customerName || 'Passenger',
              distanceKm: ride.distanceKm,
              rating: ride.rating,
            };

            return (
              <div
                key={ride.id}
                className="bg-white border-2 border-[#0D47A1] hover:border-[#1565C0] rounded-2xl p-4 space-y-3 shadow-md transition-all text-[#0D47A1]"
              >
                <div className="flex items-center justify-between border-b border-[#0D47A1]/30 pb-2">
                  <div>
                    <div className="text-xs font-bold text-[#0D47A1]">{ride.customerName || 'User'}</div>
                    <div className="text-[10px] text-slate-500 font-medium">{ride.distanceKm} km trip</div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block text-[10px] font-extrabold text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2 py-0.5 rounded-full uppercase mr-1">
                      Free Shuttle
                    </span>
                    <span
                      className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        ride.status === 'COMPLETED'
                          ? 'bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1]'
                          : 'bg-rose-50 text-rose-600 border border-rose-200'
                      }`}
                    >
                      {ride.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1 py-0.5 rounded uppercase shrink-0">FROM</span>
                    <span className="truncate font-medium">{ride.pickup?.address}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1 py-0.5 rounded uppercase shrink-0">TO</span>
                    <span className="truncate font-medium">{ride.destination?.address}</span>
                  </div>
                </div>

                {ride.rating && (
                  <div className="text-xs text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2.5 py-1 rounded-xl w-fit font-bold">
                    <span>⭐ {ride.rating}.0 User Rating</span>
                  </div>
                )}

                {/* Incident Report Action or Status Badge */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  {linkedTicket ? (
                    <button
                      type="button"
                      onClick={() => openSupportTicketsModal(linkedTicket.id)}
                      className={`w-full py-1.5 px-3 rounded-xl text-xs font-black flex items-center justify-between transition-all ${
                        linkedTicket.status === 'resolved' || linkedTicket.status === 'closed'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                          : linkedTicket.status === 'dismissed'
                          ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 animate-pulse'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {linkedTicket.status === 'resolved' || linkedTicket.status === 'closed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        <span>
                          Report #{linkedTicket.ticketNumber} • {linkedTicket.status.toUpperCase().replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-extrabold uppercase">
                        <span>Track</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReportingRide(tripSnapshotData)}
                      title="File an incident or issue report for this trip"
                      className="text-[11px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1.5 transition-colors py-1 px-2 rounded-lg hover:bg-rose-50"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                      <span>Report Issue</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Incident Report Modal */}
      {reportingRide && (
        <ReportIncidentModal
          isOpen={Boolean(reportingRide)}
          onClose={() => setReportingRide(null)}
          tripSnapshot={reportingRide}
        />
      )}
    </div>
  );
};
