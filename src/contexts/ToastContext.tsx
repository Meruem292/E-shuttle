import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Global standalone toast event dispatcher for use inside or outside React components
export const toast = {
  show: (message: string, type: ToastType = 'info', options?: ToastOptions) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('eshuttle_show_toast', {
          detail: { message, type, options },
        })
      );
    }
  },
  success: (message: string, options?: ToastOptions) => {
    toast.show(message, 'success', options);
  },
  error: (message: string, options?: ToastOptions) => {
    toast.show(message, 'error', options);
  },
  warning: (message: string, options?: ToastOptions) => {
    toast.show(message, 'warning', options);
  },
  info: (message: string, options?: ToastOptions) => {
    toast.show(message, 'info', options);
  },
  dismiss: (id: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('eshuttle_dismiss_toast', { detail: { id } })
      );
    }
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', options?: ToastOptions): string => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const duration =
        options?.duration !== undefined
          ? options.duration
          : type === 'error'
          ? 5000
          : 3500;

      const newToast: ToastItem = {
        id,
        type,
        message,
        title: options?.title,
        duration,
        action: options?.action,
        createdAt: Date.now(),
      };

      // Native haptic feedback if supported
      try {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          if (type === 'error') {
            navigator.vibrate([40, 60, 40]);
          } else if (type === 'success') {
            navigator.vibrate(35);
          }
        }
      } catch {
        // Silently catch unsupported vibration
      }

      setToasts((prev) => {
        // Limit to max 4 visible toasts to avoid viewport clutter
        const filtered = prev.slice(-3);
        return [...filtered, newToast];
      });

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, options?: ToastOptions) => showToast(message, 'success', options),
    [showToast]
  );
  const error = useCallback(
    (message: string, options?: ToastOptions) => showToast(message, 'error', options),
    [showToast]
  );
  const warning = useCallback(
    (message: string, options?: ToastOptions) => showToast(message, 'warning', options),
    [showToast]
  );
  const info = useCallback(
    (message: string, options?: ToastOptions) => showToast(message, 'info', options),
    [showToast]
  );

  // Global event listener for toast.success/error/info called outside React tree
  useEffect(() => {
    const handleCustomToast = (event: Event) => {
      const customEvent = event as CustomEvent<{
        message: string;
        type: ToastType;
        options?: ToastOptions;
      }>;
      if (customEvent.detail) {
        showToast(
          customEvent.detail.message,
          customEvent.detail.type || 'info',
          customEvent.detail.options
        );
      }
    };

    const handleCustomDismiss = (event: Event) => {
      const customEvent = event as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id) {
        dismissToast(customEvent.detail.id);
      }
    };

    window.addEventListener('eshuttle_show_toast', handleCustomToast);
    window.addEventListener('eshuttle_dismiss_toast', handleCustomDismiss);

    return () => {
      window.removeEventListener('eshuttle_show_toast', handleCustomToast);
      window.removeEventListener('eshuttle_dismiss_toast', handleCustomDismiss);
    };
  }, [showToast, dismissToast]);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        success,
        error,
        warning,
        info,
        dismissToast,
        clearAllToasts,
      }}
    >
      {children}

      {/* Global Toast Overlay Container */}
      <div
        id="global-toast-container"
        aria-live="polite"
        className="fixed top-3 left-3 right-3 sm:left-auto sm:right-5 sm:top-5 z-[999999] pointer-events-none flex flex-col items-center sm:items-end gap-2.5 max-w-sm w-full mx-auto sm:mx-0"
      >
        {toasts.map((toastItem) => {
          const isSuccess = toastItem.type === 'success';
          const isError = toastItem.type === 'error';
          const isWarning = toastItem.type === 'warning';

          return (
            <div
              key={toastItem.id}
              className={`pointer-events-auto w-full rounded-2xl shadow-xl border p-3.5 flex items-start gap-3 backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 animate-in fade-in slide-in-from-top-3 ${
                isSuccess
                  ? 'bg-emerald-50/95 border-emerald-400 text-emerald-950 shadow-emerald-900/10'
                  : isError
                  ? 'bg-rose-50/95 border-rose-400 text-rose-950 shadow-rose-900/10'
                  : isWarning
                  ? 'bg-amber-50/95 border-amber-400 text-amber-950 shadow-amber-900/10'
                  : 'bg-[#EFF6FF]/95 border-[#0D47A1]/40 text-[#0D47A1] shadow-blue-900/10'
              }`}
              role="status"
            >
              {/* Icon */}
              <div
                className={`p-1.5 rounded-xl shrink-0 mt-0.5 ${
                  isSuccess
                    ? 'bg-emerald-200/80 text-emerald-700'
                    : isError
                    ? 'bg-rose-200/80 text-rose-700'
                    : isWarning
                    ? 'bg-amber-200/80 text-amber-800'
                    : 'bg-[#0D47A1] text-white'
                }`}
              >
                {isSuccess && <CheckCircle2 className="w-5 h-5" />}
                {isError && <AlertCircle className="w-5 h-5" />}
                {isWarning && <AlertTriangle className="w-5 h-5" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pr-1">
                {toastItem.title && (
                  <h5 className="text-xs font-black tracking-tight leading-tight mb-0.5">
                    {toastItem.title}
                  </h5>
                )}
                <p className="text-xs font-semibold leading-snug break-words">
                  {toastItem.message}
                </p>

                {/* Optional Action Button */}
                {toastItem.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toastItem.action?.onClick();
                      dismissToast(toastItem.id);
                    }}
                    className="mt-2 text-[11px] font-black uppercase tracking-wider underline hover:opacity-80 transition-opacity"
                  >
                    {toastItem.action.label}
                  </button>
                )}
              </div>

              {/* Dismiss X button */}
              <button
                type="button"
                onClick={() => dismissToast(toastItem.id)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-black/5 transition-colors shrink-0 -mr-1 -mt-1"
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return resilient fallback dispatching via window events rather than crashing
    return {
      toasts: [],
      showToast: (message: string, type?: ToastType, options?: ToastOptions) => {
        toast.show(message, type, options);
        return '';
      },
      success: (message: string, options?: ToastOptions) => {
        toast.success(message, options);
        return '';
      },
      error: (message: string, options?: ToastOptions) => {
        toast.error(message, options);
        return '';
      },
      warning: (message: string, options?: ToastOptions) => {
        toast.warning(message, options);
        return '';
      },
      info: (message: string, options?: ToastOptions) => {
        toast.info(message, options);
        return '';
      },
      dismissToast: (id: string) => {
        toast.dismiss(id);
      },
      clearAllToasts: () => {},
    };
  }
  return context;
};
