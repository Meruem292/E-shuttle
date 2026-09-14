import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

interface BackHandler {
  id: string;
  handler: () => boolean | void; // return true if handled, or false/void
  priority: number; // higher priority executes first
}

interface NativeBackContextType {
  registerBackHandler: (id: string, handler: () => boolean | void, priority?: number) => () => void;
  showExitToast: boolean;
}

const NativeBackContext = createContext<NativeBackContextType | null>(null);

export const NativeBackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handlersRef = useRef<BackHandler[]>([]);
  const [showExitToast, setShowExitToast] = useState(false);
  const lastBackPressTimeRef = useRef<number>(0);
  const exitToastTimeoutRef = useRef<any>(null);

  // Register a back handler
  const registerBackHandler = useCallback(
    (id: string, handler: () => boolean | void, priority: number = 10) => {
      // Remove any existing with same id
      handlersRef.current = handlersRef.current.filter((h) => h.id !== id);
      handlersRef.current.push({ id, handler, priority });
      // Sort descending by priority (highest priority first)
      handlersRef.current.sort((a, b) => b.priority - a.priority);

      // Make sure browser history has a dummy state pushed so back button triggers popstate
      if (typeof window !== 'undefined') {
        const state = window.history.state;
        if (!state || !state.__eshuttle_pwa__) {
          window.history.pushState({ __eshuttle_pwa__: true, id, t: Date.now() }, '');
        }
      }

      // Return unregister cleanup function
      return () => {
        handlersRef.current = handlersRef.current.filter((h) => h.id !== id);
      };
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Ensure base initial state is in history
    if (!window.history.state || !window.history.state.__eshuttle_root__) {
      window.history.replaceState({ __eshuttle_root__: true }, '');
      window.history.pushState({ __eshuttle_pwa__: true, t: Date.now() }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
      const activeHandlers = [...handlersRef.current];

      if (activeHandlers.length > 0) {
        // Execute the top priority handler
        const top = activeHandlers[0];
        try {
          const handled = top.handler();
          if (handled !== false) {
            // Push history state back so next back press also gets intercepted
            window.history.pushState({ __eshuttle_pwa__: true, t: Date.now() }, '');
            return;
          }
        } catch (err) {
          console.error('Error in native back handler:', err);
        }
      }

      // If no modal or sub-view handler was active, we are at root
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        // Double tap within 2 seconds: allow exit or let browser navigate back
        setShowExitToast(false);
        // Do not re-push state, let it exit naturally
      } else {
        // First tap at root: push state back to prevent sudden exit, show native toast
        lastBackPressTimeRef.current = now;
        window.history.pushState({ __eshuttle_pwa__: true, t: Date.now() }, '');

        setShowExitToast(true);
        if (exitToastTimeoutRef.current) {
          clearTimeout(exitToastTimeoutRef.current);
        }
        exitToastTimeoutRef.current = setTimeout(() => {
          setShowExitToast(false);
        }, 2000);
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (exitToastTimeoutRef.current) {
        clearTimeout(exitToastTimeoutRef.current);
      }
    };
  }, []);

  return (
    <NativeBackContext.Provider value={{ registerBackHandler, showExitToast }}>
      {children}

      {/* Native App Style Exit Confirmation Toast */}
      {showExitToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="bg-slate-900/95 text-slate-100 text-xs font-semibold px-4 py-2.5 rounded-full border border-slate-700 shadow-2xl backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            <span>Press back again to exit E-Shuttle</span>
          </div>
        </div>
      )}
    </NativeBackContext.Provider>
  );
};

export const useNativeBack = () => {
  const context = useContext(NativeBackContext);
  if (!context) {
    return {
      registerBackHandler: () => () => {},
      showExitNotification: () => {},
    };
  }
  return context;
};

// Convenience Hook for components to bind back button to any open state
export const useBackHandler = (
  isOpen: boolean,
  onBack: () => boolean | void,
  priority: number = 10,
  idPrefix: string = 'modal'
) => {
  const { registerBackHandler } = useNativeBack();
  const idRef = useRef(`${idPrefix}-${Math.random().toString(36).slice(2, 9)}`);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler(
      idRef.current,
      () => {
        return onBackRef.current();
      },
      priority
    );

    return () => {
      unregister();
    };
  }, [isOpen, priority, registerBackHandler]);
};
