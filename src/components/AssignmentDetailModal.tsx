// ============================================================================
// src/components/AssignmentDetailModal.tsx
// JONY IVE CLARITY: Every element earns its place
// Design system synchronized with all dashboards
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import {
  X, Phone, Mail, ExternalLink, Calendar, Building2, DollarSign,
  AlertCircle, Eye, LogOut, CheckCircle, Clock, Zap, User, MapPin, Briefcase,
} from 'lucide-react';
import type { ActiveAssignment } from '../lib/supabase/assignments';

// ============================================================================
// DESIGN SYSTEM - Unified with all dashboards
// ============================================================================

const DESIGN = {
  space: {
    xs: '0.5rem',
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
  },
  text: {
    label: 'text-[10px] font-semibold uppercase tracking-wider text-slate-500',
    value: 'text-[13px] font-medium text-slate-900',
    input: 'text-[13px] text-slate-900',
    body: 'text-[12px] text-slate-600',
    caption: 'text-[11px] text-slate-500',
    heading: 'text-[16px] font-semibold tracking-tight text-slate-900',
    stat: 'text-3xl font-bold tracking-tighter tabular-nums',
  },
  colors: {
    primary: 'slate-900',
    primaryHover: 'slate-800',
    secondary: 'slate-600',
    border: 'slate-200',
    borderHover: 'slate-300',
    bgCard: 'white',
    bgSubtle: 'slate-50',
    bgHover: 'slate-100',
    success: 'emerald-600',
    warning: 'amber-500',
    danger: 'red-500',
  },
  elevation: {
    card: 'shadow-sm border',
    float: 'shadow-md border',
    modal: 'shadow-2xl border',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
  },
  transition: 'transition-all duration-150 ease-out',
};

// ============================================================================
// TYPES
// ============================================================================

