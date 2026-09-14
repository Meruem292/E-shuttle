import React, { createContext, useContext, useState, useCallback } from 'react';
import { AdminPinModal } from '../components/Admin/AdminPinModal';

export interface PromptAdminPinOptions {
  title?: string;
  actionDescription: string;
  entityName?: string;
  severity?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface AdminPinContextType {
  promptAdminPin: (options: PromptAdminPinOptions) => void;
}

const AdminPinContext = createContext<AdminPinContextType | null>(null);

export const AdminPinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title?: string;
    actionDescription: string;
    entityName?: string;
    severity?: 'danger' | 'warning' | 'info';
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
  }>({
    isOpen: false,
    actionDescription: '',
    onConfirm: () => {},
  });

  const promptAdminPin = useCallback((options: PromptAdminPinOptions) => {
    setModalState({
      isOpen: true,
      title: options.title || 'Admin Authorization Required',
      actionDescription: options.actionDescription,
      entityName: options.entityName,
      severity: options.severity || 'danger',
      onConfirm: async () => {
        setModalState((prev) => ({ ...prev, isOpen: false }));
        await options.onConfirm();
      },
      onCancel: () => {
        setModalState((prev) => ({ ...prev, isOpen: false }));
        if (options.onCancel) {
          options.onCancel();
        }
      },
    });
  }, []);

  return (
    <AdminPinContext.Provider value={{ promptAdminPin }}>
      {children}
      <AdminPinModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        actionDescription={modalState.actionDescription}
        entityName={modalState.entityName}
        severity={modalState.severity}
        onConfirm={modalState.onConfirm}
        onCancel={modalState.onCancel || (() => setModalState((prev) => ({ ...prev, isOpen: false })))}
      />
    </AdminPinContext.Provider>
  );
};

export const useAdminPin = (): AdminPinContextType => {
  const context = useContext(AdminPinContext);
  if (!context) {
    return {
      promptAdminPin: (options: PromptAdminPinOptions) => {
        // Fallback directly executing confirm if context is not mounted
        options.onConfirm();
      },
    };
  }
  return context;
};
