// contexts/ProspectsProvider.tsx
import React, { createContext, useContext } from 'react';
import { useAppStore, useModalHelpers, type ModalType, type Toast } from '../store/useAppStore';
import type { Prospect } from '../shared/types/database';

// ============================================================================
// CONTEXT INTERFACE
// ============================================================================

interface ProspectsContextValue {
  openModal: (type: ModalType, prospect?: Prospect) => void;
  closeModal: () => void;
  showToastNotification: (message: string, type?: Toast['type'], duration?: number) => void;
  copyToClipboard: (text: string, id?: number) => Promise<void>;
}

// ============================================================================
// CREATE CONTEXT
// ============================================================================

const ProspectsContext = createContext<ProspectsContextValue | null>(null);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export const ProspectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    openModal,
    closeModal,
    showToastNotification,
    copyToClipboard,
  } = useModalHelpers();
  
  const value: ProspectsContextValue = {
    openModal,
    closeModal,
    showToastNotification,
    copyToClipboard,
  };
  
  return (
    <ProspectsContext.Provider value={value}>
      {children}
    </ProspectsContext.Provider>
  );
};

// ============================================================================
// CONSUMER HOOK
// ============================================================================

export const useProspectsContext = () => {
  const context = useContext(ProspectsContext);
  if (!context) {
    throw new Error('useProspectsContext must be used within ProspectsProvider');
  }
  return context;
};