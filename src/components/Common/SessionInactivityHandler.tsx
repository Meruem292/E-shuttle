import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Clock, ShieldAlert, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../contexts/ToastContext';

// 5 minutes total inactivity before automatic sign-out
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 300,000 ms (5 minutes)
// Show warning modal 60 seconds before expiration
const WARNING_THRESHOLD_MS = 60 * 1000; // 60,000 ms (1 minute)

export const SessionInactivityHandler: React.FC = () => {
  const { currentUser, role, logout } = useAuth();
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);

  const lastActivityRef = useRef<number>(Date.now());
  const isLoggingOutRef = useRef<boolean>(false);

  // Reset activity timestamp
  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem('eshuttle_last_activity', now.toString());
    } catch {}
    if (showWarning) {
      setShowWarning(false);
    }
  }, [showWarning]);

  // Explicit user extension via "Stay Signed In" button
  const handleExtendSession = () => {
    recordActivity();
    toast.info('Session successfully extended.');
  };

  // Immediate sign-out
  const handleManualLogout = async () => {
    setShowWarning(false);
    isLoggingOutRef.current = true;
    try {
      await logout();
    } catch {}
  };

  // 1. Setup User Interaction Listeners (throttled)
  useEffect(() => {
    if (!currentUser || !role) {
      setShowWarning(false);
      return;
    }

    // Initialize activity timestamp on login / mount
    const initialNow = Date.now();
    lastActivityRef.current = initialNow;
    try {
      localStorage.setItem('eshuttle_last_activity', initialNow.toString());
    } catch {}
    isLoggingOutRef.current = false;

    let lastRecorded = 0;
    const handleUserInteraction = () => {
      const now = Date.now();
      // Throttle recording to at most once every 1,000ms to maintain optimal 60fps performance
      if (now - lastRecorded > 1000) {
        lastRecorded = now;
        lastActivityRef.current = now;
        try {
          localStorage.setItem('eshuttle_last_activity', now.toString());
        } catch {}
      }
    };

    // Events to monitor for genuine user activity
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'touchmove',
      'scroll',
      'click',
      'wheel',
      'pointerdown',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleUserInteraction, { passive: true });
    });

    // Cross-tab synchronization: If user is active in another tab, update activity time here
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'eshuttle_last_activity' && e.newValue) {
        const remoteTime = parseInt(e.newValue, 10);
        if (!isNaN(remoteTime) && remoteTime > lastActivityRef.current) {
          lastActivityRef.current = remoteTime;
          setShowWarning(false);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // 2. Periodic Inactivity Check Timer (Runs every 1 second)
    const checkInterval = setInterval(() => {
      if (isLoggingOutRef.current) return;

      let storedTime = 0;
      try {
        storedTime = parseInt(localStorage.getItem('eshuttle_last_activity') || '0', 10);
      } catch {}

      const effectiveLastActivity = Math.max(lastActivityRef.current, storedTime);
      const elapsed = Date.now() - effectiveLastActivity;

      // Check if 5 minutes have completely elapsed
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        isLoggingOutRef.current = true;
        clearInterval(checkInterval);
        setShowWarning(false);

        // Record expiration reason for AuthModal alert banner
        try {
          sessionStorage.setItem('eshuttle_session_expired_reason', 'inactivity_5min');
          sessionStorage.setItem('eshuttle_session_expired_time', Date.now().toString());
        } catch {}

        toast.warning('Your session has expired due to 5 minutes of inactivity. Please sign in again.', {
          title: 'Session Expired',
          duration: 9000,
        });

        // Trigger safe Firebase sign out
        logout().catch(() => {});
        return;
      }

      // Check if we entered the final 60 seconds warning window (elapsed >= 4 minutes)
      const timeUntilExpiration = INACTIVITY_TIMEOUT_MS - elapsed;
      if (timeUntilExpiration <= WARNING_THRESHOLD_MS) {
        const remainingSecs = Math.max(1, Math.ceil(timeUntilExpiration / 1000));
        setSecondsRemaining(remainingSecs);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserInteraction);
      });
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(checkInterval);
    };
  }, [currentUser, role, logout]);

  if (!showWarning || !currentUser || !role) {
    return null;
  }

  // Calculate percentage of remaining warning time (from 60s down to 0s)
  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / 60) * 100));

  return (
    <div
      id="session-inactivity-warning-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        id="session-inactivity-warning-modal"
        className="w-full max-w-md bg-white border-2 border-[#0D47A1] rounded-3xl p-6 shadow-2xl space-y-5 text-[#0D47A1] relative"
        role="alertdialog"
        aria-labelledby="session-warning-title"
        aria-describedby="session-warning-description"
      >
        {/* Header with animated countdown icon */}
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border-2 border-amber-500 text-amber-600 flex items-center justify-center shrink-0 shadow-inner">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-amber-100 border border-amber-400 text-amber-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                Security Timeout
              </span>
            </div>
            <h3 id="session-warning-title" className="text-lg font-black text-[#0D47A1] leading-tight">
              Session Expiring Soon
            </h3>
          </div>
        </div>

        {/* Message and Countdown Display */}
        <div className="bg-[#E3F2FD]/60 border border-[#0D47A1]/30 rounded-2xl p-4 text-center space-y-3">
          <p id="session-warning-description" className="text-xs text-slate-700 font-medium leading-relaxed">
            You have been inactive for over <strong className="text-[#0D47A1]">4 minutes</strong>. To protect your account, your session will automatically close in:
          </p>

          {/* Large prominent seconds countdown badge */}
          <div className="flex items-center justify-center">
            <div className="px-5 py-2.5 bg-white border-2 border-amber-500 rounded-2xl shadow-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 animate-bounce" />
              <span className="text-2xl font-black font-mono text-amber-600">
                {secondsRemaining}
              </span>
              <span className="text-xs font-black uppercase text-amber-700">seconds</span>
            </div>
          </div>

          {/* Visual Time Progress Bar */}
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden border border-slate-300">
            <div
              className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                secondsRemaining <= 15
                  ? 'bg-rose-600'
                  : secondsRemaining <= 30
                  ? 'bg-amber-500'
                  : 'bg-[#0D47A1]'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={handleManualLogout}
            className="py-3 px-3 rounded-xl border-2 border-slate-300 hover:border-rose-400 hover:bg-rose-50 text-slate-700 hover:text-rose-700 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>

          <button
            type="button"
            onClick={handleExtendSession}
            autoFocus
            className="py-3 px-3 rounded-xl bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs uppercase shadow-md shadow-blue-900/30 flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Stay Signed In</span>
          </button>
        </div>
      </div>
    </div>
  );
};
