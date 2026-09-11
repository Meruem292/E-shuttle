import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { sanitizeVehicleInfo } from '../../utils/sanitizeVehicle';
import { NotificationBellButton } from '../Common/NotificationBellButton';

export const CustomerRideHistory: React.FC = () => {
  const { currentUser } = useAuth();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!currentUser) return;

    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'bookings'),
          where('customerId', '==', currentUser.uid),
          where('status', 'in', ['COMPLETED', 'CANCELLED'])
        );
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

        // Sort descending by date
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });

        setRides(list);
      } catch (err) {
        console.error('Error loading ride history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [currentUser]);

  return (
    <div className="h-full overflow-y-auto bg-[#E3F2FD] text-[#0D47A1] p-4 pb-36 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-xl font-black text-[#0D47A1]">
            <span>Pick-up & Drop-off History</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">Past E-Shuttle trips and transit logs</p>
        </div>
        <NotificationBellButton
          className="bg-white border-2 border-[#0D47A1] text-[#0D47A1] shadow-md hover:bg-[#E3F2FD] p-2"
          iconClassName="w-4 h-4 text-[#0D47A1]"
        />
      </div>

      {loading ? (
        <div className="p-8 text-center text-[#0D47A1] text-xs animate-pulse font-mono uppercase font-bold">Loading history...</div>
      ) : rides.length === 0 ? (
        <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-8 text-center space-y-3 shadow-lg">
          <div className="text-[#0D47A1] font-black text-2xl tracking-widest uppercase">E-SHUTTLE</div>
          <h3 className="text-sm font-bold text-[#0D47A1]">No Pick-up & Drop-off History</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto font-medium">
            Request your first E-Shuttle trip from the Home screen map to see your activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rides.map((ride) => (
            <div
              key={ride.id}
              className="bg-white border-2 border-[#0D47A1] hover:border-[#1565C0] rounded-2xl p-4 space-y-3 shadow-md transition-all text-[#0D47A1]"
            >
              <div className="flex items-center justify-between border-b border-[#0D47A1]/30 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0D47A1] text-white flex items-center justify-center font-black text-[10px] uppercase shadow-sm">
                    ES
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#0D47A1]">{ride.driverName || 'E-Shuttle Driver'}</div>
                    <div className="text-[10px] text-slate-500">{sanitizeVehicleInfo(ride.driverVehicleInfo)} • {ride.distanceKm || 0} km</div>
                  </div>
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

              {/* Locations */}
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">FROM</span>
                  <span className="truncate font-medium">{ride.pickup?.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">TO</span>
                  <span className="truncate font-medium">{ride.destination?.address}</span>
                </div>
              </div>

              {/* Rating badge if rated */}
              {ride.rating && (
                <div className="text-xs text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2.5 py-1 rounded-xl w-fit font-bold">
                  ⭐ {ride.rating}.0 Star User Rating
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
