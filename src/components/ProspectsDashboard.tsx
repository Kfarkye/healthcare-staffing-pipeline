// ============================================================================
// src/components/ProspectsDashboard.tsx
// JONY IVE CLARITY: Purpose-driven design, every element earns its place
// ============================================================================

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { formatPhoneLink, getFirstName, formatNovaLink } from '../lib/utils';
import { Search, X, Phone, Mail, Plus, Loader as Loader2, CreditCard as Edit2, CircleCheck as CheckCircle, ExternalLink, SquareCheck as CheckSquare, MailCheck, CircleAlert as AlertCircle, UserX, TriangleAlert as AlertTriangle, RefreshCw, Columns3, List, GripVertical, MessageSquare } from 'lucide-react';

import EmailTemplateModal from './prospects/EmailTemplateModal';
import EditProspectModal from './prospects/EditProspectModal';
import AddProspectModal from './prospects/AddProspectModal';
import { SMSModal } from './SMSModal';
import { Tooltip } from './shared/Tooltip';
import { trackEvent } from '../utils/telemetry';
import type { ActiveEmailModal } from '../types/email';

// ============================================================================
// DESIGN SYSTEM - Unified with submittals and assignments
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

export type StatusId = 'New' | 'Contacted' | 'Interested' | 'Profile Updates' | 'Not Interested' | 'Submittal Ready';
export type ReadinessFilter = 'all' | 'notReady' | 'almostReady' | 'ready' | 'stalled' | null;
export type ViewMode = 'kanban' | 'ranking' | 'list';
export type ModalType = 'add' | 'edit' | 'email' | 'batch_reference' | 'batch_reassignment' | null;

export interface Prospect {
  id: number;
  candidate_id: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  profession: string | null;
  status: StatusId;
  home_state: string | null;
  licenses: string[] | null;
  notes: string | null;
  rto_notes: string | null;
  recruiter: string | null;
  recruiter_id: string | null;
  source: string | null;
  priority: string | null;
  metadata: Record<string, any> | null;
  nova_url: string | null;
  available_start_date: string | null;
  last_contacted_at: string | null;
  last_response_at: string | null;
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  profile_score?: number;
  references_verified?: number;
  profile_complete?: boolean;
  template_extracted_data?: any;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// PIPELINE DEFINITION - Clear stages with purpose
// ============================================================================

const PIPELINE_COLUMNS = [
  { 
    id: 'New' as const, 
    label: 'New', 
    description: 'Fresh leads',
    color: 'bg-slate-500' 
  },
  { 
    id: 'Contacted' as const, 
    label: 'Contacted', 
    description: 'Outreach sent',
    color: 'bg-blue-500' 
  },
  { 
    id: 'Interested' as const, 
    label: 'Interested', 
    description: 'Engaged',
    color: 'bg-amber-500' 
  },
  { 
    id: 'Profile Updates' as const, 
    label: 'Profile Updates', 
    description: 'Completing requirements',
    color: 'bg-purple-500' 
  },
];

const SPECIALTY_COLORS = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-rose-500',
  'bg-teal-500',
];

const TIFFANY_CC = 'Tiffany.Chavez@ayahealthcare.com';
const REASSIGNMENT_EMAIL = 'reassignments@ayahealthcare.com';

// ============================================================================
// UTILITIES - Each has a single, clear purpose
// ============================================================================

const buildReferenceEmail = (p: Prospect) => {
  const firstName = getFirstName(p.name);
  const novaUrl = p.nova_url || formatNovaLink(p.candidate_id);
  return `Hi ${firstName},\n\nThe facility requires a verified supervisory reference from the past 12 months.\nCould you please ask a supervisor from within the last 12 months to complete the attached reference form and email it to References@ayahealthcare.com?\n\nSupervisory Reference – Can be a Team Lead, Charge Nurse, Nurse Practitioner, Unit Manager, or Director.\n\nPlease ensure the reference matches one of the references listed on your Aya profile with the correct facility and dates.\n\nFor tracking purposes, it would be helpful if they could CC me at Kofi.Farkye@ayahealthcare.com and ${TIFFANY_CC}.\n\nI can begin the submittal process without the reference, but we'll need it completed as soon as possible.\n\n${novaUrl ? `Nova link: ${novaUrl}\n` : ''}Email: ${p.email ?? ''}\n\nThank you!\nKofi Farkye\nSenior Recruiter, Fulfillment Specialist\nP: 858-529-7267 Ext: 17017`;
};

const buildReassignmentEmail = (p: Prospect) => {
  return `Hi Team,\n\nCan we please reassign ${p.name}?\n\nEmail: ${p.email || 'Not Available'}\nNova Profile: ${p.nova_url || formatNovaLink(p.candidate_id)}\n\nThank you!`;
};

