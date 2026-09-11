import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationBellButton } from '../Common/NotificationBellButton';

export const DriverRides: React.FC = () => {
  const { currentUser } = useAuth();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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
          {rides.map((ride) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
