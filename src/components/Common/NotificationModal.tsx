import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Navigation,
  CheckCircle2,
  Bike,
  Users,
  MessageSquare,
  Info,
  Radio,
  Volume2,
} from 'lucide-react';
import {
  AppNotificationItem,
  getStoredNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  clearAllNotifications,
  subscribeToNotifications,
  playPickupChime,
} from '../../services/notificationService';
import { useAuth } from '../../contexts/AuthContext';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToNotifications(currentUser?.uid, (items) => {
      setNotifications(items);
    });
    return () => unsub();
  }, [isOpen, currentUser?.uid]);

  // When modal is opened, user is looking at notifications, but allow manual or auto-mark
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead(currentUser?.uid);
  };

  const handleClearAll = () => {
    clearAllNotifications(currentUser?.uid);
  };

  const handleNotificationClick = (item: AppNotificationItem) => {
    if (!item.read) {
      markNotificationAsRead(item.id, currentUser?.uid);
    }
  };

  const handleTestChime = () => {
    playPickupChime('driver_approaching');
  };

  if (!isOpen) return null;

  const formatTime = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getIcon = (type: AppNotificationItem['type']) => {
    switch (type) {
      case 'proximity_300m':
      case 'driver_approaching':
        return <Radio className="w-5 h-5 text-amber-600 animate-pulse" />;
      case 'driver_assigned':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'driver_arrived':
        return <Navigation className="w-5 h-5 text-indigo-600" />;
      case 'multi_passenger':
        return <Users className="w-5 h-5 text-[#0D47A1]" />;
      case 'new_request':
      case 'ride_started':
        return <Bike className="w-5 h-5 text-emerald-600" />;
      case 'support':
        return <MessageSquare className="w-5 h-5 text-sky-600" />;
      default:
        return <Info className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white border-2 border-[#0D47A1] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center relative">
              <Bell className="w-5 h-5 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm uppercase tracking-wide">Notifications & Alerts</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-rose-500 text-white font-bold px-2 py-0.2 rounded-full">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <p className="text-[11px] text-blue-100 font-medium">Shuttle proximity, rides & updates</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Toolbar */}
        <div className="bg-[#F0F7FF] px-4 py-2 border-b border-[#0D47A1]/20 flex items-center justify-between text-xs">
          <button
            onClick={handleTestChime}
            title="Test synthetic notification chime"
            className="flex items-center gap-1.5 font-bold text-[#0D47A1] hover:underline text-[11px]"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Test Sound</span>
          </button>

          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 font-bold text-[#0D47A1] hover:text-[#0D47A1]/80 transition-colors text-[11px]"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 font-bold text-rose-600 hover:text-rose-700 transition-colors text-[11px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="p-3 overflow-y-auto space-y-2.5 flex-1 bg-slate-50/60 divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400">
                <Bell className="w-7 h-7" />
              </div>
              <p className="text-xs font-bold text-slate-600">You're all caught up!</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                No active notifications right now. Alerts for shuttle proximity and boarding will appear here.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={`pt-2.5 first:pt-0 cursor-pointer rounded-2xl p-3 transition-all border ${
                  !item.read
                    ? 'bg-white border-[#0D47A1]/30 shadow-sm'
                    : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                      !item.read ? 'bg-[#E3F2FD] border border-[#0D47A1]/20' : 'bg-slate-100'
                    }`}
                  >
                    {getIcon(item.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4
                        className={`text-xs truncate ${
                          !item.read ? 'font-black text-[#0D47A1]' : 'font-bold text-slate-700'
                        }`}
                      >
                        {item.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatTime(item.timestamp)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{item.message}</p>

                    {/* Proximity / Meta chips */}
                    {item.type === 'proximity_300m' || item.meta?.distanceMeters ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                          🎯 300m Proximity Trigger
                        </span>
                      </div>
                    ) : item.type === 'multi_passenger' ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider bg-blue-100 text-[#0D47A1] px-2 py-0.5 rounded-full border border-blue-200">
                          👥 Multi-Passenger Boarding
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {!item.read && (
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0 mt-1" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>Real-time Transit Notifications</span>
          <button
            onClick={() => {
              handleMarkAllRead();
              onClose();
            }}
            className="font-bold text-[#0D47A1] hover:underline"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
