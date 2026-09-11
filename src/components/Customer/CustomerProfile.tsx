import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, HelpCircle, Info, ChevronRight, Bus, BookOpen } from 'lucide-react';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from '../../services/logoService';
import { FaqAboutModal } from '../Common/FaqAboutModal';
import { NotificationBellButton } from '../Common/NotificationBellButton';
import scsLogo from '../../images/scs_logo.jpg';
import cctLogo from '../../images/cct_logo.jpg';

export const CustomerProfile: React.FC = () => {
  const { userProfile, logout } = useAuth();
  const { logoUrl: appLogo } = useAppLogo();
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);
  const [faqTab, setFaqTab] = useState<'guide' | 'faqs' | 'routes' | 'history' | 'about'>('faqs');

  const openFaqTab = (tab: 'guide' | 'faqs' | 'routes' | 'history' | 'about') => {
    setFaqTab(tab);
    setIsFaqOpen(true);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#E3F2FD] text-[#0D47A1] p-4 pb-36 max-w-md mx-auto space-y-5">
      <div className="pt-2 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0D47A1]">
            <span>User Profile</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">Manage your profile and app preferences</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBellButton
            className="bg-white border-2 border-[#0D47A1] text-[#0D47A1] shadow-md hover:bg-[#E3F2FD] p-2"
            iconClassName="w-4 h-4 text-[#0D47A1]"
          />
          <img
            src={appLogo}
            onError={(e) => {
              markLogoUrlAsFailed(appLogo);
              (e.target as HTMLImageElement).src = officialLogoFallback;
            }}
            alt="E-Shuttle Official Logo"
            className="w-10 h-10 rounded-2xl object-cover border-2 border-[#0D47A1] shadow-md"
          />
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#0D47A1] rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md">
            {userProfile?.fullName?.charAt(0) || 'U'}
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0D47A1]">{userProfile?.fullName || 'User'}</h3>
            <div className="inline-block bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase mt-1">
              <span>User</span>
            </div>
          </div>
        </div>

        <div className="border-t border-[#0D47A1]/30 pt-3 space-y-2 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 uppercase font-mono text-[10px] font-bold">Email:</span>
            <span className="font-bold text-[#0D47A1]">{userProfile?.email || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 uppercase font-mono text-[10px] font-bold">Phone:</span>
            <span className="font-bold text-[#0D47A1]">{userProfile?.phone || '+63 917 123 4567'}</span>
          </div>
        </div>
      </div>

      {/* FAQs & Information Center Card */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#0D47A1]" />
            <span className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
              Tagaytay E-Shuttle Info Center
            </span>
          </div>
          <span className="bg-amber-400 text-[#0D47A1] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
            100% Free Ride
          </span>
        </div>

        {/* Simple Walkthrough Button */}
        <button
          onClick={() => openFaqTab('guide')}
          className="w-full p-3 bg-amber-400 hover:bg-amber-300 text-slate-900 border-2 border-amber-500 rounded-2xl flex items-center justify-between transition-all text-left shadow-sm group active:scale-98"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="block font-black text-xs uppercase tracking-tight">How to Use (Simple Guide)</span>
              <span className="block text-[11px] text-slate-800 font-medium">3 easy steps to request and ride free</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-800 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => openFaqTab('faqs')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <HelpCircle className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">Frequently Asked Questions</span>
            <span className="text-[10px] text-slate-500 font-medium">Is it free? Safety & Rules</span>
          </button>

          <button
            onClick={() => openFaqTab('routes')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <Bus className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">37 Shuttle Fleet & Routes</span>
            <span className="text-[10px] text-slate-500 font-medium">City Hall & TNHS Exits</span>
          </button>

          <button
            onClick={() => openFaqTab('history')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <Info className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">Program Launch History</span>
            <span className="text-[10px] text-slate-500 font-medium">Cavite Times Journal 2025</span>
          </button>

          <button
            onClick={() => openFaqTab('about')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <Info className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">About Us & Developers</span>
            <span className="text-[10px] text-slate-500 font-medium">Meet Maria, Daniella & team</span>
          </button>
        </div>
      </div>

      {/* App Installation Card */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-2 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">Mobile App Version</span>
          <PWAInstallButton variant="compact" />
        </div>
        <p className="text-[11px] text-slate-500 font-medium">
          Install the E-Shuttle application directly to your device home screen for 1-tap quick access.
        </p>
        <PWAInstallButton />
      </div>

      {/* Logout Button */}
      <button
        onClick={logout}
        title="Sign out of your account on this device"
        className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border-2 border-rose-300 rounded-2xl font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 active:scale-95 uppercase tracking-wider"
      >
        <LogOut className="w-4 h-4" />
        <span>Log Out</span>
      </button>

      {/* Institutional Accreditation */}
      <div className="pt-1 flex items-center justify-center gap-4 opacity-75">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
          <img
            src={cctLogo}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/cct_logo.jpg';
            }}
            alt="CCT"
            className="w-5 h-5 rounded-full object-cover border border-[#0D47A1]"
          />
          <span>CCT</span>
        </div>
        <div className="w-1 h-1 bg-[#0D47A1] rounded-full" />
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
          <img
            src={scsLogo}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/scs_logo.jpg';
            }}
            alt="SCS"
            className="w-5 h-5 rounded-full object-cover border border-[#0D47A1]"
          />
          <span>SCS</span>
        </div>
      </div>

      <FaqAboutModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        defaultTab={faqTab}
      />
    </div>
  );
};
