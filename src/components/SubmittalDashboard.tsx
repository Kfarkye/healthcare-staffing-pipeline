// ============================================================================
// src/components/SubmittalsDashboard.tsx
// JONY IVE CLARITY: Every element earns its place
// Design system synchronized with ProspectsDashboard
// ============================================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import {
  Search, X, Phone, Mail, CheckCircle, ExternalLink, 
  RefreshCw, List, AlertCircle, Star, TrendingUp, Columns3, GripVertical
} from 'lucide-react';
import { EmailTemplateModal } from './prospects/EmailTemplateModal';
import { AssignmentEmailModal } from './AssignmentEmailModal';
import { AssignmentDetailModal } from './AssignmentDetailModal';
import EditProspectModal from './prospects/EditProspectModal';
import { SourceBadge } from './shared/Badges';
import { Tooltip } from './shared/Tooltip';
import { supabase } from '../lib/supabase';
import { useClinicianDashboard } from '../hooks/useClinicianDashboard';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSortedCandidates, getUrgencyLevel, getUrgencyIndicator } from '../hooks/useSortedCandidates';
import { toProspectLike, toContractData } from '../utils/modalTransformers';
import { trackEvent } from '../utils/telemetry';
import type { ClinicianRow, TabId } from '../types/submittals';
import type { ActiveEmailModal, Prospect, Contract } from '../types/email';
import type { ActiveAssignment } from '../lib/supabase/assignments';
import { toProspectLike as legacyToProspect, getCardKey } from '../types/submittals';

// ============================================================================
// DESIGN SYSTEM - Unified with ProspectsDashboard
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

type ViewMode = 'kanban' | 'top15' | 'list';
type TabView = 'all' | 'prospects' | 'retention' | 'extension';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// PIPELINE DEFINITION
// ============================================================================

const PIPELINE_COLUMNS = [
  { 
    id: 'READY' as const, 
    label: 'Ready', 
    description: 'Ready to submit',
    color: 'bg-amber-500'
  },
  { 
    id: 'SUBMITTED' as const, 
    label: 'Submitted', 
    description: 'Submitted to facility',
    color: 'bg-blue-500'
  },
  { 
    id: 'OFFER' as const, 
    label: 'Offer', 
    description: 'Offer received',
    color: 'bg-purple-500'
  },
  { 
    id: 'PRESTART' as const, 
    label: 'Prestart', 
    description: 'Accepted & onboarding',
    color: 'bg-emerald-500'
  },
];

// ============================================================================
// UTILITIES
// ============================================================================

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
};

