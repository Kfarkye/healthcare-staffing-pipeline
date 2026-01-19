// ============================================================================
// src/components/shared/EmailModalShell.tsx
// Production-ready modal shell with portal rendering, focus management,
// and full WCAG 2.1 accessibility compliance.
// ============================================================================

import React, { useEffect, useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const cn = (...classes: (string | boolean | null | undefined)[]) => 
  classes.filter(Boolean).join(' ');

export interface EmailModalShellProps {
  // State
  isOpen: boolean;
  onClose: () => void;

  // Content
  title: string;
  subtitle?: string;
  children: React.ReactNode;

  // Optional Slots
  headerActions?: React.ReactNode;
  rightPanel?: React.ReactNode;
  footer?: React.ReactNode;

  // Layout
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '5xl' | '6xl';

  // Behavior
  busy?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  usePortal?: boolean;

  // Accessibility
  initialFocusRef?: React.RefObject<HTMLElement>;
  describedById?: string;
}

// Static maxWidth mapping (Tailwind purges dynamic classes)
const MAX_WIDTH_MAP = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
} as const;

export function EmailModalShell({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  headerActions,
  rightPanel,
  footer,
  maxWidth = '6xl',
  busy = false,
  closeOnBackdrop = true,
  closeOnEsc = true,
  usePortal = true,
  initialFocusRef,
  describedById,
}: EmailModalShellProps) {
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  // Focus management: trap focus and return to trigger on close
  useEffect(() => {
    if (isOpen) {
      // Store element that opened modal
      setTriggerElement(document.activeElement as HTMLElement);
      
      // Get all focusable elements
      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements && focusableElements.length > 0) {
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Focus initial element
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else {
          firstElement.focus();
        }

        // Trap focus within modal
        const handleTabKey = (e: KeyboardEvent) => {
          if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        };
        
        modalRef.current?.addEventListener('keydown', handleTabKey);
        return () => modalRef.current?.removeEventListener('keydown', handleTabKey);
      }
    } else if (triggerElement) {
      // Return focus to trigger element
      triggerElement.focus();
      setTriggerElement(null);
    }
  }, [isOpen, initialFocusRef, triggerElement]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen || !closeOnEsc || busy) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEsc, busy, onClose]);

  // Prevent body scroll and hide app from screen readers
  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      
      // Hide app root from screen readers while modal is open
      const appRoot = document.getElementById('root');
      if (appRoot) {
        appRoot.setAttribute('aria-hidden', 'true');
      }
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      
      const appRoot = document.getElementById('root');
      if (appRoot) {
        appRoot.removeAttribute('aria-hidden');
      }
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);
  
  const modalContent = isOpen ? (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      data-testid="email-modal-shell"
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeOnBackdrop && !busy ? onClose : undefined}
        aria-hidden="true"
      />
      
      {/* Modal Container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById || (subtitle ? subtitleId : undefined)}
        aria-busy={busy}
        tabIndex={-1}
        className={cn(
          "relative bg-white w-full h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideUp",
          MAX_WIDTH_MAP[maxWidth]
        )}
      >
        {/* Busy Indicator */}
        {busy && (
          <>
            {/* Screen reader announcement */}
            <div className="sr-only" role="status" aria-live="polite">
              Processing, please wait...
            </div>
            
            {/* Visual indicator */}
            <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden z-10" aria-hidden="true">
              <div className="absolute w-1/3 h-full bg-slate-800 animate-indeterminate" />
            </div>
          </>
        )}

        {/* Header */}
        <header className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50/50 to-white flex-shrink-0">
          <div className="flex-1 min-w-0 mr-4">
            <h2 id={titleId} className="text-lg font-bold text-slate-900 tracking-tight truncate">
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="text-sm text-slate-500 mt-0.5 tracking-wide truncate">
                {subtitle}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions}
            <button
              onClick={!busy ? onClose : undefined}
              className="p-2.5 rounded-xl hover:bg-slate-100 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close modal"
              disabled={busy}
            >
              <X size={18} className="text-slate-400 group-hover:text-slate-700 transition-colors" />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel / Main Content */}
          <div className={cn(
            "flex-1 overflow-hidden",
            rightPanel && "border-r border-slate-100"
          )}>
            {children}
          </div>
          
          {/* Right Panel Slot */}
          {rightPanel && (
            <div className="w-96 flex-shrink-0 flex flex-col bg-slate-50/30">
              {rightPanel}
            </div>
          )}
        </div>

        {/* Footer Slot */}
        {footer && (
          <footer className="px-8 py-6 border-t border-slate-100 bg-gradient-to-t from-slate-50/50 to-white flex-shrink-0">
            {footer}
          </footer>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes indeterminate {
          0% { left: -33%; }
          100% { left: 100%; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
        .animate-slideUp {
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-indeterminate {
          animation: indeterminate 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  ) : null;

  // Render via portal or inline
  if (usePortal && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  
  return modalContent;
}