import React, { useState, useEffect } from 'react';
import { ShieldAlert, Lock, Clock, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  calculatePasswordAgeStatus,
  subscribeToPasswordPolicy,
  DEFAULT_PASSWORD_EXPIRY_DAYS,
  PasswordAgeStatus,
} from '../../services/passwordPolicyService';
import { PasswordManagementCard } from './PasswordManagementCard';

export const PasswordExpiryNotification: React.FC = () => {
  const { currentUser, userProfile, driverProfile, role } = useAuth();
  const [globalPolicyDays, setGlobalPolicyDays] = useState<number>(DEFAULT_PASSWORD_EXPIRY_DAYS);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [dismissedForSession, setDismissedForSession] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToPasswordPolicy((days) => {
      setGlobalPolicyDays(days);
    });
    return () => unsub();
  }, []);

  const activeProfile = role === 'driver' ? driverProfile : userProfile;
  const status: PasswordAgeStatus = calculatePasswordAgeStatus(activeProfile, globalPolicyDays);

  useEffect(() => {
    if (!currentUser || dismissedForSession) {
      setShowModal(false);
      return;
    }

    // If password is fully expired, show reminder once on startup / login
    if (status.isExpired) {
      try {
        const lastPrompted = sessionStorage.getItem('eshuttle_pass_expiry_prompted');
        if (!lastPrompted) {
          setShowModal(true);
        }
      } catch {
        setShowModal(true);
      }
    }
  }, [currentUser, status.isExpired, dismissedForSession]);

  const handleDismiss = () => {
    setShowModal(false);
    setDismissedForSession(true);
    try {
      sessionStorage.setItem('eshuttle_pass_expiry_prompted', Date.now().toString());
    } catch {}
  };

  if (!showModal || !currentUser || !status.isExpired) {
    return null;
  }

  return (
    <div
      id="password-expiry-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        id="password-expiry-modal"
        className="w-full max-w-md bg-white border-2 border-[#0D47A1] rounded-3xl p-5 shadow-2xl space-y-4 text-[#0D47A1] max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="password-expiry-title"
      >
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border-2 border-amber-500 text-amber-600 flex items-center justify-center shrink-0 shadow-inner">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-rose-100 border border-rose-400 text-rose-900 rounded-full text-[9px] font-black uppercase tracking-wider">
                  Security Rotation Due
                </span>
              </div>
              <h3 id="password-expiry-title" className="text-base font-black text-[#0D47A1] leading-tight mt-0.5">
                Password Change Required
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-xl hover:bg-slate-100 transition-colors"
            title="Remind me later"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#E3F2FD]/70 border border-[#0D47A1]/30 rounded-2xl p-3.5 space-y-2 text-xs text-slate-700">
          <p className="font-medium leading-relaxed">
            Your account password was last changed <strong className="text-[#0D47A1]">{status.daysSinceChange} days ago</strong>.
            Under the E-Shuttle security policy of <strong>{globalPolicyDays} days</strong>, please update your password to keep your account protected.
          </p>
        </div>

        {/* Embedded Interactive Password Change Card */}
        <PasswordManagementCard className="border-0 p-0 shadow-none" />

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 underline px-2 py-1"
          >
            Remind me later in my profile
          </button>
        </div>
      </div>
    </div>
  );
};