const rowToAssignment = (row: ClinicianRow): ActiveAssignment => {
  let daysToEnd = 0;
  if (row.current_contract_end_date) {
    const endDate = new Date(row.current_contract_end_date);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    daysToEnd = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return {
    id: row.contract_id || row.candidate_id || 0,
    candidate_id: row.candidate_id || 0,
    candidate_name: row.full_name || 'Unknown',
    candidate_email: row.email || null,
    candidate_phone: row.phone || null,
    facility_name: row.facility_name || null,
    specialty: row.engagement_specialty || row.primary_specialty || null,
    start_date: row.current_contract_start_date || null,
    end_date: row.current_contract_end_date || null,
    days_to_end: daysToEnd,
    extension_stage: row.extension_stage || 'not_started',
    is_looking_for_new_facility: row.source_type === 'Retention' || row.source_type === 'ACTIVE_LOOKING',
    is_exiting: false,
    am_name: row.am_name || null,
    ac_name: row.ac_name || null,
    nova_url: row.nova_url || null,
    email: row.email || null,
    phone: row.phone || null,
    bill_rate: null,
    actual_margin: null,
    notes: null,
  };
};

// ============================================================================
// STAT WIDGET
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
// VIEW SWITCHER
// ============================================================================

const ViewSwitcher: React.FC<{
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}> = ({ viewMode, setViewMode }) => (
  <div className={`flex items-center p-1 ${DESIGN.radius.md} bg-slate-100`}>
    {([
      { mode: 'kanban', icon: Columns3, label: 'Pipeline' },
      { mode: 'top15', icon: Star, label: 'Top 15' },
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
        <Icon size={14} strokeWidth={2.5} className={mode === 'top15' && viewMode === 'top15' ? 'fill-current' : ''} />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

// ============================================================================
// TOP 15 CARD - Featured priority candidate
// ============================================================================

const Top15Card: React.FC<{
  row: ClinicianRow;
  rank: number;
  onSelect: () => void;
  onOpenEmail: () => void;
  onTogglePriority: () => void;
}> = ({ row, rank, onSelect, onOpenEmail, onTogglePriority }) => {
  const urgencyLevel = getUrgencyLevel(row.days_since_submitted);
  const urgency = getUrgencyIndicator(urgencyLevel);
  
  const stop = (e: React.MouseEvent, fn?: () => void) => {
    e.stopPropagation();
    fn?.();
  };
  
  return (
    <div
      onClick={onSelect}
      className={cn(
        `group relative bg-${DESIGN.colors.bgCard} ${DESIGN.radius.lg} border p-8 cursor-pointer ${DESIGN.transition}`,
        `hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-${DESIGN.colors.borderHover} hover:-translate-y-1`,
        `border-${DESIGN.colors.border}/60`
      )}
      role="button"
      tabIndex={0}
      aria-label={`${row.full_name}, rank ${rank}`}
    >
      {/* Rank Badge */}
      <div className={cn(
        `absolute -top-4 -left-4 w-12 h-12 ${DESIGN.radius.full}`,
        `flex items-center justify-center font-bold text-base ${DESIGN.elevation.float}`,
        `bg-gradient-to-br from-white to-slate-50 text-slate-800 border-${DESIGN.colors.border}/80`
      )}>
        {rank}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <h3 className={`${DESIGN.text.heading} text-xl mb-2 truncate`}>
            {row.full_name || 'Unknown'}
          </h3>
          <p className={`${DESIGN.text.body} truncate`}>
            {row.primary_specialty || row.engagement_specialty || '—'}
          </p>
        </div>
        
        {urgency && (
          <div className={cn(
            `flex items-center gap-2 px-3 py-1.5 ${DESIGN.radius.md} text-[11px] font-semibold shrink-0`,
            urgency.bgTint,
            urgency.ringColor,
            'ring-1 shadow-sm'
          )}>
            {urgency.icon}
            <span>{urgency.label}</span>
          </div>
        )}
      </div>

      {/* Stage Badge */}
      <div className="mb-5">
        <span className={cn(
          `inline-flex items-center px-3 py-1.5 ${DESIGN.radius.md} text-[11px] font-semibold`,
          row.tab === 'READY' && 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
          row.tab === 'SUBMITTED' && 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
          row.tab === 'OFFER' && 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
          row.tab === 'PRESTART' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
        )}>
          {row.tab}
        </span>
      </div>

      {/* Actions */}
      <div className={`flex items-center justify-between pt-5 border-t border-${DESIGN.colors.border}`}>
        <div className="flex items-center gap-1">
          {row.email && (
            <Tooltip content="Email">
              <button
                onClick={e => stop(e, onOpenEmail)}
                className={`p-2.5 ${DESIGN.radius.md} text-slate-400 hover:bg-blue-50 hover:text-blue-600 ${DESIGN.transition}`}
                aria-label="Email"
              >
                <Mail size={18} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
          {row.phone && (
            <Tooltip content="Call">
              <a
                href={`tel:${row.phone}`}
                onClick={e => stop(e)}
                className={`p-2.5 ${DESIGN.radius.md} text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${DESIGN.transition}`}
                aria-label="Call"
              >
                <Phone size={18} strokeWidth={2} />
              </a>
            </Tooltip>
          )}
          {row.nova_url && (
            <Tooltip content="Nova">
              <a
                href={row.nova_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => stop(e)}
                className={`p-2.5 ${DESIGN.radius.md} text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${DESIGN.transition}`}
                aria-label="Nova"
              >
                <ExternalLink size={18} strokeWidth={2} />
              </a>
            </Tooltip>
          )}
        </div>
        
        <button
          onClick={e => stop(e, onTogglePriority)}
          className={cn(
            `inline-flex items-center gap-2 px-4 py-2 ${DESIGN.radius.md} text-[11px] font-semibold ${DESIGN.transition}`,
            `text-slate-600 bg-slate-100 hover:bg-slate-200 ${DESIGN.elevation.card}`
          )}
          aria-label="Remove from Top 15"
        >
          <X size={14} strokeWidth={2.5} />
          Remove
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// SUBMITTAL CARD - Individual candidate card
// ============================================================================

const SubmittalCard: React.FC<{
  row: ClinicianRow;
  onSelect: () => void;
  onOpenEmail: () => void;
  onPromoteRow?: () => void;
  onTogglePriority: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  isDraggable?: boolean;
  index: number;
}> = ({ row, onSelect, onOpenEmail, onPromoteRow, onTogglePriority, onDragStart, isDraggable = false, index }) => {
  const stop = (e: React.MouseEvent, fn?: () => void) => {
    e.stopPropagation();
    fn?.();
  };

  const urgencyLevel = getUrgencyLevel(row.days_since_submitted);
  const isCritical = urgencyLevel === 'critical';
  const isPriority = row.is_weekly_priority === true;
  
  const canBePrioritized = (
    ((row.tab === 'READY' || row.tab === 'SUBMITTED') && row.prospect_id) ||
    (row.candidate_id && (
      row.source_type === 'Retention' || 
      row.source_type === 'ACTIVE_LOOKING' ||
      row.source_type === 'Extension' ||
      row.source_type === 'EXTENSION'
    ))
  );
  
  const isProspect = row.prospect_id || row.source_type === 'Prospect' || row.source_type === 'NEW_PROSPECT';
  const showPromote = row.tab === 'READY' && isProspect && onPromoteRow;

  return (
    <div
      onClick={onSelect}
      draggable={isDraggable}
      onDragStart={onDragStart}
      className={cn(
        `relative bg-${DESIGN.colors.bgCard} ${DESIGN.radius.sm} border p-4 cursor-pointer ${DESIGN.transition} group`,
        `hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-${DESIGN.colors.borderHover} hover:-translate-y-0.5`,
        isCritical ? 'border-red-200' : `border-${DESIGN.colors.border}`,
        isDraggable && 'cursor-move'
      )}
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
      role="button"
      tabIndex={0}
      aria-label={`${row.full_name}, ${row.primary_specialty || row.engagement_specialty || 'No specialty'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className={`${DESIGN.text.value} truncate mb-0.5`}>
            {row.full_name || 'Unknown'}
          </h3>
          <p className={`${DESIGN.text.caption} truncate`}>
            {row.primary_specialty || row.engagement_specialty || '—'}
          </p>
        </div>
        
        {isPriority && (
          <Star size={14} className="text-amber-500 fill-amber-500 shrink-0 ml-2" strokeWidth={2.5} />
        )}
      </div>

      {/* Quick Actions - Only visible on hover */}
      <div className={`flex items-center justify-between opacity-0 group-hover:opacity-100 ${DESIGN.transition}`}>
        <div className="flex items-center gap-1">
          {row.email && (
            <Tooltip content="Email">
              <button
                onClick={e => stop(e, onOpenEmail)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Email"
              >
                <Mail size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
          {row.phone && (
            <Tooltip content="Call">
              <a
                href={`tel:${row.phone}`}
                onClick={e => stop(e)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Call"
              >
                <Phone size={14} strokeWidth={2} />
              </a>
            </Tooltip>
          )}
          {row.nova_url && (
            <Tooltip content="Nova">
              <a
                href={row.nova_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => stop(e)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Nova"
              >
                <ExternalLink size={14} strokeWidth={2} />
              </a>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-1">
          {canBePrioritized && !isPriority && (
            <Tooltip content="Add to Top 15">
              <button
                onClick={e => stop(e, onTogglePriority)}
                className={cn(
                  `inline-flex items-center gap-1 px-2 py-1 ${DESIGN.radius.sm} text-[11px] font-semibold ${DESIGN.transition}`,
                  'text-amber-600 bg-amber-50 hover:bg-amber-100'
                )}
                aria-label="Add to Top 15"
              >
                <Star size={12} strokeWidth={2.5} />
                <span>Top 15</span>
              </button>
            </Tooltip>
          )}
          
          {showPromote && (
            <Tooltip content="Promote">
              <button
                onClick={e => stop(e, onPromoteRow)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Promote"
              >
                <TrendingUp size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// KANBAN COLUMN
// ============================================================================

const KanbanColumn: React.FC<{
  title: string;
  description?: string;
  count: number;
  rows: ClinicianRow[];
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragStart?: (e: React.DragEvent, row: ClinicianRow) => void;
  onSelectRow: (row: ClinicianRow) => void;
  onOpenEmail: (row: ClinicianRow) => void;
  onPromoteRow?: (row: ClinicianRow) => void;
  onTogglePriority: (row: ClinicianRow) => void;
  dropTarget?: boolean;
  color?: string;
  allowDragOut?: boolean;
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
  onPromoteRow,
  onTogglePriority,
  color,
  allowDragOut = true,
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
          dropTarget ? 'border-blue-400 bg-blue-50/30 ring-2 ring-blue-400/20' : 'border-transparent'
        )}
        role="region"
        aria-label={`${title} column`}
      >
        {rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <SubmittalCard
                key={getCardKey(row, i)}
                row={row}
                onSelect={() => onSelectRow(row)}
                onOpenEmail={() => onOpenEmail(row)}
                onPromoteRow={onPromoteRow ? () => onPromoteRow(row) : undefined}
                onTogglePriority={() => onTogglePriority(row)}
                onDragStart={onDragStart ? (e) => onDragStart(e, row) : undefined}
                isDraggable={allowDragOut}
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
// TOAST
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
        `fixed bottom-6 right-6 z-50 flex items-center gap-3 ${DESIGN.radius.md} px-5 py-3.5 text-[13px] font-medium shadow-2xl backdrop-blur-sm animate-slideUp`,
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
// MAIN DASHBOARD
// ============================================================================

export default function SubmittalsDashboard() {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedRow, setSelectedRow] = useState<ClinicianRow | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [tabView, setTabView] = useState<TabView>('all');
  const [dragOver, setDragOver] = useState<TabId | null>(null);

  const [activeModal, setActiveModal] = useState<ActiveEmailModal>(null);
  const [prospectData, setProspectData] = useState<Prospect | null>(null);
  const [contractData, setContractData] = useState<Contract | null>(null);

  const deferredQ = useDebouncedValue(search);

  const { rows, loading, error, refresh } = useClinicianDashboard({
    view: 'submittals_dashboard',
    q: deferredQ,
    limit: 500,
  });

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const newToast = { id: Date.now(), message: msg, type };
    setToast(newToast);
    setTimeout(() => {
      setToast(current => (current?.id === newToast.id ? null : current));
    }, 4000);
  }, []);

  const priorityCount = useMemo(() => {
    return rows.filter(r => r.is_weekly_priority === true).length;
  }, [rows]);

  const byTab = useMemo(() => {
    const map: Record<TabId, ClinicianRow[]> = {
      KANBAN: [],
      READY: [], 
      SUBMITTED: [], 
      OFFER: [], 
      PRESTART: []
    };
    rows.forEach((r) => {
      if (r.tab && map[r.tab as TabId]) {
        map[r.tab as TabId].push(r);
      }
    });
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (tabView === 'all') return rows;
    
    if (tabView === 'prospects') {
      return rows.filter(row => 
        row.source_type === 'Prospect' || 
        row.source_type === 'NEW_PROSPECT' || 
        row.source_type === 'PROSPECT'
      );
    }
    
    if (tabView === 'retention') {
      return rows.filter(row => 
        row.source_type === 'Retention' || 
        row.source_type === 'ACTIVE_LOOKING'
      );
    }
    
    if (tabView === 'extension') {
      return rows.filter(row => 
        row.source_type === 'Extension' || 
        row.source_type === 'EXTENSION'
      );
    }
    
    return rows;
  }, [tabView, rows]);

  const stats = useMemo(() => {
    const prospectCount = rows.filter(r => 
      r.source_type === 'Prospect' || 
      r.source_type === 'NEW_PROSPECT' || 
      r.source_type === 'PROSPECT'
    ).length;
    
    const retentionCount = rows.filter(r => 
      r.source_type === 'Retention' || 
      r.source_type === 'ACTIVE_LOOKING'
    ).length;
    
    const extensionCount = rows.filter(r => 
      r.source_type === 'Extension' || 
      r.source_type === 'EXTENSION'
    ).length;

    const top15Count = rows.filter(r => r.is_weekly_priority === true).length;
    
    return {
      all: rows.length,
      prospects: prospectCount,
      retention: retentionCount,
      extension: extensionCount,
      top15: top15Count,
    };
  }, [rows]);

  const sortedRows = useSortedCandidates(filteredRows, {
    tab: viewMode === 'kanban' ? undefined : ('READY' as TabId),
    preference: 'recent',
  });

  const handleTogglePriority = useCallback(async (row: ClinicianRow) => {
    let recordId: number | null = null;
    let tableName: string = '';
    let idColumn: string = '';
    
    if (row.prospect_id) {
      recordId = row.prospect_id;
      tableName = 'prospects';
      idColumn = 'id';
    }
    else if (row.candidate_id && (
      row.source_type === 'Retention' || 
      row.source_type === 'ACTIVE_LOOKING' ||
      row.source_type === 'Extension' ||
      row.source_type === 'EXTENSION'
    )) {
      recordId = row.candidate_id;
      tableName = 'active_assignments';
      idColumn = 'candidate_id';
    }
    
    if (!recordId || !tableName) {
      showToast('Unable to update Top 15', 'error');
      return;
    }

    const newPriorityStatus = !row.is_weekly_priority;

    if (newPriorityStatus && priorityCount >= 15) {
      showToast('Top 15 is full. Remove someone first.', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from(tableName)
        .update({ is_weekly_priority: newPriorityStatus })
        .eq(idColumn, recordId);

      if (error) throw error;

      showToast(
        newPriorityStatus ? 'Added to Top 15' : 'Removed from Top 15',
        'success'
      );

      refresh();
    } catch (err) {
      console.error('[Priority]', err);
      showToast('Failed to update', 'error');
    }
  }, [showToast, refresh, priorityCount]);

  const handleSelectRow = useCallback((row: ClinicianRow) => {
    setSelectedRow(row);
    
    const isRetentionOrExtension = 
      row.source_type === 'Retention' || 
      row.source_type === 'ACTIVE_LOOKING' ||
      row.source_type === 'Extension' ||
      row.source_type === 'EXTENSION';
    
    const isProspect = row.prospect_id || 
      row.source_type === 'Prospect' || 
      row.source_type === 'NEW_PROSPECT' || 
      row.source_type === 'PROSPECT';
    
    if (isRetentionOrExtension) {
      setShowDetailModal(true);
    } else if (isProspect) {
      setEditModalOpen(true);
    }
  }, []);

  const handleOpenEmail = useCallback((row: ClinicianRow) => {
    if (activeModal !== null) return;

    setSelectedRow(row);
    
    setTimeout(() => {
      if (row.source_type === 'Prospect' || row.source_type === 'NEW_PROSPECT' || row.source_type === 'PROSPECT') {
        const prospect = toProspectLike(row);
        setProspectData(prospect);
        setActiveModal('prospect');
        trackEvent('email_modal_opened', { kind: 'prospect', route: 'submittals_dashboard' });
      } else {
        const contract = toContractData(row);
        setContractData(contract);
        setActiveModal('assignment');
        trackEvent('email_modal_opened', { kind: 'assignment', route: 'submittals_dashboard' });
      }
    }, 100);
  }, [activeModal]);

  const handleCloseModal = useCallback(() => {
    setActiveModal(null);
    setTimeout(() => {
      setProspectData(null);
      setContractData(null);
      setSelectedRow(null);
    }, 300);
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setShowDetailModal(false);
    setTimeout(() => {
      setSelectedRow(null);
    }, 300);
  }, []);

  const promoteRow = useCallback(async (row: ClinicianRow) => {
    if (!row.prospect_id) {
      showToast('Only prospects can be promoted', 'info');
      return;
    }

    try {
      const newStatus = row.tab === 'READY' ? 'Submitted' : 
                       row.tab === 'SUBMITTED' ? 'Offer Extended' : 
                       row.tab === 'OFFER' ? 'Signed / Accepted' : null;
      
      if (newStatus) {
        await supabase.from('prospects').update({ status: newStatus }).eq('id', row.prospect_id);
        showToast(`Promoted to ${newStatus}`, 'success');
        refresh();
      }
    } catch (err: unknown) {
      console.error('[Promote]', err);
      showToast('Failed to promote', 'error');
    }
  }, [showToast, refresh]);

  const handleDragStart = useCallback((e: React.DragEvent, row: ClinicianRow) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(row));
    
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDragOver(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetTab: TabId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(targetTab);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetTab: TabId) => {
    e.preventDefault();
    setDragOver(null);

    try {
      const rowData = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      if (rowData.tab === targetTab) return;

      const isProspect = rowData.prospect_id != null;
      const isActiveAssignment = rowData.candidate_id != null && !isProspect;

      if (isProspect) {
        const statusMap: Record<TabId, string> = {
          'KANBAN': '',
          'READY': 'Submittal Ready',
          'SUBMITTED': 'Submitted',
          'OFFER': 'Offer Extended',
          'PRESTART': 'Signed / Accepted'
        };

        const newStatus = statusMap[targetTab];
        if (newStatus) {
          const { error } = await supabase
            .from('prospects')
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', rowData.prospect_id);

          if (error) throw error;
          showToast(`Moved to ${targetTab}`, 'success');
        }
      } else if (isActiveAssignment) {
        const stageMap: Record<TabId, string> = {
          'KANBAN': '',
          'READY': 'outreach',
          'SUBMITTED': 'interested',
          'OFFER': 'extension_approved',
          'PRESTART': 'SIGNED'
        };

        const newStage = stageMap[targetTab];
        if (newStage) {
          const { error } = await supabase
            .from('active_assignments')
            .update({ 
              extension_stage: newStage,
              updated_at: new Date().toISOString()
            })
            .eq('candidate_id', rowData.candidate_id);

          if (error) throw error;
          showToast(`Moved to ${targetTab}`, 'success');
        }
      } else {
        showToast('Unable to move', 'error');
        return;
      }
      
      setTimeout(() => refresh(), 100);
    } catch (error) {
      console.error('[Drop]', error);
      showToast('Failed to move', 'error');
    }
  }, [showToast, refresh]);

  const top15Candidates = useMemo(() => {
    return rows
      .filter(r => r.is_weekly_priority === true)
      .slice(0, 15);
  }, [rows]);

  const renderContent = () => {
    if (loading && rows.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-full items-center justify-center flex-col">
          <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
          <p className="font-semibold text-red-800">Error loading data</p>
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
                count={byTab[column.id].length}
                rows={byTab[column.id]}
                onSelectRow={handleSelectRow}
                onOpenEmail={handleOpenEmail}
                onPromoteRow={promoteRow}
                onTogglePriority={handleTogglePriority}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
                onDragStart={(e, row) => {
                  handleDragStart(e, row);
                  e.currentTarget.addEventListener('dragend', (endEvent) => {
                    handleDragEnd(endEvent as any);
                  }, { once: true });
                }}
                dropTarget={dragOver === column.id}
                color={column.color}
                allowDragOut={true}
              />
            </div>
          ))}
        </div>
      );
    }

    if (viewMode === 'top15') {
      if (top15Candidates.length === 0) {
        return (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className={`w-20 h-20 ${DESIGN.radius.full} bg-slate-100 flex items-center justify-center mx-auto mb-6`}>
                <Star size={32} className="text-slate-300" strokeWidth={2} />
              </div>
              <p className={`${DESIGN.text.heading} text-xl mb-2`}>No Priority Candidates</p>
              <p className={`${DESIGN.text.body} max-w-sm mx-auto`}>
                Select candidates to add them to your weekly focus
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Weekly Top 15</h2>
            <p className={`${DESIGN.text.body} text-base`}>
              Your priority focus — {top15Candidates.length} of 15 candidates
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {top15Candidates.map((row, index) => (
              <Top15Card
                key={getCardKey(row, index)}
                row={row}
                rank={index + 1}
                onSelect={() => handleSelectRow(row)}
                onOpenEmail={() => handleOpenEmail(row)}
                onTogglePriority={() => handleTogglePriority(row)}
              />
            ))}
          </div>
        </div>
      );
    }

    if (viewMode === 'list') {
      return (
        <div className={`bg-${DESIGN.colors.bgCard} ${DESIGN.radius.md} border border-${DESIGN.colors.border}/80 overflow-hidden animate-fadeInUp`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`bg-${DESIGN.colors.bgSubtle} border-b border-${DESIGN.colors.border}/80`}>
                <tr>
                  {['', 'Name', 'Specialty', 'Source', 'Stage', 'Days', 'Actions'].map((h) => (
                    <th key={h} className={`text-left px-4 py-2.5 ${DESIGN.text.label}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y divide-${DESIGN.colors.border}`}>
                {sortedRows.map((row) => (
                  <tr 
                    key={getCardKey(row, row.candidate_id)} 
                    onClick={() => handleSelectRow(row)}
                    className={`hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition} cursor-pointer group`}
                  >
                    <td className="px-4 py-3 w-12">
                      {row.is_weekly_priority && (
                        <Star size={13} className="text-amber-500 fill-amber-500" strokeWidth={2.5} />
                      )}
                    </td>
                    <td className={`px-4 py-3 ${DESIGN.text.value}`}>{row.full_name}</td>
                    <td className={`px-4 py-3 ${DESIGN.text.body}`}>{row.primary_specialty || row.engagement_specialty || '—'}</td>
                    <td className="px-4 py-3">
                      <SourceBadge
                        sourceType={row.source_type}
                        isActiveSubmittal={row.is_active_submittal}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        `inline-flex items-center px-2.5 py-1 ${DESIGN.radius.sm} text-[11px] font-semibold`,
                        row.tab === 'READY' && 'bg-amber-50 text-amber-700',
                        row.tab === 'SUBMITTED' && 'bg-blue-50 text-blue-700',
                        row.tab === 'OFFER' && 'bg-purple-50 text-purple-700',
                        row.tab === 'PRESTART' && 'bg-emerald-50 text-emerald-700'
                      )}>
                        {row.tab}
                      </span>
                    </td>
                    <td className={`px-4 py-3 ${DESIGN.text.value} tabular-nums`}>
                      {row.days_since_submitted != null ? `${row.days_since_submitted}d` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {row.email && (
                          <Tooltip content="Email" delay={300}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEmail(row);
                              }}
                              className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-blue-50 hover:text-blue-600 ${DESIGN.transition}`}
                              aria-label="Email"
                            >
                              <Mail size={16} strokeWidth={2} />
                            </button>
                          </Tooltip>
                        )}
                        {row.phone && (
                          <Tooltip content="Call" delay={300}>
                            <a
                              href={`tel:${row.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-slate-100 hover:text-slate-600 ${DESIGN.transition}`}
                              aria-label="Call"
                            >
                              <Phone size={16} strokeWidth={2} />
                            </a>
                          </Tooltip>
                        )}
                        {row.nova_url && (
                          <Tooltip content="Nova" delay={300}>
                            <a
                              href={row.nova_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-slate-100 hover:text-slate-600 ${DESIGN.transition}`}
                              aria-label="Nova"
                            >
                              <ExternalLink size={16} strokeWidth={2} />
                            </a>
                          </Tooltip>
                        )}
                        
                        {((row.tab === 'READY' || row.tab === 'SUBMITTED') && row.prospect_id) || 
                         (row.candidate_id && (
                           row.source_type === 'Retention' || 
                           row.source_type === 'ACTIVE_LOOKING' ||
                           row.source_type === 'Extension' ||
                           row.source_type === 'EXTENSION'
                         )) ? (
                          <Tooltip content={row.is_weekly_priority ? 'Remove from Top 15' : 'Add to Top 15'} delay={300}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePriority(row);
                              }}
                              className={cn(
                                `inline-flex items-center gap-1.5 px-2.5 py-1.5 ${DESIGN.radius.sm} text-[11px] font-semibold ${DESIGN.transition}`,
                                row.is_weekly_priority 
                                  ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                                  : 'text-slate-600 bg-slate-100 hover:bg-amber-50 hover:text-amber-700'
                              )}
                            >
                              <Star size={12} strokeWidth={2.5} className={row.is_weekly_priority ? 'fill-current' : ''} />
                              <span>{row.is_weekly_priority ? 'Top 15' : 'Add'}</span>
                            </button>
                          </Tooltip>
                        ) : null}
                        
                        {row.prospect_id && (
                          <Tooltip content="Promote" delay={300}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                promoteRow(row);
                              }}
                              className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 ${DESIGN.transition}`}
                              aria-label="Promote"
                            >
                              <TrendingUp size={16} strokeWidth={2} />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20">
        <div className="px-8 py-5">
          {/* Stats Grid */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <StatWidget 
              label="All" 
              value={stats.all} 
              onClick={() => {
                setTabView('all');
                setViewMode('list');
              }} 
              isActive={tabView === 'all'} 
            />
            <StatWidget 
              label="Prospects" 
              value={stats.prospects} 
              onClick={() => {
                setTabView('prospects');
                setViewMode('list');
              }} 
              isActive={tabView === 'prospects'} 
            />
            <StatWidget 
              label="Retention" 
              value={stats.retention} 
              onClick={() => {
                setTabView('retention');
                setViewMode('list');
              }} 
              isActive={tabView === 'retention'} 
            />
            <StatWidget 
              label="Extension" 
              value={stats.extension} 
              onClick={() => {
                setTabView('extension');
                setViewMode('list');
              }} 
              isActive={tabView === 'extension'} 
            />
            <StatWidget 
              label="Top 15" 
              value={stats.top15} 
              onClick={() => setViewMode('top15')} 
              isActive={viewMode === 'top15'} 
            />
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
                  placeholder="Search by name or facility..."
                  className={`w-72 pl-10 pr-4 py-2.5 text-[13px] bg-white border border-${DESIGN.colors.border}/80 ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 ${DESIGN.transition}`}
                  aria-label="Search"
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')} 
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 ${DESIGN.radius.full} hover:bg-${DESIGN.colors.bgSubtle}`}
                    aria-label="Clear search"
                  >
                    <X size={14} className="text-slate-500" strokeWidth={2} />
                  </button>
                )}
              </div>

              {/* Refresh */}
              <button
                onClick={() => refresh()}
                className={`p-2.5 ${DESIGN.radius.sm} text-slate-500 hover:bg-${DESIGN.colors.bgSubtle} hover:text-slate-800 ${DESIGN.transition}`}
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw size={18} className={cn(loading && 'animate-spin')} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-hidden">{renderContent()}</main>

      {/* Modals */}
      {selectedRow && showDetailModal && (
        <AssignmentDetailModal
          isOpen={true}
          onClose={handleCloseDetailModal}
          assignment={rowToAssignment(selectedRow)}
          onToggleRetention={() => showToast('Not available in Submittals', 'info')}
          onToggleExiting={() => showToast('Not available in Submittals', 'info')}
          onEmail={(assignment) => {
            handleCloseDetailModal();
            handleOpenEmail(selectedRow);
          }}
          onUpdateStage={(id, newStage) => {
            showToast(`Updated to ${newStage}`, 'success');
            refresh();
          }}
        />
      )}

      {activeModal === 'prospect' && prospectData && (
        <EmailTemplateModal
          isOpen={true}
          prospect={prospectData}
          extractedData={null}
          onClose={handleCloseModal}
          onSend={handleCloseModal}
          showToastNotification={showToast}
        />
      )}

      {activeModal === 'assignment' && contractData && (
        <AssignmentEmailModal
          isOpen={true}
          contract={contractData}
          onClose={handleCloseModal}
          initialTab={selectedRow?.extension_stage as any || 'outreach'}
          showToast={showToast}
        />
      )}

      {selectedRow && editModalOpen && (
        <EditProspectModal
          prospect={legacyToProspect(selectedRow)}
          onClose={() => {
            setEditModalOpen(false);
            refresh();
          }}
          onUpdate={refresh}
          showToastNotification={showToast}
        />
      )}

      {/* Toast */}
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
        .animate-fadeIn { animation: fadeIn 0.15s ease-out; }
        .animate-fadeInUp { animation: fadeInUp 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.2s ease-out; }
        
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