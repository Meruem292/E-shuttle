import React, { useState, useEffect, useRef } from 'react';
import { UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useActionBadges } from '../hooks/useActionBadges';
import {
  subscribeToNotifications,
  getUnreadNotificationsCount,
  openNotificationModal,
} from '../services/notificationService';
import {
  MapPin,
  Clock,
  User,
  Navigation,
  History,
  CreditCard,
  LayoutDashboard,
  Users,
  Route,
  Cpu,
  Settings,
  Landmark,
  Layers,
  MessageSquare,
  ShieldAlert,
  ClipboardList,
  Bell,
} from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  role: UserRole | null;
  hasActiveBooking?: boolean;
  onOpenChat?: () => void;
  onOpenNotifications?: () => void;
  customActionDots?: Record<string, boolean>;
}

const RedDot: React.FC = () => (
  <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-rose-600 rounded-full border-2 border-white animate-pulse shadow-md z-10 pointer-events-none" />
);

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  role,
  hasActiveBooking = false,
  onOpenChat,
  onOpenNotifications,
  customActionDots,
}) => {
  const { currentUser } = useAuth();
  const liveActionDots = useActionBadges(currentUser, role);
  const actionDots = customActionDots || liveActionDots;

  // Track seen status for each tab so red dots disappear once seen by the user
  const seenStorageKey = `eshuttle_navbar_seen_${currentUser?.uid || 'guest'}`;
  const [seenTabs, setSeenTabs] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(seenStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Track unread notifications for the Bell button
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  useEffect(() => {
    setUnreadNotifCount(getUnreadNotificationsCount(currentUser?.uid));
    const unsub = subscribeToNotifications(currentUser?.uid, (items) => {
      const unread = items.filter((n) => !n.read).length;
      setUnreadNotifCount(unread);
      // If a fresh unread notification arrives, re-arm notification dot
      if (unread > 0) {
        setSeenTabs((prev) => {
          if (!prev.notifications) return prev;
          const next = { ...prev };
          delete next.notifications;
          try {
            localStorage.setItem(seenStorageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    });
    return () => unsub();
  }, [currentUser?.uid, seenStorageKey]);

  // When activeTab changes or is currently open, mark it as seen immediately
  useEffect(() => {
    if (activeTab) {
      setSeenTabs((prev) => {
        if (prev[activeTab]) return prev;
        const next = { ...prev, [activeTab]: true };
        try {
          localStorage.setItem(seenStorageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [activeTab, seenStorageKey]);

  // Re-arm dots if an action dot transitions from false to true while user is on a different tab
  const prevActionDotsRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const prev = prevActionDotsRef.current;
    let hasNew = false;
    const nextSeen = { ...seenTabs };

    Object.entries(actionDots).forEach(([k, v]) => {
      if (v && !prev[k] && activeTab !== k) {
        if (nextSeen[k]) {
          delete nextSeen[k];
          hasNew = true;
        }
      }
    });

    prevActionDotsRef.current = { ...actionDots };

    if (hasNew) {
      setSeenTabs(nextSeen);
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(nextSeen));
      } catch {}
    }
  }, [actionDots, activeTab, seenStorageKey, seenTabs]);

  const handleTabClick = (tabKey: string) => {
    setSeenTabs((prev) => {
      const next = { ...prev, [tabKey]: true };
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    setActiveTab(tabKey);
  };

  const handleNotificationsClick = () => {
    // Mark notifications as seen in navbar
    setSeenTabs((prev) => {
      const next = { ...prev, notifications: true };
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (onOpenNotifications) {
      onOpenNotifications();
    } else {
      openNotificationModal();
    }
  };

  const handleChatClick = () => {
    setSeenTabs((prev) => {
      const next = { ...prev, support: true };
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (onOpenChat) {
      onOpenChat();
    } else {
      setActiveTab('support');
    }
  };

  if (!role) return null;

  if (role === 'customer') {
    // Dots are removed once the tab has been seen
    const showHomeDot = (actionDots.home || hasActiveBooking) && !seenTabs.home && activeTab !== 'home';
    const showHistoryDot = actionDots.history && !seenTabs.history && activeTab !== 'history';
    const showNotificationDot = unreadNotifCount > 0 && !seenTabs.notifications;
    const showSupportDot = actionDots.support && !seenTabs.support && activeTab !== 'support';
    const showProfileDot = actionDots.profile && !seenTabs.profile && activeTab !== 'profile';

    return (
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t-2 border-[#0D47A1] px-2 py-2 flex items-center justify-around max-w-md mx-auto shadow-[0_-4px_20px_rgba(13,71,161,0.18)]">
        <button
          onClick={() => handleTabClick('home')}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'home'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <MapPin className={`w-5 h-5 ${activeTab === 'home' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showHomeDot && <RedDot />}
          </div>
          <span className="text-[11px]">Home</span>
        </button>

        <button
          onClick={() => handleTabClick('history')}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'history'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <Clock className={`w-5 h-5 ${activeTab === 'history' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showHistoryDot && <RedDot />}
          </div>
          <span className="text-[11px]">Activity</span>
        </button>

        {/* Bell Notification Button in Navbar */}
        <button
          onClick={handleNotificationsClick}
          title="Notifications & Alerts"
          className="flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold active:scale-95"
        >
          <div className="relative flex items-center justify-center">
            <Bell className="w-5 h-5 text-[#0D47A1]/80" />
            {showNotificationDot && <RedDot />}
          </div>
          <span className="text-[11px]">Alerts</span>
        </button>

        <button
          onClick={handleChatClick}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'support'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
            {showSupportDot && <RedDot />}
          </div>
          <span className="text-[11px]">Help</span>
        </button>

        <button
          onClick={() => handleTabClick('profile')}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'profile'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <User className={`w-5 h-5 ${activeTab === 'profile' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showProfileDot && <RedDot />}
          </div>
          <span className="text-[11px]">Profile</span>
        </button>
      </div>
    );
  }

  if (role === 'driver') {
    const showDriveDot = actionDots.home && !seenTabs.home && activeTab !== 'home';
    const showHistoryDot = actionDots.history && !seenTabs.history && activeTab !== 'history';
    const showNotificationDot = unreadNotifCount > 0 && !seenTabs.notifications;
    const showSupportDot = actionDots.support && !seenTabs.support && activeTab !== 'support';
    const showProfileDot = actionDots.profile && !seenTabs.profile && activeTab !== 'profile';

    return (
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t-2 border-[#0D47A1] px-2 py-2 flex items-center justify-around max-w-md mx-auto shadow-[0_-4px_20px_rgba(13,71,161,0.18)]">
        <button
          onClick={() => handleTabClick('home')}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'home'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <Navigation className={`w-5 h-5 ${activeTab === 'home' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showDriveDot && <RedDot />}
          </div>
          <span className="text-[11px]">Drive</span>
        </button>

        <button
          onClick={() => handleTabClick('history')}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'history'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <History className={`w-5 h-5 ${activeTab === 'history' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showHistoryDot && <RedDot />}
          </div>
          <span className="text-[11px]">History</span>
        </button>

        {/* Bell Notification Button in Navbar */}
        <button
          onClick={handleNotificationsClick}
          title="Notifications & Alerts"
          className="flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold active:scale-95"
        >
          <div className="relative flex items-center justify-center">
            <Bell className="w-5 h-5 text-[#0D47A1]/80" />
            {showNotificationDot && <RedDot />}
          </div>
          <span className="text-[11px]">Alerts</span>
        </button>

        <button
          onClick={handleChatClick}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'support'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
            {showSupportDot && <RedDot />}
          </div>
          <span className="text-[11px]">Chat</span>
        </button>

        <button
          onClick={() => handleTabClick('profile')}
          className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl transition-all ${
            activeTab === 'profile'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <CreditCard className={`w-5 h-5 ${activeTab === 'profile' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showProfileDot && <RedDot />}
          </div>
          <span className="text-[11px]">Profile</span>
        </button>
      </div>
    );
  }

  if (role === 'admin') {
    const showDashboardDot = actionDots.dashboard && !seenTabs.dashboard && !['dashboard', 'map'].includes(activeTab);
    const showOperationsDot =
      (actionDots.ebikes || actionDots.stations || actionDots.zones || actionDots.rides) &&
      !['ebikes', 'stations', 'zones', 'rides'].some((t) => seenTabs[t]) &&
      !['ebikes', 'stations', 'zones', 'rides'].includes(activeTab);
    const showUsersDot =
      (actionDots.users || actionDots.drivers || actionDots.customers) &&
      !seenTabs.users &&
      !['users', 'customers', 'drivers'].includes(activeTab);
    const showIncidentsDot = actionDots.incidents && !seenTabs.incidents && activeTab !== 'incidents';
    const showSettingsDot =
      (actionDots.settings || actionDots.logs) &&
      !['settings', 'logs', 'audit'].some((t) => seenTabs[t]) &&
      !['settings', 'logs', 'audit'].includes(activeTab);

    const isOperationsActive = ['ebikes', 'stations', 'zones', 'rides'].includes(activeTab);
    const isSettingsActive = ['settings', 'logs', 'audit'].includes(activeTab);

    return (
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t-2 border-[#0D47A1] px-2 sm:px-6 py-2 flex items-center justify-around max-w-4xl mx-auto shadow-[0_-4px_20px_rgba(13,71,161,0.18)]">
        <button
          onClick={() => handleTabClick('dashboard')}
          title="Overview & Analytics"
          className={`flex flex-col items-center gap-0.5 text-[10px] sm:text-xs py-1.5 px-3 rounded-2xl transition-all ${
            activeTab === 'dashboard' || activeTab === 'map'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <LayoutDashboard className={`w-4 h-4 ${activeTab === 'dashboard' || activeTab === 'map' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showDashboardDot && <RedDot />}
          </div>
          <span className="truncate">Overview</span>
        </button>

        <button
          onClick={() => handleTabClick(isOperationsActive ? activeTab : 'ebikes')}
          title="Shuttle Fleet, Stations, Zones & Trips"
          className={`flex flex-col items-center gap-0.5 text-[10px] sm:text-xs py-1.5 px-3 rounded-2xl transition-all ${
            isOperationsActive
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <Route className={`w-4 h-4 ${isOperationsActive ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showOperationsDot && <RedDot />}
          </div>
          <span className="truncate">Operations</span>
        </button>

        <button
          onClick={() => handleTabClick('users')}
          title="User accounts, Drivers & RFID Cards"
          className={`flex flex-col items-center gap-0.5 text-[10px] sm:text-xs py-1.5 px-3 rounded-2xl transition-all ${
            activeTab === 'users' || activeTab === 'customers' || activeTab === 'drivers'
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <Users className={`w-4 h-4 ${activeTab === 'users' || activeTab === 'customers' || activeTab === 'drivers' ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showUsersDot && <RedDot />}
          </div>
          <span className="truncate">Accounts</span>
        </button>

        <button
          onClick={() => handleTabClick('incidents')}
          title="Incidents & Helpdesk Chat Threads"
          className={`flex flex-col items-center gap-0.5 text-[10px] sm:text-xs py-1.5 px-3 rounded-2xl transition-all ${
            activeTab === 'incidents'
              ? 'text-white bg-rose-600 font-extrabold shadow-md border border-rose-600'
              : 'text-rose-700 hover:text-rose-900 font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <ShieldAlert className={`w-4 h-4 ${activeTab === 'incidents' ? 'text-white' : 'text-rose-600'}`} />
            {showIncidentsDot && <RedDot />}
          </div>
          <span className="truncate">Incidents</span>
        </button>

        <button
          onClick={() => handleTabClick(isSettingsActive ? activeTab : 'settings')}
          title="Dispatch Settings & Activity Audit Logs"
          className={`flex flex-col items-center gap-0.5 text-[10px] sm:text-xs py-1.5 px-3 rounded-2xl transition-all ${
            isSettingsActive
              ? 'text-white bg-[#0D47A1] font-extrabold shadow-md border border-[#0D47A1]'
              : 'text-[#0D47A1]/70 hover:text-[#0D47A1] font-bold'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <Settings className={`w-4 h-4 ${isSettingsActive ? 'text-white' : 'text-[#0D47A1]/70'}`} />
            {showSettingsDot && <RedDot />}
          </div>
          <span className="truncate">Settings</span>
        </button>
      </div>
    );
  }

  return null;
};