interface AssignmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: ActiveAssignment;
  onToggleRetention: (id: number) => void;
  onToggleExiting: (id: number) => void;
  onEmail: (assignment: ActiveAssignment) => void;
  onUpdateStage?: (id: number, newStage: string) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EXTENSION_STAGES = [
  { value: 'not_started', label: 'Not Started', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'outreach', label: 'Outreach', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'interested', label: 'Interested', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'requested', label: 'Requested', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'extension_approved', label: 'Approved', color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'signed', label: 'Signed', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

// ============================================================================
// UTILITIES
// ============================================================================

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatCurrency = (amount: number | null): string => {
  if (!amount) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const getUrgencyLevel = (daysToEnd: number): 'critical' | 'warning' | 'normal' => {
  if (daysToEnd <= 35) return 'critical';
  if (daysToEnd <= 56) return 'warning';
  return 'normal';
};

// ============================================================================
// TOAST - Feedback notification
// ============================================================================

const Toast: React.FC<{
  message: string;
  type: 'success' | 'error' | 'info';
  onDismiss: () => void;
}> = ({ message, type, onDismiss }) => {
  const styles = {
    info: 'bg-slate-900 text-white',
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
  };

  const Icon = type === 'success' ? CheckCircle : AlertCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        `absolute top-4 right-4 z-[60] flex items-center gap-3 ${DESIGN.radius.md} px-5 py-3.5 text-[13px] font-medium shadow-2xl backdrop-blur-sm animate-slideDown`,
        styles[type]
      )}
    >
      <Icon size={18} strokeWidth={2.5} />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className={`ml-4 -mr-2 p-1 ${DESIGN.radius.full} hover:bg-white/10 ${DESIGN.transition} active:scale-95`}
        aria-label="Dismiss"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
};

// ============================================================================
// INFO CARD - Data display card
// ============================================================================

const InfoCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
}> = ({ icon: Icon, label, value }) => (
  <div className={cn(
    `flex items-start gap-3 p-3 bg-${DESIGN.colors.bgCard} ${DESIGN.radius.md} border border-${DESIGN.colors.border}/80 ${DESIGN.transition}`,
    `hover:shadow-md hover:border-${DESIGN.colors.borderHover} hover:-translate-y-0.5`
  )}>
    <Icon size={18} className="text-slate-400 mt-0.5 shrink-0" strokeWidth={2} />
    <div className="flex-1 min-w-0">
      <p className={DESIGN.text.label}>{label}</p>
      <p className={`${DESIGN.text.value} truncate mt-0.5`}>{value}</p>
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AssignmentDetailModal: React.FC<AssignmentDetailModalProps> = ({
  isOpen,
  onClose,
  assignment,
  onToggleRetention,
  onToggleExiting,
  onEmail,
  onUpdateStage,
  showToast: externalShowToast,
}) => {
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const urgencyLevel = getUrgencyLevel(assignment.days_to_end);
  const isRetention = assignment.is_looking_for_new_facility;
  const isExiting = assignment.is_exiting;

  const showToastInternal = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      const newToast = { id: Date.now(), message: msg, type };
      setToast(newToast);
      setTimeout(() => {
        setToast((current) => (current?.id === newToast.id ? null : current));
      }, 4000);

      if (externalShowToast) {
        externalShowToast(msg, type);
      }
    },
    [externalShowToast]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleToggleMode = useCallback(() => {
    setIsChangingMode(true);
    onToggleRetention(assignment.id);
    showToastInternal(
      `Switched to ${isRetention ? 'Extension' : 'Retention'}`,
      'success'
    );
    setTimeout(() => setIsChangingMode(false), 500);
  }, [assignment.id, onToggleRetention, isRetention, showToastInternal]);

  const handleMarkExiting = useCallback(() => {
    onToggleExiting(assignment.id);
    showToastInternal('Marked as exiting', 'info');
  }, [assignment.id, onToggleExiting, showToastInternal]);

  const handleStageChange = useCallback(
    (newStage: string) => {
      if (onUpdateStage) {
        onUpdateStage(assignment.id, newStage);
        const stageName = EXTENSION_STAGES.find((s) => s.value === newStage)?.label;
        showToastInternal(`Updated to ${stageName}`, 'success');
      }
    },
    [assignment.id, onUpdateStage, showToastInternal]
  );

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.15s ease-out; }
        .animate-fadeInUp { animation: fadeInUp 0.2s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={modalRef}
          className={cn(
            `relative w-full max-w-3xl bg-${DESIGN.colors.bgSubtle} ${DESIGN.radius.lg} ${DESIGN.elevation.modal} border-${DESIGN.colors.border}/50`,
            'animate-fadeInUp pointer-events-auto flex flex-col max-h-[90vh]'
          )}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assignment-detail-title"
          tabIndex={-1}
        >
          {/* Toast */}
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onDismiss={() => setToast(null)}
            />
          )}

          {/* Header */}
          <header className={cn(
            `px-8 py-5 border-b border-${DESIGN.colors.border} flex items-start justify-between`,
            `sticky top-0 bg-gradient-to-b from-${DESIGN.colors.bgSubtle} to-white backdrop-blur-lg rounded-t-2xl z-10`
          )}>
            <div className="flex items-start gap-4 flex-1">
              {/* Icon Badge */}
              <div
                className={cn(
                  `p-2.5 ${DESIGN.radius.md} border ${DESIGN.elevation.card} ${DESIGN.transition}`,
                  'hover:scale-110 hover:rotate-3',
                  urgencyLevel === 'critical' && 'bg-red-100 border-red-200',
                  urgencyLevel === 'warning' && 'bg-amber-100 border-amber-200',
                  urgencyLevel === 'normal' && 'bg-blue-100 border-blue-200'
                )}
              >
                <Briefcase
                  className={cn(
                    'w-5 h-5',
                    urgencyLevel === 'critical' && 'text-red-600',
                    urgencyLevel === 'warning' && 'text-amber-600',
                    urgencyLevel === 'normal' && 'text-blue-600'
                  )}
                  strokeWidth={2.5}
                />
              </div>

              <div className="flex-1">
                <h2 id="assignment-detail-title" className={DESIGN.text.heading}>
                  {assignment.candidate_name}
                </h2>

                <div className="flex items-center gap-2 mt-2 mb-3">
                  {urgencyLevel === 'critical' && (
                    <span className={cn(
                      `inline-flex items-center gap-1.5 px-2 py-0.5 ${DESIGN.radius.sm}`,
                      'bg-red-100 text-red-700 text-[10px] font-semibold uppercase tracking-wider shadow-sm'
                    )}>
                      <AlertCircle size={10} strokeWidth={2.5} />
                      Urgent
                    </span>
                  )}
                  {isRetention && (
                    <span className={cn(
                      `inline-flex items-center gap-1.5 px-2 py-0.5 ${DESIGN.radius.sm}`,
                      'bg-blue-100 text-blue-700 text-[10px] font-semibold uppercase tracking-wider shadow-sm'
                    )}>
                      <Eye size={10} strokeWidth={2.5} />
                      Retention
                    </span>
                  )}
                  {isExiting && (
                    <span className={cn(
                      `inline-flex items-center gap-1.5 px-2 py-0.5 ${DESIGN.radius.sm}`,
                      'bg-red-100 text-red-700 text-[10px] font-semibold uppercase tracking-wider shadow-sm'
                    )}>
                      <LogOut size={10} strokeWidth={2.5} />
                      Exiting
                    </span>
                  )}
                  {!isRetention && !isExiting && (
                    <span className={cn(
                      `inline-flex items-center gap-1.5 px-2 py-0.5 ${DESIGN.radius.sm}`,
                      'bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wider shadow-sm'
                    )}>
                      <Zap size={10} strokeWidth={2.5} />
                      Extension
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-slate-400" strokeWidth={2} />
                  <span className={`${DESIGN.text.caption} font-medium`}>
                    Contract ends in
                  </span>
                  <span
                    className={cn(
                      'text-xl font-bold tabular-nums',
                      urgencyLevel === 'critical' && 'text-red-600',
                      urgencyLevel === 'warning' && 'text-amber-600',
                      urgencyLevel === 'normal' && 'text-slate-700'
                    )}
                  >
                    {assignment.days_to_end} days
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`p-2.5 ${DESIGN.radius.md} hover:bg-slate-200/60 ${DESIGN.transition} hover:scale-110 hover:rotate-90`}
              aria-label="Close"
            >
              <X size={18} className="text-slate-400" strokeWidth={2} />
            </button>
          </header>

          {/* Content */}
          <main className="flex-1 p-6 space-y-5 overflow-y-auto">
            {/* Current Contract */}
            <section>
              <h3 className={`${DESIGN.text.label} mb-3`}>Current Contract</h3>
              <div className="grid grid-cols-2 gap-3">
                <InfoCard
                  icon={Building2}
                  label="Facility"
                  value={assignment.facility_name || '—'}
                />
                <InfoCard
                  icon={MapPin}
                  label="Specialty"
                  value={assignment.specialty || '—'}
                />
                <InfoCard
                  icon={Calendar}
                  label="Start"
                  value={formatDate(assignment.start_date)}
                />
                <InfoCard
                  icon={Calendar}
                  label="End"
                  value={formatDate(assignment.end_date)}
                />
                {assignment.bill_rate && (
                  <InfoCard
                    icon={DollarSign}
                    label="Bill Rate"
                    value={`${formatCurrency(assignment.bill_rate)}/hr`}
                  />
                )}
                {assignment.actual_margin !== null && (
                  <InfoCard
                    icon={DollarSign}
                    label="Margin"
                    value={`${assignment.actual_margin}%`}
                  />
                )}
              </div>
            </section>

            {/* Account Team */}
            {(assignment.am_name || assignment.ac_name) && (
              <section>
                <h3 className={`${DESIGN.text.label} mb-3`}>Account Team</h3>
                <div className="grid grid-cols-2 gap-3">
                  {assignment.am_name && (
                    <InfoCard
                      icon={User}
                      label="Account Manager"
                      value={assignment.am_name}
                    />
                  )}
                  {assignment.ac_name && (
                    <InfoCard
                      icon={User}
                      label="Account Coordinator"
                      value={assignment.ac_name}
                    />
                  )}
                </div>
              </section>
            )}

            {/* Extension Progress */}
            {!isRetention && !isExiting && (
              <section>
                <h3 className={`${DESIGN.text.label} mb-3`}>Extension Progress</h3>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
                  {EXTENSION_STAGES.map((stage, index) => {
                    const isActive = assignment.extension_stage === stage.value;
                    const isPast =
                      EXTENSION_STAGES.findIndex(
                        (s) => s.value === assignment.extension_stage
                      ) > index;

                    return (
                      <React.Fragment key={stage.value}>
                        <button
                          onClick={() => handleStageChange(stage.value)}
                          disabled={!onUpdateStage}
                          className={cn(
                            `flex-1 min-w-[90px] px-3 py-2.5 text-[11px] font-semibold ${DESIGN.radius.sm} border ${DESIGN.transition}`,
                            isActive && stage.color,
                            isPast && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            !isActive && !isPast && `bg-${DESIGN.colors.bgCard} text-slate-400 border-${DESIGN.colors.border}`,
                            onUpdateStage && `cursor-pointer hover:shadow-md hover:-translate-y-0.5`,
                            !onUpdateStage && 'cursor-default'
                          )}
                          aria-label={stage.label}
                        >
                          {isPast && <CheckCircle size={12} className="inline mr-1" strokeWidth={2.5} />}
                          {stage.label}
                        </button>
                        {index < EXTENSION_STAGES.length - 1 && (
                          <div className={`w-3 h-0.5 bg-${DESIGN.colors.border} shrink-0`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Notes */}
            {assignment.notes && (
              <section>
                <h3 className={`${DESIGN.text.label} mb-2`}>Notes</h3>
                <div className={`p-4 bg-${DESIGN.colors.bgCard} ${DESIGN.radius.md} border border-${DESIGN.colors.border}/80 ${DESIGN.elevation.card}`}>
                  <p className={`${DESIGN.text.value} leading-relaxed whitespace-pre-wrap`}>
                    {assignment.notes}
                  </p>
                </div>
              </section>
            )}

            {/* Assignment Mode */}
            <section className={`p-5 bg-${DESIGN.colors.bgCard} ${DESIGN.radius.md} border border-${DESIGN.colors.border} ${DESIGN.elevation.card}`}>
              <h3 className={`${DESIGN.text.label} text-slate-900 mb-4`}>Assignment Mode</h3>
              <div className="space-y-3">
                <button
                  onClick={handleToggleMode}
                  disabled={isChangingMode || isExiting}
                  className={cn(
                    `w-full p-4 ${DESIGN.radius.md} border-2 ${DESIGN.transition} text-left`,
                    isRetention
                      ? `border-blue-500 bg-blue-50 ${DESIGN.elevation.card}`
                      : `border-${DESIGN.colors.border} bg-${DESIGN.colors.bgCard} hover:border-${DESIGN.colors.borderHover} hover:shadow-sm`,
                    !isExiting && 'hover:-translate-y-0.5'
                  )}
                  aria-label="Switch to Retention mode"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        `w-5 h-5 ${DESIGN.radius.full} border-2 flex items-center justify-center shrink-0 ${DESIGN.transition}`,
                        isRetention
                          ? 'border-blue-500 bg-blue-500 scale-110'
                          : `border-slate-300 bg-${DESIGN.colors.bgCard}`
                      )}
                    >
                      {isRetention && <CheckCircle size={12} className="text-white" strokeWidth={2.5} />}
                    </div>
                    <div className="flex-1">
                      <p className={`${DESIGN.text.value} mb-0.5`}>
                        Retention - Looking for Next
                      </p>
                      <p className={`${DESIGN.text.caption}`}>
                        Will appear in Submittals to find new placement
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={handleToggleMode}
                  disabled={isChangingMode || isExiting}
                  className={cn(
                    `w-full p-4 ${DESIGN.radius.md} border-2 ${DESIGN.transition} text-left`,
                    !isRetention
                      ? `border-slate-500 bg-${DESIGN.colors.bgSubtle} ${DESIGN.elevation.card}`
                      : `border-${DESIGN.colors.border} bg-${DESIGN.colors.bgCard} hover:border-${DESIGN.colors.borderHover} hover:shadow-sm`,
                    !isExiting && 'hover:-translate-y-0.5'
                  )}
                  aria-label="Switch to Extension mode"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        `w-5 h-5 ${DESIGN.radius.full} border-2 flex items-center justify-center shrink-0 ${DESIGN.transition}`,
                        !isRetention
                          ? 'border-slate-500 bg-slate-500 scale-110'
                          : `border-slate-300 bg-${DESIGN.colors.bgCard}`
                      )}
                    >
                      {!isRetention && <CheckCircle size={12} className="text-white" strokeWidth={2.5} />}
                    </div>
                    <div className="flex-1">
                      <p className={`${DESIGN.text.value} mb-0.5`}>
                        Extension - Staying at Current
                      </p>
                      <p className={`${DESIGN.text.caption}`}>
                        Working on extending at {assignment.facility_name || 'current facility'}
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </section>
          </main>

          {/* Footer */}
          <footer className={cn(
            `px-8 py-5 border-t border-${DESIGN.colors.border}`,
            `sticky bottom-0 bg-gradient-to-t from-white to-${DESIGN.colors.bgSubtle} backdrop-blur-lg rounded-b-2xl z-10`
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {assignment.candidate_email && (
                  <button
                    onClick={() => onEmail(assignment)}
                    className={cn(
                      `px-4 py-2.5 text-[11px] font-semibold text-slate-700 bg-${DESIGN.colors.bgCard} border-2 border-${DESIGN.colors.border} ${DESIGN.radius.md}`,
                      `hover:bg-${DESIGN.colors.bgSubtle} hover:border-${DESIGN.colors.borderHover} ${DESIGN.transition} flex items-center gap-2`,
                      'hover:shadow-sm hover:-translate-y-0.5'
                    )}
                    aria-label="Email"
                  >
                    <Mail size={14} strokeWidth={2} />
                    Email
                  </button>
                )}

                {assignment.candidate_phone && (
                  <a
                    href={`tel:${assignment.candidate_phone}`}
                    className={cn(
                      `px-4 py-2.5 text-[11px] font-semibold text-slate-700 bg-${DESIGN.colors.bgCard} border-2 border-${DESIGN.colors.border} ${DESIGN.radius.md}`,
                      `hover:bg-${DESIGN.colors.bgSubtle} hover:border-${DESIGN.colors.borderHover} ${DESIGN.transition} flex items-center gap-2`,
                      'hover:shadow-sm hover:-translate-y-0.5'
                    )}
                    aria-label="Call"
                  >
                    <Phone size={14} strokeWidth={2} />
                    Call
                  </a>
                )}

                {assignment.nova_url && (
                  <a
                    href={assignment.nova_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      `px-4 py-2.5 text-[11px] font-semibold text-slate-700 bg-${DESIGN.colors.bgCard} border-2 border-${DESIGN.colors.border} ${DESIGN.radius.md}`,
                      `hover:bg-${DESIGN.colors.bgSubtle} hover:border-${DESIGN.colors.borderHover} ${DESIGN.transition} flex items-center gap-2`,
                      'hover:shadow-sm hover:-translate-y-0.5'
                    )}
                    aria-label="Nova"
                  >
                    <ExternalLink size={14} strokeWidth={2} />
                    Nova
                  </a>
                )}
              </div>

              <button
                onClick={handleMarkExiting}
                disabled={isExiting}
                className={cn(
                  `px-4 py-2.5 text-[11px] font-semibold ${DESIGN.radius.md} ${DESIGN.transition} flex items-center gap-2`,
                  isExiting
                    ? 'bg-red-100 text-red-600 border-2 border-red-200 cursor-not-allowed'
                    : `bg-${DESIGN.colors.bgCard} text-red-600 border-2 border-red-200 hover:bg-red-50 hover:shadow-sm hover:-translate-y-0.5`
                )}
                aria-label={isExiting ? 'Marked as Exiting' : 'Mark as Exiting'}
              >
                <LogOut size={14} strokeWidth={2} />
                {isExiting ? 'Marked Exiting' : 'Mark Exiting'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
};