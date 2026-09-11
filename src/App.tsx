import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NativeBackProvider, useBackHandler } from './contexts/NativeBackContext';
import { AuthModal } from './components/Auth/AuthModal';
import { BottomNav } from './components/BottomNav';
import { HomeMapBooking } from './components/Customer/HomeMapBooking';
import { CustomerRideHistory } from './components/Customer/RideHistory';
import { CustomerProfile } from './components/Customer/CustomerProfile';
import { DriverHome } from './components/Driver/DriverHome';
import { DriverRides } from './components/Driver/DriverRides';
import { DriverProfile } from './components/Driver/DriverProfile';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { PWAInstallButton } from './components/PWAInstallPrompt';
import { ChatDrawer } from './components/Common/ChatDrawer';
import { NotificationModal } from './components/Common/NotificationModal';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from './services/logoService';

const MainAppContent: React.FC = () => {
  const { role, currentUser, loading } = useAuth();
  const { logoUrl } = useAppLogo();
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const tabHistoryRef = useRef<string[]>(['home']);

  // Global listener to trigger notification modal from any bell button or service dispatch
  useEffect(() => {
    const handleOpenModal = () => setIsNotificationOpen(true);
    window.addEventListener('eshuttle_open_notifications', handleOpenModal);
    return () => window.removeEventListener('eshuttle_open_notifications', handleOpenModal);
  }, []);

  // Track tab history for back button navigation
  const handleTabChange = (newTab: string) => {
    if (newTab === 'support') {
      setIsChatOpen(true);
      return;
    }
    if (newTab !== activeTab) {
      tabHistoryRef.current.push(newTab);
      setActiveTab(newTab);
    }
  };

  // Native back button for sub-tab navigation (Priority 5, lower than modals which are Priority 10-20)
  const isRootTab = role === 'admin' ? activeTab === 'dashboard' : activeTab === 'home';
  useBackHandler(
    !isRootTab,
    () => {
      if (tabHistoryRef.current.length > 1) {
        tabHistoryRef.current.pop();
        const prevTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
        setActiveTab(prevTab || (role === 'admin' ? 'dashboard' : 'home'));
      } else {
        setActiveTab(role === 'admin' ? 'dashboard' : 'home');
      }
      return true;
    },
    5,
    'tab-nav'
  );

  // Ensure default active tab matches role upon page refresh or role change
  useEffect(() => {
    if (role === 'admin') {
      const validAdminTabs = ['dashboard', 'map', 'zones', 'stations', 'users', 'customers', 'drivers', 'rides', 'ebikes', 'incidents', 'settings', 'logs', 'audit'];
      if (!validAdminTabs.includes(activeTab)) {
        setActiveTab('dashboard');
        tabHistoryRef.current = ['dashboard'];
      }
    } else if (role === 'customer' || role === 'driver') {
      const validUserTabs = ['home', 'history', 'profile', 'support'];
      if (!validUserTabs.includes(activeTab)) {
        setActiveTab('home');
        tabHistoryRef.current = ['home'];
      }
    }
  }, [role, activeTab]);

  if (loading) {
    return (
      <div className="h-full w-full bg-[#E3F2FD] flex flex-col items-center justify-center text-[#0D47A1] p-4 space-y-4">
        <div className="relative flex items-center justify-center">
          <img
            src={logoUrl}
            onError={(e) => {
              markLogoUrlAsFailed(logoUrl);
              (e.target as HTMLImageElement).src = officialLogoFallback;
            }}
            alt="E-Shuttle Official Logo"
            className="w-16 h-16 rounded-2xl object-cover shadow-xl border-2 border-[#0D47A1]"
          />
          <div className="absolute -inset-1 rounded-2xl border-2 border-[#0D47A1]/40 animate-ping pointer-events-none" />
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-6 h-6 border-3 border-[#0D47A1] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-[#0D47A1]">Loading E-Shuttle...</span>
        </div>
      </div>
    );
  }

  if (!currentUser || !role) {
    return (
      <div className="h-full w-full bg-[#E3F2FD] flex flex-col overflow-hidden">
        <PWAInstallButton variant="banner" />
        <div className="flex-1 overflow-auto">
          <AuthModal />
        </div>
      </div>
    );
  }

  // Fallback tab computation to guarantee no blank screen is rendered before/during state updates
  const customerTab = ['home', 'history', 'profile'].includes(activeTab) ? activeTab : 'home';
  const driverTab = ['home', 'history', 'profile'].includes(activeTab) ? activeTab : 'home';
  const adminTab = ['dashboard', 'map', 'zones', 'stations', 'users', 'customers', 'drivers', 'rides', 'ebikes', 'incidents', 'settings', 'logs', 'audit'].includes(activeTab) ? activeTab : 'dashboard';

  return (
    <div className="h-full w-full bg-[#E3F2FD] flex flex-col overflow-hidden select-none">
      {/* Top Direct PWA Install Banner */}
      <PWAInstallButton variant="banner" />

      {/* Role-based View Routing */}
      <div className="flex-1 w-full h-full relative overflow-hidden">
        {role === 'customer' && (
          <>
            {customerTab === 'home' && <HomeMapBooking />}
            {customerTab === 'history' && <CustomerRideHistory />}
            {customerTab === 'profile' && <CustomerProfile />}
          </>
        )}

        {role === 'driver' && (
          <>
            {driverTab === 'home' && <DriverHome />}
            {driverTab === 'history' && <DriverRides />}
            {driverTab === 'profile' && <DriverProfile />}
          </>
        )}

        {role === 'admin' && (
          <AdminDashboard activeTab={adminTab} setActiveTab={handleTabChange} />
        )}
      </div>

      {/* Global Live Chat & Incident Support Drawer (Controlled via BottomNav) */}
      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />

      {/* Global Notification Center Modal */}
      <NotificationModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={role === 'admin' ? adminTab : role === 'customer' ? customerTab : driverTab}
        setActiveTab={handleTabChange}
        role={role}
        onOpenChat={() => setIsChatOpen(true)}
        onOpenNotifications={() => setIsNotificationOpen(true)}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <NativeBackProvider>
        <MainAppContent />
      </NativeBackProvider>
    </AuthProvider>
  );
}