const calculateProfileScore = (p: any): number => {
  const requirements = [
    (p.metadata?.references_verified || 0) >= 2,
    p.metadata?.profile_complete === true,
    !!(p.licenses && p.licenses.length > 0),
    !!p.available_start_date,
    !!p.rto_notes,
  ];
  const completed = requirements.filter(Boolean).length;
  return Math.round((completed / 5) * 100);
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
};

const isStalled = (prospect: Prospect): boolean => {
  if (!prospect.updated_at) return false;
  
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(prospect.updated_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return daysSinceUpdate >= 3;
};

// ============================================================================
// STAT WIDGET - Clear metrics with purpose
// ============================================================================

const StatWidget: React.FC<{
  label: string;
  value: number;
  onClick: () => void;
  isActive: boolean;
}> = ({ label, value, onClick, isActive }) => (
  <button
    onClick={onClick}
    className={cn(
      `group relative flex flex-col items-start p-4 ${DESIGN.radius.md} border ${DESIGN.transition}`,
      isActive
        ? `bg-${DESIGN.colors.primary} border-${DESIGN.colors.primary} ${DESIGN.elevation.card}`
        : `bg-${DESIGN.colors.bgCard} border-${DESIGN.colors.border}/80 hover:border-${DESIGN.colors.borderHover} hover:bg-${DESIGN.colors.bgSubtle}/50`
    )}
    aria-label={`Filter by ${label}`}
    aria-pressed={isActive}
  >
    <div className={cn(DESIGN.text.label, isActive ? 'text-slate-400' : '')}>
      {label}
    </div>
    <div className={cn(DESIGN.text.stat, isActive ? 'text-white' : 'text-slate-900')}>
      {value}
    </div>
  </button>
);

// ============================================================================
// VIEW SWITCHER - Clear navigation between perspectives
// ============================================================================

const ViewSwitcher: React.FC<{
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}> = ({ viewMode, setViewMode }) => (
  <div className={`flex items-center p-1 ${DESIGN.radius.md} bg-slate-100`}>
    {([
      { mode: 'kanban', icon: Columns3, label: 'Pipeline' },
      { mode: 'ranking', icon: GripVertical, label: 'Specialty' },
      { mode: 'list', icon: List, label: 'List' }
    ] as const).map(({ mode, icon: Icon, label }) => (
      <button
        key={mode}
        onClick={() => setViewMode(mode as ViewMode)}
        className={cn(
          `px-4 py-2 text-[11px] font-semibold ${DESIGN.radius.sm} ${DESIGN.transition} flex items-center gap-2`,
          viewMode === mode
            ? `bg-white text-slate-900 ${DESIGN.elevation.card}`
            : 'bg-transparent text-slate-500 hover:text-slate-800'
        )}
        aria-label={`${label} view`}
        aria-pressed={viewMode === mode}
      >
        <Icon size={14} strokeWidth={2.5} />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

// ============================================================================
// STATUS BADGE - Visual status indicator
// ============================================================================

const StatusBadge: React.FC<{ status: StatusId }> = ({ status }) => {
  const styles = {
    'New': 'bg-slate-100 text-slate-700',
    'Contacted': 'bg-blue-100 text-blue-700',
    'Interested': 'bg-amber-100 text-amber-700',
    'Profile Updates': 'bg-purple-100 text-purple-700',
    'Not Interested': 'bg-red-100 text-red-700',
    'Submittal Ready': 'bg-emerald-100 text-emerald-700',
  };

  return (
    <span className={cn(
      `inline-flex items-center px-2.5 py-1 ${DESIGN.radius.sm} text-[11px] font-semibold`,
      styles[status] || 'bg-slate-100 text-slate-700'
    )}>
      {status}
    </span>
  );
};

// ============================================================================
// PROSPECT CARD - Single prospect representation
// ============================================================================

const ProspectCard: React.FC<{
  prospect: Prospect;
  onSelect: () => void;
  onOpenEmail: () => void;
  onOpenSMS: () => void;
  onArchive: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  isDraggable?: boolean;
  index: number;
}> = ({ prospect, onSelect, onOpenEmail, onOpenSMS, onArchive, onDragStart, isDraggable = false, index }) => {
  const stop = (e: React.MouseEvent, fn?: () => void) => {
    e.stopPropagation();
    fn?.();
  };

  return (
    <div
      onClick={onSelect}
      draggable={isDraggable}
      onDragStart={onDragStart}
      className={cn(
        `relative bg-${DESIGN.colors.bgCard} ${DESIGN.radius.sm} border p-4 cursor-pointer ${DESIGN.transition} group`,
        `hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-${DESIGN.colors.borderHover} hover:-translate-y-0.5`,
        `border-${DESIGN.colors.border}`,
        isDraggable && "cursor-move"
      )}
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
      role="button"
      tabIndex={0}
      aria-label={`${prospect.name}, ${prospect.specialty || prospect.profession || 'No specialty'}`}
    >
      {/* Content */}
      <div className="mb-3">
        <h3 className={`${DESIGN.text.value} truncate mb-0.5`}>
          {prospect.name || 'Unnamed'}
        </h3>
        <p className={`${DESIGN.text.caption} truncate`}>
          {prospect.specialty || prospect.profession || '—'}
        </p>
      </div>

      {/* Quick Actions - Only visible on hover */}
      <div className={`flex items-center justify-between opacity-0 group-hover:opacity-100 ${DESIGN.transition}`}>
        <div className="flex items-center gap-1">
          {prospect.email && (
            <Tooltip content="Email">
              <button
                onClick={e => stop(e, onOpenEmail)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Email prospect"
              >
                <Mail size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
          {prospect.phone && (
            <>
              <Tooltip content="Text">
                <button
                  onClick={e => stop(e, onOpenSMS)}
                  className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-blue-600 hover:bg-blue-50 ${DESIGN.transition}`}
                  aria-label="Text prospect"
                >
                  <MessageSquare size={14} strokeWidth={2} />
                </button>
              </Tooltip>
              <Tooltip content="Call">
                <a
                  href={formatPhoneLink(prospect.phone)}
                  onClick={(e) => stop(e)}
                  className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                  aria-label="Call prospect"
                >
                  <Phone size={14} strokeWidth={2} />
                </a>
              </Tooltip>
            </>
          )}
          {(prospect.candidate_id || prospect.nova_url) && (
            <Tooltip content="Nova">
              <a
                href={prospect.nova_url || formatNovaLink(prospect.candidate_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => stop(e)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Open in Nova"
              >
                <ExternalLink size={14} strokeWidth={2} />
              </a>
            </Tooltip>
          )}
        </div>

        <Tooltip content="Archive">
          <button
            onClick={e => stop(e, onArchive)}
            className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-red-600 hover:bg-red-50 ${DESIGN.transition}`}
            aria-label="Archive prospect"
          >
            <UserX size={14} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

// ============================================================================
// KANBAN COLUMN - Stage or category container
// ============================================================================

const KanbanColumn: React.FC<{
  title: string;
  description?: string;
  count: number;
  rows: Prospect[];
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragStart?: (e: React.DragEvent, row: Prospect) => void;
  onSelectRow: (row: Prospect) => void;
  onOpenEmail: (row: Prospect) => void;
  onOpenSMS: (row: Prospect) => void;
  onArchive: (row: Prospect) => void;
  dropTarget?: boolean;
  color?: string;
}> = ({
  title,
  description,
  count,
  rows,
  dropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onSelectRow,
  onOpenEmail,
  onOpenSMS,
  onArchive,
  color,
}) => {
  return (
    <div className="flex flex-col h-full">
      {/* Column Header */}
      <div className="mb-4 bg-gradient-to-b from-slate-50 to-transparent pb-3 sticky top-0 z-10">
        <div className="flex items-baseline gap-2 mb-1">
          {color && <div className={cn(`w-2 h-2 ${DESIGN.radius.full} shrink-0`, color)} />}
          <h3 className={`text-[12px] font-semibold tracking-tight text-slate-900`}>{title}</h3>
          <span className={`${DESIGN.text.caption} font-semibold tabular-nums`}>{count}</span>
        </div>
        {description && <p className={`text-[10px] text-slate-500`}>{description}</p>}
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          `flex-1 space-y-3 p-2 ${DESIGN.radius.md} bg-slate-50/60 border-2 overflow-y-auto ${DESIGN.transition}`,
          dropTarget ? "border-blue-400 bg-blue-50/30 ring-2 ring-blue-400/20" : "border-transparent"
        )}
        role="region"
        aria-label={`${title} column`}
      >
        {rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <ProspectCard
                key={row.id}
                prospect={row}
                onSelect={() => onSelectRow(row)}
                onOpenEmail={() => onOpenEmail(row)}
                onOpenSMS={() => onOpenSMS(row)}
                onArchive={() => onArchive(row)}
                onDragStart={onDragStart ? (e) => onDragStart(e, row) : undefined}
                isDraggable={true}
                index={i}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-center p-4">
            <div className={`w-full max-w-[140px] border-2 border-dashed border-${DESIGN.colors.border} ${DESIGN.radius.sm} p-4`}>
              <p className={`${DESIGN.text.body} font-medium text-slate-400`}>Empty</p>
              <p className={`text-[10px] text-slate-400 mt-1`}>Drag here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// TOAST - Temporary feedback
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

  const Icon = type === 'success' ? CheckCircle : type === 'error' ? AlertCircle : AlertCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        `fixed bottom-6 right-6 z-50 flex items-center gap-3 ${DESIGN.radius.md} px-5 py-3.5 text-[13px] font-medium shadow-2xl backdrop-blur-sm animate-slideUp`,
        styles[type]
      )}
    >
      <Icon size={18} strokeWidth={2.5} />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className={`ml-4 -mr-2 p-1 ${DESIGN.radius.full} hover:bg-white/10 ${DESIGN.transition} active:scale-95`}
        aria-label="Dismiss notification"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
};

// ============================================================================
// BATCH MODALS - Group actions (kept for future use)
// ============================================================================

const BatchReferenceModal: React.FC<{
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
  onComplete: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ open, onClose, prospects, onComplete, toast }) => {
  const [sending, setSending] = useState(false);
  const valid = useMemo(() => prospects.filter(p => p.email), [prospects]);
  const skipped = prospects.length - valid.length;

  const send = async () => {
    if (!valid.length) return toast('No prospects with valid emails selected', 'error');
    setSending(true);

    try {
      const isDev = import.meta.env.DEV;
      const successIds: number[] = [];

      for (const p of valid) {
        try {
          if (isDev) {
            const subject = encodeURIComponent('Reference Request for Aya Submission');
            const body = encodeURIComponent(buildReferenceEmail(p));
            window.open(`mailto:${p.email}?cc=${TIFFANY_CC}&subject=${subject}&body=${body}`, '_blank');
          } else {
            const { error } = await supabase.functions.invoke('send_email', {
              body: { to: p.email, cc: TIFFANY_CC, subject: 'Reference Request for Aya Submission', body: buildReferenceEmail(p) }
            });
            if (error) throw error;
          }
          successIds.push(p.id);
        } catch (err) {
          console.error(`Failed to send reference request to ${p.name}:`, err);
          toast(`Failed to send to ${p.name}`, 'error');
        }
      }

      if (successIds.length > 0) {
        const { error } = await supabase.from('prospects').update({ status: 'Contacted' }).in('id', successIds);
        if (error) throw error;
        toast(`Sent ${successIds.length} reference request${successIds.length !== 1 ? 's' : ''}`, 'success');
      }

      onComplete();
      if (skipped > 0) toast(`Skipped ${skipped} without email`, 'info');
      onClose();
    } catch (error) {
      console.error('Batch reference send error:', error);
      toast('Batch send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-2xl bg-white ${DESIGN.radius.md} ${DESIGN.elevation.modal} border-${DESIGN.colors.border} animate-scaleIn`}>
        <div className={`p-5 border-b border-${DESIGN.colors.border} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <MailCheck className="w-5 h-5 text-blue-600" strokeWidth={2.5} />
            <h2 className={DESIGN.text.heading}>Send Reference Request</h2>
          </div>
          <button onClick={onClose} className={`p-1.5 ${DESIGN.radius.sm} hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`} aria-label="Close">
            <X size={16} className="text-slate-400" strokeWidth={2} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className={`flex items-center gap-3 bg-${DESIGN.colors.bgSubtle} border border-${DESIGN.colors.border} ${DESIGN.radius.sm} p-3`}>
            <span className={`${DESIGN.text.body} font-medium`}>Ready to send to {valid.length} prospect{valid.length !== 1 ? 's' : ''}</span>
            {skipped > 0 && (
              <div className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 ${DESIGN.radius.full} bg-amber-50 text-amber-700 font-semibold`}>
                <AlertCircle size={12} strokeWidth={2.5} />{skipped} without email
              </div>
            )}
          </div>
        </div>

        <div className={`p-5 bg-${DESIGN.colors.bgSubtle} border-t border-${DESIGN.colors.border} flex justify-end gap-3`}>
          <button onClick={onClose} className={`px-4 py-2 text-[13px] font-semibold ${DESIGN.radius.sm} border border-${DESIGN.colors.border} text-slate-700 bg-white hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}>
            Cancel
          </button>
          <button onClick={send} disabled={sending || !valid.length} className={cn(`px-4 py-2 text-[13px] font-semibold ${DESIGN.radius.sm} text-white flex items-center gap-2 ${DESIGN.transition} ${DESIGN.elevation.card}`, sending || !valid.length ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-95')}>
            {sending ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</>) : (<><MailCheck className="w-3.5 h-3.5" strokeWidth={2.5} />Send ({valid.length})</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

const BatchReassignModal: React.FC<{
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
  onComplete: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ open, onClose, prospects, onComplete, toast }) => {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);

    try {
      const successIds: number[] = [];

      for (const p of prospects) {
        try {
          const subject = `Reassignment Request – ${p.name}`;
          const body = buildReassignmentEmail(p);

          if (import.meta.env.DEV) {
            window.open(`mailto:${REASSIGNMENT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
          } else {
            const { error } = await supabase.functions.invoke('send_email', { body: { to: REASSIGNMENT_EMAIL, subject, body } });
            if (error) throw error;
          }
          successIds.push(p.id);
        } catch (err) {
          console.error(`Reassignment failed for ${p.name}:`, err);
          toast(`Failed to reassign ${p.name}`, 'error');
        }
      }

      if (successIds.length > 0) {
        toast(`Sent ${successIds.length} reassignment request${successIds.length !== 1 ? 's' : ''}`, 'success');
      }

      onComplete();
      onClose();
    } catch (error) {
      console.error('Batch reassignment error:', error);
      toast('Batch reassignment failed', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-2xl bg-white ${DESIGN.radius.md} ${DESIGN.elevation.modal} border-${DESIGN.colors.border} animate-scaleIn`}>
        <div className={`p-5 border-b border-${DESIGN.colors.border} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <UserX className="w-5 h-5 text-orange-600" strokeWidth={2.5} />
            <h2 className={DESIGN.text.heading}>Request Reassignment</h2>
          </div>
          <button onClick={onClose} className={`p-1.5 ${DESIGN.radius.sm} hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`} aria-label="Close">
            <X size={16} className="text-slate-400" strokeWidth={2} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className={DESIGN.text.body}>This will open an email draft to <span className="font-semibold text-slate-900">{REASSIGNMENT_EMAIL}</span> for {prospects.length} prospect{prospects.length !== 1 ? 's' : ''}</p>
        </div>

        <div className={`p-5 bg-${DESIGN.colors.bgSubtle} border-t border-${DESIGN.colors.border} flex justify-end gap-3`}>
          <button onClick={onClose} className={`px-4 py-2 text-[13px] font-semibold ${DESIGN.radius.sm} border border-${DESIGN.colors.border} text-slate-700 bg-white hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}>
            Cancel
          </button>
          <button onClick={send} disabled={sending} className={cn(`px-4 py-2 text-[13px] font-semibold ${DESIGN.radius.sm} text-white flex items-center gap-2 ${DESIGN.transition} ${DESIGN.elevation.card}`, sending ? 'bg-slate-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 active:scale-95')}>
            {sending ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</>) : (<><UserX className="w-3.5 h-3.5" strokeWidth={2.5} />Request ({prospects.length})</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

export default function ProspectsDashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>(null);
  const [dragOver, setDragOver] = useState<StatusId | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveEmailModal>(null);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [selectedForSMS, setSelectedForSMS] = useState<Prospect | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const newToast = { id: Date.now(), message: msg, type };
    setToast(newToast);
    setTimeout(() => {
      setToast(current => (current?.id === newToast.id ? null : current));
    }, 4000);
  }, []);

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allProspects = (data || []).map(p => ({
        ...p,
        status: p.status || 'New',
        profile_score: calculateProfileScore(p),
        references_verified: p.metadata?.references_verified || 0,
        profile_complete: p.metadata?.profile_complete || false,
      }));

      const visible = allProspects.filter(p => 
        p.status !== 'Not Interested' && p.status !== 'Submittal Ready'
      );

      setProspects(visible);
    } catch (error) {
      console.error('[Load]', error);
      showToast('Failed to load prospects', 'error');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(true); }, [load]);

  const handleAddProspect = async (prospectData: any) => {
    try {
      const payload: any = {
        candidate_id: prospectData.candidate_id,
        nova_url: prospectData.nova_url,
        name: prospectData.full_name || prospectData.name,
        email: prospectData.email,
        profession: prospectData.profession,
        status: prospectData.status || 'New',
        priority: prospectData.priority || 'Medium',
        metadata: prospectData.metadata || {},
      };

      if (prospectData.phone) payload.phone = prospectData.phone;
      if (prospectData.specialty) payload.specialty = prospectData.specialty;
      if (prospectData.home_state) payload.home_state = prospectData.home_state;
      if (prospectData.notes) payload.notes = prospectData.notes;

      const { data, error } = await supabase
        .from('prospects')
        .insert([payload])
        .select('*');

      if (error) throw error;

      await load();
      showToast('Prospect added', 'success');
      return data;

    } catch (error: any) {
      console.error('[AddProspect]', error);
      showToast(error?.message || 'Failed to add prospect', 'error');
      throw error;
    }
  };

  const byStatus = useMemo(() => {
    const map: Record<StatusId, Prospect[]> = {
      'New': [],
      'Contacted': [],
      'Interested': [],
      'Profile Updates': [],
      'Not Interested': [],
      'Submittal Ready': [],
    };
    
    const filtered = prospects.filter(p =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.specialty?.toLowerCase().includes(search.toLowerCase())
    );

    filtered.forEach(p => {
      if (map[p.status]) {
        map[p.status].push(p);
      }
    });

    return map;
  }, [prospects, search]);

  const filteredRows = useMemo(() => {
    if (!readinessFilter) return prospects;

    return prospects.filter(p => {
      const score = p.profile_score || 0;

      if (readinessFilter === 'notReady') return score < 80;
      if (readinessFilter === 'almostReady') return score >= 80 && score < 100;
      if (readinessFilter === 'ready') return score === 100;
      if (readinessFilter === 'stalled') return isStalled(p);

      return true;
    });
  }, [readinessFilter, prospects]);

  const stats = useMemo(() => {
    const readinessBuckets = prospects.reduce((acc, p) => {
      const score = p.profile_score || 0;
      if (score === 100) acc.ready++;
      else if (score >= 80) acc.almostReady++;
      else acc.notReady++;
      
      if (isStalled(p)) acc.stalled++;
      
      return acc;
    }, {
      ready: 0,
      almostReady: 0,
      notReady: 0,
      stalled: 0
    });

    return {
      all: prospects.length,
      notReady: readinessBuckets.notReady,
      almostReady: readinessBuckets.almostReady,
      ready: readinessBuckets.ready,
      stalled: readinessBuckets.stalled,
    };
  }, [prospects]);

  const handleArchive = async (p: Prospect) => {
    try {
      const { error } = await supabase.from('prospects').update({ status: 'Not Interested' }).eq('id', p.id);
      if (error) throw error;
      await load();
      showToast(`${p.name} archived`, 'success');
    } catch (error) {
      console.error('[Archive]', error);
      showToast('Failed to archive', 'error');
    }
  };

  const handleDrop = async (e: React.DragEvent, colId: StatusId) => {
    e.preventDefault();
    setDragOver(null);

    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    const prospect = prospects.find(x => x.id === data.id);
    if (!prospect || prospect.status === colId) return;

    try {
      const { error } = await supabase.from('prospects').update({ status: colId }).eq('id', prospect.id);
      if (error) throw error;
      
      await load();
      showToast(`Moved to ${colId}`, 'success');
    } catch (error) {
      console.error('[Drop]', error);
      showToast('Failed to move', 'error');
    }
  };

  const handleDragStart = (e: React.DragEvent, p: Prospect) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: p.id, currentStatus: p.status }));
  };

  const handleOpenEmail = useCallback((p: Prospect) => {
    setModal('email');
    setSelected(p);
    setActiveModal('prospect');
    trackEvent('email_modal_opened', {
      kind: 'prospect',
      route: 'prospects_dashboard',
      candidate_id: p.candidate_id,
    });
  }, []);

  const handleOpenSMS = useCallback((p: Prospect) => {
    if (!p.phone) {
      showToast('No phone number', 'error');
      return;
    }
    setSelectedForSMS(p);
    setSmsModalOpen(true);
    trackEvent('sms_modal_opened', {
      kind: 'prospect',
      route: 'prospects_dashboard',
      candidate_id: p.candidate_id,
    });
  }, [showToast]);

  const handleSMSSent = useCallback(async (message: string) => {
    if (!selectedForSMS) return;

    try {
      const { error } = await supabase
        .from('prospects')
        .update({ 
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedForSMS.id);

      if (error) throw error;

      showToast('Opening RingCentral', 'success');
      await load();
      
      trackEvent('sms_sent', {
        kind: 'prospect',
        candidate_id: selectedForSMS.candidate_id,
      });
    } catch (error) {
      console.error('[SMS]', error);
      showToast('SMS opened, record update failed', 'error');
    }
  }, [selectedForSMS, showToast, load]);

  const renderContent = () => {
    if (loading && prospects.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      );
    }

    if (viewMode === 'kanban') {
      return (
        <div className="grid grid-cols-4 gap-4 h-[calc(100vh-280px)]">
          {PIPELINE_COLUMNS.map((column) => (
            <div key={column.id} className="h-full overflow-hidden">
              <KanbanColumn
                title={column.label}
                description={column.description}
                count={byStatus[column.id].length}
                rows={byStatus[column.id]}
                onSelectRow={(p) => { setModal('edit'); setSelected(p); }}
                onOpenEmail={handleOpenEmail}
                onOpenSMS={handleOpenSMS}
                onArchive={handleArchive}
                onDragOver={e => { e.preventDefault(); setDragOver(column.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, column.id)}
                onDragStart={handleDragStart}
                dropTarget={dragOver === column.id}
                color={column.color}
              />
            </div>
          ))}
        </div>
      );
    }

    if (viewMode === 'ranking') {
      const specialtyMap = new Map<string, Prospect[]>();

      filteredRows.forEach(p => {
        const spec = p.specialty || 'Uncategorized';
        if (!specialtyMap.has(spec)) {
          specialtyMap.set(spec, []);
        }
        specialtyMap.get(spec)!.push(p);
      });

      const sortedSpecialties = Array.from(specialtyMap.keys()).sort(
        (a, b) => specialtyMap.get(b)!.length - specialtyMap.get(a)!.length
      );

      const handleSpecialtyDrop = async (e: React.DragEvent, newSpecialty: string) => {
        e.preventDefault();

        const prospectId = Number(e.dataTransfer.getData('text/plain'));
        const draggedProspect = prospects.find(p => p.id === prospectId);

        if (!draggedProspect || draggedProspect.specialty === newSpecialty) return;

        try {
          const { error } = await supabase
            .from('prospects')
            .update({
              specialty: newSpecialty,
              updated_at: new Date().toISOString()
            })
            .eq('id', draggedProspect.id);

          if (error) throw error;

          await load();
          showToast(`Moved to ${newSpecialty}`, 'success');
        } catch (err) {
          console.error('[SpecialtyDrop]', err);
          showToast('Failed to update specialty', 'error');
        }
      };

      return (
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-280px)]">
          {sortedSpecialties.map((specialty, idx) => (
            <div key={specialty} className="flex-1 min-w-[280px] max-w-[400px] h-full">
              <KanbanColumn
                title={specialty}
                description={`${specialtyMap.get(specialty)!.length} prospect${specialtyMap.get(specialty)!.length !== 1 ? 's' : ''}`}
                count={specialtyMap.get(specialty)!.length}
                rows={specialtyMap.get(specialty)!}
                onSelectRow={(p) => { setModal('edit'); setSelected(p); }}
                onOpenEmail={handleOpenEmail}
                onOpenSMS={handleOpenSMS}
                onArchive={handleArchive}
                onDragOver={e => { e.preventDefault(); }}
                onDragLeave={() => {}}
                onDrop={(e) => handleSpecialtyDrop(e, specialty)}
                onDragStart={(e, p) => {
                  e.dataTransfer.setData('text/plain', p.id.toString());
                }}
                dropTarget={false}
                color={SPECIALTY_COLORS[idx % SPECIALTY_COLORS.length]}
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className={`bg-white ${DESIGN.radius.md} border border-${DESIGN.colors.border}/80 overflow-hidden animate-fadeInUp`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={`bg-${DESIGN.colors.bgSubtle} border-b border-${DESIGN.colors.border}/80`}>
              <tr>
                {['Name', 'Specialty', 'Status', 'Readiness', 'Actions'].map((h) => (
                  <th key={h} className={`text-left px-4 py-2.5 ${DESIGN.text.label}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-${DESIGN.colors.border}`}>
              {filteredRows.map((row) => (
                <tr key={row.id} className={`hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}>
                  <td className={`px-4 py-3 ${DESIGN.text.value}`}>{row.name}</td>
                  <td className={`px-4 py-3 ${DESIGN.text.body}`}>{row.specialty || row.profession || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`text-[11px] font-semibold text-slate-700 tabular-nums`}>
                        {row.profile_score}%
                      </div>
                      {row.profile_score === 100 && (
                        <CheckCircle size={14} className="text-emerald-500" strokeWidth={2.5} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-start gap-1">
                      {row.email && (
                        <Tooltip content="Email" delay={300}>
                          <button
                            onClick={() => handleOpenEmail(row)}
                            className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-slate-200 hover:text-slate-600 ${DESIGN.transition}`}
                            aria-label="Email prospect"
                          >
                            <Mail size={16} strokeWidth={2} />
                          </button>
                        </Tooltip>
                      )}
                      {row.phone && (
                        <>
                          <Tooltip content="Text" delay={300}>
                            <button
                              onClick={() => handleOpenSMS(row)}
                              className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-blue-100 hover:text-blue-600 ${DESIGN.transition}`}
                              aria-label="Text prospect"
                            >
                              <MessageSquare size={16} strokeWidth={2} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Call" delay={300}>
                            <a
                              href={formatPhoneLink(row.phone)}
                              onClick={(e) => e.stopPropagation()}
                              className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-slate-200 hover:text-slate-600 ${DESIGN.transition}`}
                              aria-label="Call prospect"
                            >
                              <Phone size={16} strokeWidth={2} />
                            </a>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip content="Edit" delay={300}>
                        <button
                          onClick={() => { setModal('edit'); setSelected(row); }}
                          className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-slate-200 hover:text-slate-600 ${DESIGN.transition}`}
                          aria-label="Edit prospect"
                        >
                          <Edit2 size={16} strokeWidth={2} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Archive" delay={300}>
                        <button
                          onClick={() => handleArchive(row)}
                          className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-red-100 hover:text-red-600 ${DESIGN.transition}`}
                          aria-label="Archive prospect"
                        >
                          <UserX size={16} strokeWidth={2} />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Header - Stats and controls */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20">
        <div className="px-8 py-5">
          {/* Stats Grid */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <StatWidget label="All" value={stats.all} onClick={() => setReadinessFilter(null)} isActive={readinessFilter === null} />
            <StatWidget label="Not Ready" value={stats.notReady} onClick={() => setReadinessFilter('notReady')} isActive={readinessFilter === 'notReady'} />
            <StatWidget label="Almost" value={stats.almostReady} onClick={() => setReadinessFilter('almostReady')} isActive={readinessFilter === 'almostReady'} />
            <StatWidget label="Ready" value={stats.ready} onClick={() => setReadinessFilter('ready')} isActive={readinessFilter === 'ready'} />
            <StatWidget label="Stalled 3+" value={stats.stalled} onClick={() => setReadinessFilter('stalled')} isActive={readinessFilter === 'stalled'} />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
            
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search prospects..."
                  className={`w-72 pl-10 pr-4 py-2.5 text-[13px] bg-white border border-${DESIGN.colors.border}/80 ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 ${DESIGN.transition}`}
                  aria-label="Search prospects"
                />
                {search && (
                  <button onClick={() => setSearch('')} className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 ${DESIGN.radius.full} hover:bg-${DESIGN.colors.bgSubtle}`} aria-label="Clear search">
                    <X size={14} className="text-slate-500" strokeWidth={2} />
                  </button>
                )}
              </div>

              {/* Refresh */}
              <button
                onClick={() => load()}
                className={`p-2.5 ${DESIGN.radius.sm} text-slate-500 hover:bg-${DESIGN.colors.bgSubtle} hover:text-slate-800 ${DESIGN.transition}`}
                title="Refresh data"
                aria-label="Refresh"
              >
                <RefreshCw size={18} className={cn(loading && 'animate-spin')} strokeWidth={2} />
              </button>

              {/* Add Prospect */}
              <button
                onClick={() => { setModal('add'); setSelected(null); }}
                className={`px-4 py-2.5 bg-${DESIGN.colors.primary} text-white text-[13px] font-semibold ${DESIGN.radius.sm} hover:bg-${DESIGN.colors.primaryHover} ${DESIGN.transition} flex items-center gap-2 ${DESIGN.elevation.card}`}
              >
                <Plus size={16} strokeWidth={2.5} />
                Add Prospect
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-hidden">
        {renderContent()}
      </main>

      {/* Modals */}
      {modal === 'add' && (
        <AddProspectModal onClose={() => setModal(null)} onSave={handleAddProspect} showToast={showToast} />
      )}
      
      {modal === 'edit' && selected && (
        <EditProspectModal
          prospect={selected}
          onClose={() => setModal(null)}
          onUpdate={() => { 
            load(); 
            setModal(null); 
            showToast('Prospect updated', 'success'); 
          }}
          showToastNotification={showToast}
        />
      )}
      
      {modal === 'email' && selected && (
        <EmailTemplateModal
          isOpen={true}
          prospect={selected}
          extractedData={selected.template_extracted_data || null}
          onClose={() => {
            setModal(null);
            setActiveModal(null);
            trackEvent('email_modal_closed', {
              kind: 'prospect',
              reason: 'button',
            });
          }}
          onSend={async () => {
            if (selected.status === 'New') {
              await supabase.from('prospects').update({ status: 'Contacted' }).eq('id', selected.id);
              await load();
            }
            trackEvent('email_modal_sent', {
              kind: 'prospect',
            });
            setModal(null);
            setActiveModal(null);
            showToast('Email sent', 'success');
          }}
          showToastNotification={showToast}
        />
      )}
      
      {modal === 'batch_reference' && (
        <BatchReferenceModal open={true} onClose={() => setModal(null)} prospects={[]} onComplete={() => { load(); }} toast={showToast} />
      )}
      
      {modal === 'batch_reassignment' && (
        <BatchReassignModal open={true} onClose={() => setModal(null)} prospects={[]} onComplete={() => { load(); }} toast={showToast} />
      )}

      {/* SMS Modal */}
      {smsModalOpen && selectedForSMS && (
        <SMSModal
          isOpen={smsModalOpen}
          onClose={() => {
            setSmsModalOpen(false);
            setSelectedForSMS(null);
          }}
          candidateName={selectedForSMS.name}
          candidatePhone={selectedForSMS.phone || ''}
          onSend={handleSMSSent}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn { animation: fadeIn 0.15s ease-out; }
        .animate-fadeInUp { animation: fadeInUp 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.2s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.15s ease-out; }
        
        ::-webkit-scrollbar { 
          width: 0; 
          height: 0; 
        }
        
        * { 
          scrollbar-width: none; 
          -ms-overflow-style: none; 
        }
      `}</style>
    </div>
  );
}