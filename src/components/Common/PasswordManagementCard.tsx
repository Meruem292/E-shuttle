import React, { useState, useEffect } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Calendar,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  calculatePasswordAgeStatus,
  changeAccountPassword,
  updateGlobalPasswordExpiryPolicy,
  subscribeToPasswordPolicy,
  DEFAULT_PASSWORD_EXPIRY_DAYS,
  PRESET_DAY_RANGES,
  PasswordAgeStatus,
} from '../../services/passwordPolicyService';

interface PasswordManagementCardProps {
  isAdminMasterView?: boolean;
  onAdminPinPrompt?: (onConfirm: () => Promise<void>) => void;
  className?: string;
}

export const PasswordManagementCard: React.FC<PasswordManagementCardProps> = ({
  isAdminMasterView = false,
  onAdminPinPrompt,
  className = '',
}) => {
  const { currentUser, userProfile, driverProfile, role, refreshProfile } = useAuth();
  const toast = useToast();

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const [isChanging, setIsChanging] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPolicyEditorOpen, setIsPolicyEditorOpen] = useState(false);

  // Global policy days (loaded from adminSettings)
  const [globalPolicyDays, setGlobalPolicyDays] = useState<number>(DEFAULT_PASSWORD_EXPIRY_DAYS);
  const [customDaysInput, setCustomDaysInput] = useState<string>('90');
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [policySaveMsg, setPolicySaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Subscribe to real-time global policy days
  useEffect(() => {
    const unsub = subscribeToPasswordPolicy((days) => {
      setGlobalPolicyDays(days);
      setCustomDaysInput(days.toString());
    });
    return () => unsub();
  }, []);

  const activeProfile = role === 'driver' ? driverProfile : userProfile;
  const status: PasswordAgeStatus = calculatePasswordAgeStatus(activeProfile, globalPolicyDays);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) return;

    if (newPass.length < 6) {
      const err = 'New password must be at least 6 characters long.';
      setStatusMsg({ type: 'error', text: err });
      toast.warning(err);
      return;
    }

    if (newPass !== confirmPass) {
      const err = 'New password and confirmation do not match.';
      setStatusMsg({ type: 'error', text: err });
      toast.warning(err);
      return;
    }

    if (currentPass === newPass) {
      const err = 'New password must be different from your current password.';
      setStatusMsg({ type: 'error', text: err });
      toast.warning(err);
      return;
    }

    const executeChange = async () => {
      setIsChanging(true);
      setStatusMsg(null);

      try {
        const res = await changeAccountPassword({
          currentUser,
          currentPassword: currentPass,
          newPassword: newPass,
          role: role || 'customer',
          userProfile,
          driverProfile,
        });

        setStatusMsg({ type: 'success', text: res.message });
        toast.success(res.message);
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
        setIsFormOpen(false);
        await refreshProfile();
      } catch (err: any) {
        console.error('Password change failed:', err);
        const errorText = err.message || 'Failed to change password. Please verify current password.';
        setStatusMsg({ type: 'error', text: errorText });
        toast.error(errorText);
      } finally {
        setIsChanging(false);
      }
    };

    // If Admin Master View and onAdminPinPrompt provided, wrap in PIN authorization
    if (isAdminMasterView && onAdminPinPrompt) {
      onAdminPinPrompt(executeChange);
    } else {
      await executeChange();
    }
  };

  const handleSavePolicyDays = async (daysToSave: number) => {
    if (daysToSave < 1 || daysToSave > 365) {
      toast.warning('Password rotation day range must be between 1 and 365 days.');
      return;
    }

    setIsSavingPolicy(true);
    setPolicySaveMsg(null);

    try {
      await updateGlobalPasswordExpiryPolicy(daysToSave, {
        uid: currentUser?.uid || 'admin',
        email: currentUser?.email || undefined,
        name: userProfile?.fullName || 'Administrator',
      });

      setGlobalPolicyDays(daysToSave);
      setCustomDaysInput(daysToSave.toString());
      setPolicySaveMsg({
        type: 'success',
        text: `Password rotation schedule updated: Users must change password every ${daysToSave} days.`,
      });
      toast.success(`Password rotation policy set to ${daysToSave} days!`);
      setTimeout(() => setPolicySaveMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to update password policy:', err);
      const msg = err.message || 'Failed to update password rotation policy.';
      setPolicySaveMsg({ type: 'error', text: msg });
      toast.error(msg);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  return (
    <div
      id="password-management-card"
      className={`bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-[#E3F2FD] border border-[#0D47A1] text-[#0D47A1] flex items-center justify-center shrink-0 shadow-sm">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-sm text-[#0D47A1]">
              {isAdminMasterView ? 'Admin Password & Rotation Policy' : 'Password & Security Rotation'}
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              Manage password credentials and day-range rotation schedule
            </p>
          </div>
        </div>

        {/* Security Health Status Badge */}
        <span
          className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 border ${
            status.status === 'expired'
              ? 'bg-rose-100 text-rose-800 border-rose-300'
              : status.status === 'expiring_soon'
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
          }`}
        >
          {status.status === 'expired' ? (
            <>
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              <span>Change Required</span>
            </>
          ) : status.status === 'expiring_soon' ? (
            <>
              <Clock className="w-3 h-3 text-amber-600" />
              <span>Due in {status.daysRemaining}d</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Password Healthy</span>
            </>
          )}
        </span>
      </div>

      {/* Password Rotation Schedule Summary Box */}
      <div className="bg-[#F8FAFC] border-2 border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0D47A1]" />
            <span className="text-xs font-black text-[#0D47A1] uppercase tracking-wide">
              Rotation Day Range: Every {globalPolicyDays} Days
            </span>
          </div>
          <span className="text-[11px] font-mono font-bold text-slate-600">
            {status.daysSinceChange === 0
              ? 'Changed today'
              : `${status.daysSinceChange} day${status.daysSinceChange === 1 ? '' : 's'} ago`}
          </span>
        </div>

        {/* Visual Rotation Lifecycle Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-slate-500">
            <span>Password Age: {status.daysSinceChange} / {globalPolicyDays} days</span>
            <span>
              {status.isExpired
                ? 'Expired'
                : `${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'} remaining`}
            </span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden border border-slate-300">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                status.status === 'expired'
                  ? 'bg-rose-500'
                  : status.status === 'expiring_soon'
                  ? 'bg-amber-500'
                  : 'bg-[#0D47A1]'
              }`}
              style={{ width: `${status.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[9px] text-slate-400 uppercase font-mono font-bold block">Last Changed:</span>
            <span className="font-extrabold text-[#0D47A1] text-xs">
              {status.lastChangedDate.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[9px] text-slate-400 uppercase font-mono font-bold block">Next Change Due:</span>
            <span
              className={`font-extrabold text-xs ${
                status.isExpired
                  ? 'text-rose-600 font-black'
                  : status.isExpiringSoon
                  ? 'text-amber-600 font-black'
                  : 'text-[#0D47A1]'
              }`}
            >
              {status.nextChangeDueDate.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Expiration Warning Alert if overdue */}
        {status.isExpired && (
          <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-900 flex items-start gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black">Password Rotation Overdue</p>
              <p className="text-[11px] text-rose-800">
                Your password was set {status.daysSinceChange} days ago, exceeding the {globalPolicyDays}-day rotation policy. Please update your password below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ADMIN-ONLY: Configure System-Wide Password Expiration Day Range */}
      {role === 'admin' && (
        <div className="bg-blue-50/60 border border-[#0D47A1]/30 rounded-2xl p-3.5 space-y-3">
          <button
            type="button"
            onClick={() => setIsPolicyEditorOpen(!isPolicyEditorOpen)}
            className="w-full flex items-center justify-between text-xs font-black text-[#0D47A1] hover:text-[#1565C0]"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#0D47A1]" />
              <span>Configure System Password Day Range Policy</span>
            </div>
            {isPolicyEditorOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isPolicyEditorOpen && (
            <div className="space-y-3 pt-2 border-t border-[#0D47A1]/20 animate-in fade-in">
              <p className="text-[11px] text-slate-600">
                Select or specify the required day range before users, drivers, and admins must rotate their password:
              </p>

              {/* Preset Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESET_DAY_RANGES.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleSavePolicyDays(days)}
                    disabled={isSavingPolicy}
                    className={`py-2 px-2.5 rounded-xl text-xs font-black transition-all border ${
                      globalPolicyDays === days
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                        : 'bg-white text-[#0D47A1] border-slate-300 hover:border-[#0D47A1]'
                    }`}
                  >
                    {days} Days
                    {days === 90 && <span className="block text-[8px] font-normal opacity-80">(Recommended)</span>}
                  </button>
                ))}
              </div>

              {/* Custom Day Range Input */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Custom Day Range (1-365 days):</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={customDaysInput}
                    onChange={(e) => setCustomDaysInput(e.target.value)}
                    className="w-full bg-white border-2 border-[#0D47A1] rounded-xl p-2 text-xs font-bold text-[#0D47A1]"
                    placeholder="Enter days (e.g. 45)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSavePolicyDays(parseInt(customDaysInput, 10) || DEFAULT_PASSWORD_EXPIRY_DAYS)}
                  disabled={isSavingPolicy}
                  className="mt-4 py-2 px-4 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black shadow-sm active:scale-95 transition-all"
                >
                  {isSavingPolicy ? 'Saving...' : 'Apply Range'}
                </button>
              </div>

              {policySaveMsg && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                    policySaveMsg.type === 'success'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}
                >
                  {policySaveMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{policySaveMsg.text}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toggle Button to Open/Close Password Change Form */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => {
            setIsFormOpen(!isFormOpen);
            setStatusMsg(null);
          }}
          className={`w-full py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
            isFormOpen
              ? 'bg-slate-100 text-slate-700 border-2 border-slate-300 hover:bg-slate-200'
              : status.isExpired
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-[#0D47A1] hover:bg-[#1565C0] text-white'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>{isFormOpen ? 'Cancel Password Change' : 'Change Account Password'}</span>
        </button>
      </div>

      {/* Password Change Form */}
      {isFormOpen && (
        <form onSubmit={handlePasswordSubmit} className="space-y-3.5 pt-2 border-t border-slate-200 animate-in fade-in">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#0D47A1]">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPass ? 'text' : 'password'}
                required
                placeholder="Enter current password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:bg-white focus:outline-none focus:border-[#1565C0] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-3 top-2.5 text-[#0D47A1] hover:text-[#1565C0]"
              >
                {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0D47A1]">New Password</label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  required
                  placeholder="At least 6 characters"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:bg-white focus:outline-none focus:border-[#1565C0] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 top-2.5 text-[#0D47A1] hover:text-[#1565C0]"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0D47A1]">Confirm New Password</label>
              <input
                type={showNewPass ? 'text' : 'password'}
                required
                placeholder="Re-enter new password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:bg-white focus:outline-none focus:border-[#1565C0]"
              />
            </div>
          </div>

          {/* Real-time Checklist for New Password */}
          {newPass.length > 0 && (
            <div className="bg-[#E3F2FD]/50 p-2.5 rounded-xl border border-[#0D47A1]/20 space-y-1 text-[10px]">
              <div className="flex items-center gap-1.5 font-bold">
                <span className={newPass.length >= 6 ? 'text-emerald-600' : 'text-slate-400'}>
                  {newPass.length >= 6 ? '✓' : '○'} At least 6 characters
                </span>
                <span className="text-slate-300">|</span>
                <span className={newPass === confirmPass && confirmPass.length > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                  {newPass === confirmPass && confirmPass.length > 0 ? '✓ Passwords match' : '○ Passwords must match'}
                </span>
              </div>
            </div>
          )}

          {statusMsg && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isChanging}
            className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-md active:scale-95 transition-transform uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 text-[#90CAF9] ${isChanging ? 'animate-spin' : ''}`} />
            <span>{isChanging ? 'Updating Password...' : 'Save New Password & Reset Schedule'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
