import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Lock,
} from 'lucide-react';
import {
  AdminPinConfig,
  getAdminPinConfig,
  updateAdminActionPin,
  resetAdminActionPinToDefault,
  listenToAdminPinConfig,
  DEFAULT_ADMIN_ACTION_PIN,
} from '../../services/adminPinService';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPinModal } from './AdminPinModal';

export const AdminPinSettingsCard: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [config, setConfig] = useState<AdminPinConfig>({
    isCustomPinSet: false,
    pinHash: '',
    pinLength: 4,
    requirePinForDestructiveActions: true,
  });

  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);
  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmNewPin, setConfirmNewPin] = useState<string>('');
  const [showPins, setShowPins] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Test Modal State
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false);
  const [testVerifiedSuccess, setTestVerifiedSuccess] = useState<boolean>(false);

  useEffect(() => {
    const unsub = listenToAdminPinConfig((cfg) => {
      setConfig(cfg);
    });
    return () => unsub();
  }, []);

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPin) {
      setErrorMsg('Please enter your current Secret PIN.');
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      setErrorMsg('New Secret PIN must be exactly 4 numeric digits.');
      return;
    }

    if (newPin !== confirmNewPin) {
      setErrorMsg('New PIN and confirmation PIN do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await updateAdminActionPin(currentPin, newPin, {
        uid: currentUser?.uid,
        email: currentUser?.email || undefined,
        fullName: userProfile?.fullName,
      });

      if (result.success) {
        setSuccessMsg(result.message);
        setCurrentPin('');
        setNewPin('');
        setConfirmNewPin('');
        setIsChangingPin(false);
      } else {
        setErrorMsg(result.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update Secret Action PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!currentPin) {
      setErrorMsg('Enter your current PIN in the field below to reset back to default.');
      setIsChangingPin(true);
      return;
    }

    setLoading(true);
    try {
      const result = await resetAdminActionPinToDefault(currentPin, {
        uid: currentUser?.uid,
        email: currentUser?.email || undefined,
        fullName: userProfile?.fullName,
      });

      if (result.success) {
        setSuccessMsg(result.message);
        setCurrentPin('');
        setIsChangingPin(false);
      } else {
        setErrorMsg(result.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#0D47A1]/20 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0D47A1] text-white flex items-center justify-center shadow-sm">
            <KeyRound className="w-5 h-5 text-[#90CAF9]" />
          </div>
          <div>
            <h3 className="font-black text-sm text-[#0D47A1]">Admin Action Secret PIN</h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Secondary security PIN gatekeeper required before performing critical actions
            </p>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 self-start sm:self-auto ${
            config.isCustomPinSet
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : 'bg-amber-100 text-amber-800 border border-amber-300'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{config.isCustomPinSet ? 'Custom PIN Active' : 'Default PIN (8888)'}</span>
        </span>
      </div>

      {/* Info Card */}
      <div className="p-3.5 bg-[#E3F2FD]/60 border border-[#0D47A1]/30 rounded-2xl text-xs space-y-1.5 text-[#0D47A1]">
        <div className="flex items-center gap-1.5 font-black">
          <ShieldAlert className="w-4 h-4 text-[#0D47A1]" />
          <span>Sensitive Operations Protected by Secret PIN</span>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
          Whenever you delete user/driver accounts, modify dispatch fares, delete service zones or stations,
          clear audit trails, or assign RFID cards, you will be prompted to enter this Secret PIN to prevent accidental
          or unauthorized changes.
        </p>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Test Success Notification */}
      {testVerifiedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Secret Action PIN verified successfully! Guard mechanism is active.</span>
        </div>
      )}

      {/* PIN Change Form / Toggle */}
      {!isChangingPin ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setIsChangingPin(true);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className="px-4 py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{config.isCustomPinSet ? 'Change Secret PIN' : 'Set Custom Secret PIN'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTestModalOpen(true);
              setTestVerifiedSuccess(false);
            }}
            className="px-4 py-2.5 bg-white border-2 border-[#0D47A1] text-[#0D47A1] hover:bg-[#E3F2FD] font-black text-xs rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0D47A1]" />
            <span>Test Action PIN Verification</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleUpdatePin} className="space-y-3 pt-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-[#0D47A1]">
              {config.isCustomPinSet ? 'Update Secret Action PIN' : 'Configure Custom Secret PIN'}
            </h4>
            <button
              type="button"
              onClick={() => {
                setIsChangingPin(false);
                setErrorMsg(null);
              }}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#0D47A1]">
              Current Secret PIN {!config.isCustomPinSet && <span className="text-slate-400 font-normal">(Default: 8888)</span>}
            </label>
            <div className="relative">
              <input
                type={showPins ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                required
                placeholder="Enter current PIN"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:outline-none focus:border-[#1565C0] pr-10 tracking-widest"
              />
              <button
                type="button"
                onClick={() => setShowPins(!showPins)}
                className="absolute right-3 top-2.5 text-[#0D47A1] hover:text-[#1565C0]"
              >
                {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0D47A1]">New Secret PIN (4 digits)</label>
              <input
                type={showPins ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                required
                placeholder="4 numeric digits"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:outline-none focus:border-[#1565C0] tracking-widest"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0D47A1]">Confirm New PIN</label>
              <input
                type={showPins ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                required
                placeholder="Re-enter 4-digit PIN"
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:outline-none focus:border-[#1565C0] tracking-widest"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{loading ? 'Saving Secret PIN...' : 'Save New Secret PIN'}</span>
            </button>

            {config.isCustomPinSet && (
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={loading}
                className="py-2.5 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                title="Reset back to default 8888 PIN"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to 8888</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Test Verification Modal */}
      <AdminPinModal
        isOpen={testModalOpen}
        title="Admin Action Security PIN Test"
        actionDescription="Verify your Secret PIN to confirm that administrative protection is active"
        severity="info"
        onConfirm={() => {
          setTestModalOpen(false);
          setTestVerifiedSuccess(true);
          setTimeout(() => setTestVerifiedSuccess(false), 4000);
        }}
        onCancel={() => setTestModalOpen(false)}
      />
    </div>
  );
};
