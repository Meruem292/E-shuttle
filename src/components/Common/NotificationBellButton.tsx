import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import {
  subscribeToNotifications,
  getUnreadNotificationsCount,
  openNotificationModal,
} from '../../services/notificationService';
import { useAuth } from '../../contexts/AuthContext';

interface NotificationBellButtonProps {
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
  showCount?: boolean;
}

export const NotificationBellButton: React.FC<NotificationBellButtonProps> = ({
  onClick,
  className = '',
  iconClassName = 'w-5 h-5',
  showCount = false,
}) => {
  const { currentUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    setUnreadCount(getUnreadNotificationsCount(currentUser?.uid));
    const unsub = subscribeToNotifications(currentUser?.uid, (items) => {
      setUnreadCount(items.filter((n) => !n.read).length);
    });
    return () => unsub();
  }, [currentUser?.uid]);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      openNotificationModal();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}

      title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications & Alerts'}
      className={`relative p-2 rounded-full transition-all active:scale-95 flex items-center justify-center ${className}`}
      aria-label="Notifications"
    >
      <Bell className={iconClassName} />
      {unreadCount > 0 && (
        <>
          {showCount ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white font-black text-[10px] rounded-full border-2 border-white flex items-center justify-center shadow-md animate-pulse pointer-events-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-600 rounded-full border-2 border-white animate-pulse shadow-md pointer-events-none" />
          )}
        </>
      )}
    </button>
  );
};
