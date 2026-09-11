import React, { useEffect, useState } from 'react';
import {
  Bell,
  X,
  Bus,
  CheckCircle2,
  MapPin,
  Volume2,
  VolumeX,
  Phone,
} from 'lucide-react';
import { PickupNotificationType, playPickupChime } from '../../services/notificationService';

export interface PickupNotificationData {
  id: string;
  type: PickupNotificationType;
  title: string;
  message: string;
  stationName?: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface PickupNotificationBannerProps {
  notification: PickupNotificationData | null;
  onDismiss: () => void;
}

export const PickupNotificationBanner: React.FC<PickupNotificationBannerProps> = ({
  notification,
  onDismiss,
}) => {
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pickup_sound_muted') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!notification) return;

    // Auto dismiss after 8 seconds
    const timer = setTimeout(() => {
      onDismiss();
    }, 8000);

    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  if (!notification) return null;

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isSoundMuted;
    setIsSoundMuted(newMuted);
    try {
      localStorage.setItem('pickup_sound_muted', String(newMuted));
    } catch {}
    if (!newMuted) {
      playPickupChime(notification.type);
    }
  };

  const getTheme = () => {
    switch (notification.type) {
      case 'driver_arrived':
        return {
          bg: 'bg-emerald-600',
          border: 'border-emerald-700',
          iconBg: 'bg-white text-emerald-700',
          badge: 'bg-emerald-800 text-white',
          Icon: CheckCircle2,
        };
      case 'driver_assigned':
      case 'driver_approaching':
        return {
          bg: 'bg-[#0D47A1]',
          border: 'border-[#1565C0]',
          iconBg: 'bg-white text-[#0D47A1]',
          badge: 'bg-blue-900 text-blue-100',
          Icon: Bus,
        };
      case 'new_request':
        return {
          bg: 'bg-amber-500',
          border: 'border-amber-600',
          iconBg: 'bg-slate-900 text-amber-400',
          badge: 'bg-amber-700 text-white',
          Icon: Bell,
        };
      default:
        return {
          bg: 'bg-[#0D47A1]',
          border: 'border-blue-700',
          iconBg: 'bg-white text-[#0D47A1]',
          badge: 'bg-blue-900 text-white',
          Icon: MapPin,
        };
    }
  };

  const theme = getTheme();
  const IconComponent = theme.Icon;

  return (
    <aside
      aria-label="Pickup status alert"
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-50 animate-in slide-in-from-top duration-300 pointer-events-auto"
    >
      <div
        className={`${theme.bg} ${theme.border} border-2 text-white rounded-2xl shadow-2xl p-3.5 flex items-start gap-3 backdrop-blur-xs`}
      >
        <div
          className={`w-10 h-10 rounded-xl ${theme.iconBg} flex items-center justify-center font-black shrink-0 shadow-md`}
        >
          <IconComponent className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${theme.badge} tracking-wider`}
            >
              Pickup Alert
            </span>
            <span className="text-[10px] text-white/80 font-semibold">Just now</span>
          </div>

          <h4 className="text-sm font-black text-white mt-0.5 leading-tight truncate">
            {notification.title}
          </h4>

          <p className="text-xs text-white/90 font-medium mt-0.5 leading-snug line-clamp-2">
            {notification.message}
          </p>

          {/* Quick Actions if available */}
          {(notification.actionLabel || notification.driverPhone) && (
            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-white/20">
              {notification.actionLabel && notification.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    notification.onAction?.();
                    onDismiss();
                  }}
                  className="px-3 py-1 bg-white text-slate-900 font-bold text-xs rounded-lg shadow hover:bg-slate-100 transition-colors"
                >
                  {notification.actionLabel}
                </button>
              )}

              {notification.driverPhone && (
                <a
                  href={`tel:${notification.driverPhone}`}
                  className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call Driver</span>
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleSound}
            title={isSoundMuted ? 'Unmute pickup chime' : 'Mute pickup chime'}
            className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
          >
            {isSoundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss alert"
            className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
