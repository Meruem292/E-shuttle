import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  Delete,
  X,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { verifyAdminActionPin, DEFAULT_ADMIN_ACTION_PIN } from '../../services/adminPinService';

export interface AdminPinModalProps {
  isOpen: boolean;
  title?: string;
  actionDescription: string;
  entityName?: string;
  severity?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  pinLength?: number;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  title = 'Admin Authorization Required',
  actionDescription,
  entityName,
  severity = 'danger',
  onConfirm,
  onCancel,
  pinLength = 4,
}) => {
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMessage(null);
      setIsShaking(false);
      setIsVerifying(false);
      setAttempts(0);
      // Auto-focus the hidden input for physical keyboard users
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Keyboard navigation & typing handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length >= 4 && !isVerifying) {
          handleVerify(pin);
        }
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
        setErrorMessage(null);
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (pin.length < 4) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setErrorMessage(null);
          // If typed 4 digits, auto verify
          if (nextPin.length === 4) {
            handleVerify(nextPin);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, isVerifying, pinLength]);

  const handleKeyPress = (num: string) => {
    if (isVerifying || pin.length >= 4) return;
    const nextPin = pin + num;
    setPin(nextPin);
    setErrorMessage(null);
    if (nextPin.length === 4) {
      handleVerify(nextPin);
    }
  };

  const handleBackspace = () => {
    if (isVerifying) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    if (isVerifying) return;
    setPin('');
    setErrorMessage(null);
  };

  const handleVerify = async (pinToVerify = pin) => {
    if (pinToVerify.length < 4) {
      setErrorMessage('Please enter your 4-digit Secret PIN.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const isValid = await verifyAdminActionPin(pinToVerify);

      if (isValid) {
        setIsVerifying(false);
        await onConfirm();
      } else {
        setIsVerifying(false);
        setAttempts((prev) => prev + 1);
        setIsShaking(true);
        setErrorMessage('Incorrect Secret PIN. Please check and try again.');
        setTimeout(() => setIsShaking(false), 600);
        setPin('');
      }
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMessage('Verification failed. Please retry.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className={`bg-white border-2 border-[#0D47A1] rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 relative transition-transform ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* Hidden keyboard input for accessibility & mobile keyboards */}
        <input
          ref={inputRef}
          type="tel"
          pattern="[0-9]*"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
            setPin(val);
            if (val.length === 4) {
              handleVerify(val);
            }
          }}
          className="opacity-0 absolute -top-10 left-0 w-1 h-1 pointer-events-none"
        />

        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          title="Cancel Action"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge & Title */}
        <div className="text-center space-y-2 pt-1">
          <div
            className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center shadow-md ${
              severity === 'danger'
                ? 'bg-rose-100 border border-rose-300 text-rose-600'
                : severity === 'warning'
                ? 'bg-amber-100 border border-amber-300 text-amber-700'
                : 'bg-blue-100 border border-blue-300 text-[#0D47A1]'
            }`}
          >
            {severity === 'danger' ? (
              <ShieldAlert className="w-6 h-6" />
            ) : (
              <KeyRound className="w-6 h-6" />
            )}
          </div>

          <div>
            <h3 className="text-base font-black text-[#0D47A1] tracking-tight">{title}</h3>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">{actionDescription}</p>
            {entityName && (
              <div className="inline-block mt-1 px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-lg text-[11px] font-mono font-bold border border-slate-200">
                Target: {entityName}
              </div>
            )}
          </div>
        </div>

        {/* PIN Dots Indicator */}
        <div className="space-y-2 py-1">
          <div className="flex items-center justify-center gap-3">
            {[0, 1, 2, 3].map((index) => {
              const isFilled = index < pin.length;
              return (
                <div
                  key={index}
                  className={`w-10 h-12 rounded-2xl flex items-center justify-center border-2 transition-all font-mono font-black text-lg ${
                    isFilled
                      ? 'bg-[#0D47A1] border-[#0D47A1] text-white shadow-md scale-105'
                      : 'bg-slate-50 border-slate-300 text-slate-400'
                  }`}
                >
                  {isFilled ? (showPin ? pin[index] : '•') : ''}
                </div>
              );
            })}
          </div>

          {/* Show / Hide Toggle */}
          <div className="flex items-center justify-between px-2 text-[11px] text-slate-500 font-medium">
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="flex items-center gap-1 hover:text-[#0D47A1] font-bold transition-colors"
            >
              {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPin ? 'Hide PIN' : 'Reveal PIN'}</span>
            </button>

            <span className="text-slate-400 text-[10px]">
              Default PIN: <b className="text-slate-600 font-mono">{DEFAULT_ADMIN_ACTION_PIN}</b>
            </span>
          </div>
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* On-Screen Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              disabled={isVerifying}
              className="h-11 bg-slate-100 hover:bg-[#E3F2FD] active:bg-[#0D47A1] active:text-white text-[#0D47A1] rounded-2xl font-black text-base shadow-sm border border-slate-200 transition-all flex items-center justify-center select-none active:scale-95 disabled:opacity-50"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            disabled={isVerifying || pin.length === 0}
            className="h-11 bg-slate-50 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-xs shadow-sm border border-slate-200 transition-all flex items-center justify-center active:scale-95 disabled:opacity-40"
            title="Clear all digits"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            disabled={isVerifying}
            className="h-11 bg-slate-100 hover:bg-[#E3F2FD] active:bg-[#0D47A1] active:text-white text-[#0D47A1] rounded-2xl font-black text-base shadow-sm border border-slate-200 transition-all flex items-center justify-center select-none active:scale-95 disabled:opacity-50"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            disabled={isVerifying || pin.length === 0}
            className="h-11 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 rounded-2xl font-bold text-xs shadow-sm border border-slate-200 transition-all flex items-center justify-center active:scale-95 disabled:opacity-40"
            title="Delete last digit"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isVerifying}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors text-center"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleVerify()}
            disabled={isVerifying || pin.length < 4}
            className={`py-2.5 px-3 font-black text-xs rounded-xl shadow-md transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 ${
              severity === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-[#0D47A1] hover:bg-[#1565C0] text-white'
            } disabled:opacity-50`}
          >
            {isVerifying ? (
              <span>Verifying...</span>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Authorize</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
