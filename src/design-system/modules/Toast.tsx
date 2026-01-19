// ============================================================================
// Design System - Toast Component (Organism)
// Notification system with variants and auto-dismiss
// ============================================================================

import React, { useEffect } from 'react';
import { CheckIcon, XIcon } from '../icons';
import { shadows } from '../tokens';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  show: boolean;
  onClose: () => void;
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  show,
  onClose,
  duration = 4000,
  position = 'bottom-right'
}) => {
  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);
  
  if (!show) return null;
  
  const positions = {
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-center': 'top-6 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2',
  };
  
  const variants = {
    success: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      icon: 'text-emerald-600',
      IconComponent: CheckIcon,
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-900',
      icon: 'text-red-600',
      IconComponent: XIcon,
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      icon: 'text-blue-600',
      IconComponent: CheckIcon,
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-900',
      icon: 'text-amber-600',
      IconComponent: XIcon,
    },
  };
  
  const variant = variants[type];
  const { IconComponent } = variant;
  
  return (
    <div className={`fixed ${positions[position]} z-50 animate-in slide-in-from-bottom-5 fade-in duration-300`}>
      <div 
        className={`
          ${variant.bg} ${variant.border} ${variant.text} 
          px-4 py-3 rounded-lg border flex items-center gap-3 max-w-md min-w-[200px]
        `}
        style={{ boxShadow: shadows.lg }}
      >
        <div className={`${variant.icon} flex-shrink-0`}>
          <IconComponent size={18} />
        </div>
        
        <span className="text-sm font-medium flex-1">
          {message}
        </span>
        
        <button
          onClick={onClose}
          className={`${variant.icon} hover:opacity-70 transition-opacity flex-shrink-0`}
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
};