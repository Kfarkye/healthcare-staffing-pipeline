// ============================================================================
// src/components/SubmittalDashboard.tsx
// Radiant 2.0 Unified Edition: Precision, Hierarchy, Calm
// ============================================================================

import { useMemo, useState, useCallback } from 'react';
import {
  Search, RefreshCw, BarChart2,
  Star, Mail, Clock,
  CheckCircle2, AlertCircle, X,
  Phone, TrendingUp, List, Columns3
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useClinicianDashboard, TabId, ClinicianRow, ViewName } from '../hooks/useClinicianDashboard';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSortedCandidates, getUrgencyLevel, getUrgencyIndicator } from '../hooks/useSortedCandidates';
import { cn } from '../lib/utils';
import { toProspectLike, ProspectLike, getCardKey } from '../types/submittals';
import { DashboardShell } from './shared/DashboardShell';
import { StatCard } from './shared/StatCard';
import EmailTemplateModal from './prospects/EmailTemplateModal';
import AssignmentEmailModal from './AssignmentEmailModal';
import { AssignmentDetailModal } from './AssignmentDetailModal';
import EditProspectModal from './prospects/EditProspectModal';
import { SourceBadge } from '../shared/components/Badge';
import { toContractData } from '../utils/modalTransformers';
import type { ActiveAssignment } from '../lib/supabase/assignments';

// ============================================================================
// DESIGN SYSTEM
// ============================================================================

const DESIGN = {
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
    full: 'rounded-full',
  },
  colors: {
    border: 'slate-200',
    borderHover: 'slate-300',
    bgCard: 'white',
    bgSubtle: 'slate-50',
  },
  elevation: {
    card: 'shadow-sm border',
    float: 'shadow-md border',
  },
  transition: 'transition-all duration-150 ease-out',
  text: {
    heading: 'text-[16px] font-semibold tracking-tight text-slate-900',
    body: 'text-[12px] text-slate-600',
    value: 'text-[13px] font-medium text-slate-900',
    caption: 'text-[11px] text-slate-500',
    label: 'text-[10px] font-semibold uppercase tracking-wider text-slate-500',
  }
};

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'kanban' | 'top15' | 'list';
type TabView = 'all' | 'prospects' | 'retention' | 'extension';

interface ToastData {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const PIPELINE_COLUMNS = [
  { id: 'READY' as const, label: 'Ready', description: 'Ready to submit', color: 'bg-amber-500' },
  { id: 'SUBMITTED' as const, label: 'Submitted', description: 'Submitted to facility', color: 'bg-blue-500' },
  { id: 'OFFER' as const, label: 'Offer', description: 'Offer received', color: 'bg-purple-500' },
  { id: 'PRESTART' as const, label: 'Prestart', description: 'Accepted & onboarding', color: 'bg-emerald-500' },
];

// ============================================================================
// UTILITIES
// ============================================================================

const rowToAssignment = (row: ClinicianRow): ActiveAssignment => {
  let daysToEnd = 0;
  if (row.contract_end_date) {
    const endDate = new Date(row.contract_end_date);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    daysToEnd = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return {
    id: Number(row.engagement_id || row.candidate_id || 0),
    candidate_id: Number(row.candidate_id || 0),
    engagement_id: Number(row.engagement_id || 0),
    candidate_name: row.full_name || 'Unknown',
    nova_url: row.nova_url || null,
    email: row.email || null,
    phone: row.phone || null,
    facility_name: row.facility_name || null,
    specialty: row.engagement_specialty || row.primary_specialty || null,
    end_date: row.contract_end_date!,
    days_to_end: daysToEnd,
    extension_stage: (row.extension_stage as string) || 'outreach',
    is_looking_for_new_facility: !!row.seeking_new,
    is_exiting: false,
    actual_margin: row.actual_margin || 0,
    am_name: row.am_name || null,
    ac_name: row.ac_name || null,
    status: row.raw_status || 'Active',
    end_bucket: (row.end_bucket as string) || 'ENDS_LATER',
    bill_rate: row.bill_rate || 0,
    notes: row.engagement_notes || '',
  };
};

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
      >
        <Icon size={14} strokeWidth={2.5} className={mode === 'top15' && viewMode === 'top15' ? 'fill-current' : ''} />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

// ============================================================================
// SUB-COMPONENTS
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
    >
      <div className={cn(
        `absolute -top-4 -left-4 w-12 h-12 ${DESIGN.radius.full}`,
        `flex items-center justify-center font-bold text-base ${DESIGN.elevation.float}`,
        `bg-gradient-to-br from-white to-slate-50 text-slate-800 border-${DESIGN.colors.border}/80`
      )}>
        {rank}
      </div>

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
            urgency.bgTint, urgency.ringColor, 'ring-1 shadow-sm'
          )}>
            {urgency.icon}
            <span>{urgency.label}</span>
          </div>
        )}
      </div>

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

      <div className={`flex items-center justify-between pt-5 border-t border-${DESIGN.colors.border}`}>
        <div className="flex items-center gap-1">
          {row.email && (
            <button
              onClick={(e) => stop(e, onOpenEmail)}
              className={`p-2.5 ${DESIGN.radius.md} text-slate-400 hover:bg-blue-50 hover:text-blue-600 ${DESIGN.transition}`}
            >
              <Mail size={18} strokeWidth={2} />
            </button>
          )}
          {row.phone && (
            <a
              href={`tel:${row.phone}`}
              onClick={(e) => stop(e)}
              className={`p-2.5 ${DESIGN.radius.md} text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${DESIGN.transition}`}
            >
              <Phone size={18} strokeWidth={2} />
            </a>
          )}
        </div>
        <button
          onClick={(e) => stop(e, onTogglePriority)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold"
        >
          <X size={14} strokeWidth={2.5} />
          REMOVE
        </button>
      </div>
    </div>
  );
};

const SubmittalCard: React.FC<{
  row: ClinicianRow;
  onSelect: () => void;
  onOpenEmail: () => void;
  onPromoteRow?: () => void;
  onTogglePriority: () => void;
  onDragStart?: (e: React.DragEvent, row: ClinicianRow) => void;
  isDraggable?: boolean;
  index: number;
}> = ({ row, onSelect, onOpenEmail, onTogglePriority, onDragStart, isDraggable = false, index }) => {
  const urgencyLevel = getUrgencyLevel(row.days_since_submitted);
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

  return (
    <div
      onClick={onSelect}
      draggable={isDraggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, row) : undefined}
      className={cn(
        `relative bg-white ${DESIGN.radius.sm} border p-4 cursor-pointer ${DESIGN.transition} group`,
        `hover:shadow-sm hover:border-slate-300 hover:-translate-y-0.5`,
        urgencyLevel === 'critical' ? 'border-red-200' : 'border-slate-200'
      )}
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-bold text-slate-900 truncate mb-0.5">{row.full_name || 'Unknown'}</h3>
          <p className="text-[11px] text-slate-500 truncate">{row.primary_specialty || '—'}</p>
        </div>
        {isPriority && <Star size={14} className="text-amber-500 fill-amber-500 shrink-0" strokeWidth={2.5} />}
      </div>

      <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all">
        <div className="flex items-center gap-1">
          {row.email && (
            <button onClick={(e) => { e.stopPropagation(); onOpenEmail(); }} className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600">
              <Mail size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        {canBePrioritized && !isPriority && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePriority(); }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-600 text-[10px] font-bold"
          >
            <Star size={10} strokeWidth={3} />
            TOP 15
          </button>
        )}
      </div>
    </div>
  );
};

const KanbanColumn: React.FC<{
  title: string;
  count: number;
  rows: ClinicianRow[];
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragStart?: (e: React.DragEvent, row: ClinicianRow) => void;
  onSelectRow: (row: ClinicianRow) => void;
  onOpenEmail: (row: ClinicianRow) => void;
  onTogglePriority: (row: ClinicianRow) => void;
  dropTarget?: boolean;
  color?: string;
}> = ({ title, count, rows, dropTarget, onDragOver, onDragLeave, onDrop, onDragStart, onSelectRow, onOpenEmail, onTogglePriority, color }) => (
  <div className="flex flex-col h-full min-w-[280px]">
    <div className="mb-4 sticky top-0 bg-slate-50/80 backdrop-blur pb-3 z-10">
      <div className="flex items-baseline gap-2">
        {color && <div className={cn(`w-2 h-2 rounded-full`, color)} />}
        <h3 className="text-[12px] font-bold text-slate-900 uppercase tracking-tight">{title}</h3>
        <span className="text-[12px] font-medium text-slate-400 tabular-nums">{count}</span>
      </div>
    </div>

    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        `flex-1 space-y-3 p-3 ${DESIGN.radius.lg} bg-slate-100/40 border-2 transition-all duration-200 overflow-y-auto`,
        dropTarget ? 'border-blue-400 bg-blue-50/50 ring-4 ring-blue-500/10' : 'border-transparent'
      )}
    >
      {rows.map((row, i) => (
        <SubmittalCard
          key={getCardKey(row, i)}
          row={row}
          index={i}
          onSelect={() => onSelectRow(row)}
          onOpenEmail={() => onOpenEmail(row)}
          onTogglePriority={() => onTogglePriority(row)}
          onDragStart={onDragStart}
          isDraggable={true}
        />
      ))}
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SubmittalsDashboard() {
  const [selectedRow, setSelectedRow] = useState<ClinicianRow | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [tabView, setTabView] = useState<TabView>('all');
  const [dragOver, setDragOver] = useState<TabId | null>(null);
  const [activeModal, setActiveModal] = useState<'prospect' | 'assignment' | 'edit_prospect' | null>(null);
  const [prospectData, setProspectData] = useState<ProspectLike | null>(null);
  const [contractData, setContractData] = useState<any>(null);

  const debouncedSearch = useDebouncedValue(search);

  const { rows, loading, error, isStale, refresh } = useClinicianDashboard({
    view: 'submittals_dashboard' as ViewName,
    q: debouncedSearch,
    limit: 500,
  });

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToast({ id, message: msg, type });
    setTimeout(() => setToast(c => c?.id === id ? null : c), 4000);
  }, []);

  const stats = useMemo(() => {
    const pCount = rows.filter(r => ['Prospect', 'NEW_PROSPECT', 'PROSPECT'].includes(r.source_type as string)).length;
    const rCount = rows.filter(r => ['Retention', 'ACTIVE_LOOKING'].includes(r.source_type as string)).length;
    const eCount = rows.filter(r => ['Extension', 'EXTENSION'].includes(r.source_type as string)).length;
    const tCount = rows.filter(r => r.is_weekly_priority === true).length;
    return { all: rows.length, prospects: pCount, retention: rCount, extension: eCount, top15: tCount };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (tabView === 'all') return rows;
    if (tabView === 'prospects') return rows.filter(r => ['Prospect', 'NEW_PROSPECT', 'PROSPECT'].includes(r.source_type as string));
    if (tabView === 'retention') return rows.filter(r => ['Retention', 'ACTIVE_LOOKING'].includes(r.source_type as string));
    if (tabView === 'extension') return rows.filter(r => ['Extension', 'EXTENSION'].includes(r.source_type as string));
    return rows;
  }, [tabView, rows]);

  const byTab = useMemo(() => {
    const map: Record<TabId, ClinicianRow[]> = {
      KANBAN: [], PROSPECTS: [], READY: [], SUBMITTED: [], OFFER: [], PRESTART: [], SIGNED: [], ACTIVE: [], INACTIVE: []
    };
    rows.forEach(r => { if (r.tab && map[r.tab as TabId]) map[r.tab as TabId].push(r); });
    return map;
  }, [rows]);

  const sortedRows = useSortedCandidates(filteredRows, {
    tab: viewMode === 'kanban' ? undefined : (('READY' as string) as unknown as TabId),
    preference: 'recent'
  });

  const handleTogglePriority = useCallback(async (row: ClinicianRow) => {
    let rid: number | null = null;
    let table = '';
    let col = '';

    if (row.prospect_id) {
      rid = Number(row.prospect_id); table = 'prospects'; col = 'id';
    } else if (row.candidate_id) {
      rid = Number(row.candidate_id); table = 'active_assignments'; col = 'candidate_id';
    }

    if (!rid || !table) return;

    const newState = !row.is_weekly_priority;
    if (newState && stats.top15 >= 15) {
      showToast('Top 15 is full', 'error');
      return;
    }

    try {
      const { error } = await supabase.from(table).update({ is_weekly_priority: newState }).eq(col, rid);
      if (error) throw error;
      showToast(newState ? 'Added to Top 15' : 'Removed', 'success');
      refresh();
    } catch (_e) {
      showToast('Update failed', 'error');
    }
  }, [stats.top15, showToast, refresh]);

  const handleOpenEmail = useCallback((row: ClinicianRow) => {
    setSelectedRow(row);
    setTimeout(() => {
      const isP = ['Prospect', 'NEW_PROSPECT', 'PROSPECT'].includes(row.source_type as string);
      if (isP) {
        setProspectData(toProspectLike(row));
        setActiveModal('prospect');
      } else {
        setContractData(toContractData(row));
        setActiveModal('assignment');
      }
    }, 50);
  }, []);

  const handleSelectRow = useCallback((row: ClinicianRow) => {
    const isP = ['Prospect', 'NEW_PROSPECT', 'PROSPECT'].includes(row.source_type as string);
    setSelectedRow(row);
    if (isP) {
      setProspectData(toProspectLike(row));
      setActiveModal('edit_prospect');
    } else {
      setShowDetailModal(true);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, target: TabId) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const rowStr = e.dataTransfer.getData('text/plain');
      if (!rowStr) return;
      const row = JSON.parse(rowStr) as ClinicianRow;
      if (row.tab === target) return;

      if (row.prospect_id) {
        const statuses: Record<TabId, string> = { KANBAN: '', PROSPECTS: '', READY: 'Submittal Ready', SUBMITTED: 'Submitted', OFFER: 'Offer Extended', PRESTART: 'Hired', SIGNED: '', ACTIVE: '', INACTIVE: '' };
        if (statuses[target]) {
          await supabase.from('prospects').update({ status: statuses[target], updated_at: new Date().toISOString() }).eq('id', Number(row.prospect_id));
        }
      } else if (row.candidate_id) {
        const stages: Record<TabId, string> = { KANBAN: 'outreach', PROSPECTS: 'outreach', READY: 'outreach', SUBMITTED: 'interested', OFFER: 'extension_approved', PRESTART: 'signed', SIGNED: '', ACTIVE: '', INACTIVE: '' };
        await supabase.from('active_assignments').update({ extension_stage: stages[target], updated_at: new Date().toISOString() }).eq('candidate_id', Number(row.candidate_id));
      }
      showToast(`Moved to ${target}`, 'success');
      setTimeout(() => refresh(), 100);
    } catch (_err) {
      showToast('Move failed', 'error');
    }
  }, [refresh, showToast]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <DashboardShell
        title="Submittals Pipeline"
        subtitle="End-to-end cycle tracking for prospects and retention candidates."
        eyebrow="Radiant Dashboard"
        actions={
          <div className="flex items-center gap-4">
            <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search precision..."
                className="pl-11 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] w-64 outline-none"
              />
            </div>
            <button
              onClick={() => refresh()}
              className={cn("p-2 transition-colors", loading ? "text-blue-500" : "text-slate-400 hover:text-slate-900")}
              title={error ? "Refresh failed. Click to retry." : "Refresh data"}
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            {isStale && (
              <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full border border-amber-200 animate-pulse">
                <Clock size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Stale Data</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-200">
                <AlertCircle size={12} />
                <span className="text-[10px] font-bold truncate max-w-[200px]">{error}</span>
                <button onClick={() => refresh()} className="underline font-bold ml-1 active:scale-95">RETRY</button>
              </div>
            )}
          </div>
        }
      >
        <div className="space-y-8 pb-32">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
            <StatCard label="Pipeline Total" value={stats.all} onClick={() => { setTabView('all'); setViewMode('list'); }} isActive={tabView === 'all'} icon={<BarChart2 size={18} />} color="slate" />
            <StatCard label="Prospects" value={stats.prospects} onClick={() => { setTabView('prospects'); setViewMode('list'); }} isActive={tabView === 'prospects'} icon={<TrendingUp size={18} />} color="blue" />
            <StatCard label="Retention" value={stats.retention} onClick={() => { setTabView('retention'); setViewMode('list'); }} isActive={tabView === 'retention'} icon={<RefreshCw size={18} />} color="amber" />
            <StatCard label="Extension" value={stats.extension} onClick={() => { setTabView('extension'); setViewMode('list'); }} isActive={tabView === 'extension'} icon={<Clock size={18} />} color="emerald" />
            <StatCard label="Top 15 Pool" value={stats.top15} onClick={() => setViewMode('top15')} isActive={viewMode === 'top15'} icon={<Star size={18} />} color="rose" />
          </div>

          <div className="bg-white rounded-[32px] border border-slate-200 p-8 min-h-[600px] shadow-sm">
            {viewMode === 'kanban' ? (
              <div className="flex gap-6 h-full overflow-x-auto pb-4 custom-scrollbar">
                {PIPELINE_COLUMNS.map(col => (
                  <KanbanColumn
                    key={col.id}
                    title={col.label}
                    count={byTab[col.id].length}
                    rows={byTab[col.id]}
                    color={col.id === dragOver ? 'bg-blue-500' : col.color}
                    dropTarget={dragOver === col.id}
                    onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => handleDrop(e, col.id)}
                    onDragStart={(e, row) => {
                      e.dataTransfer.setData('text/plain', JSON.stringify(row));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onSelectRow={handleSelectRow}
                    onOpenEmail={handleOpenEmail}
                    onTogglePriority={handleTogglePriority}
                  />
                ))}
              </div>
            ) : viewMode === 'top15' ? (
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {rows.filter(r => r.is_weekly_priority).slice(0, 15).map((r, i) => (
                    <Top15Card
                      key={getCardKey(r, i)}
                      row={r}
                      rank={i + 1}
                      onSelect={() => handleSelectRow(r)}
                      onOpenEmail={() => handleOpenEmail(r)}
                      onTogglePriority={() => handleTogglePriority(r)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['', 'Name', 'State', 'Source', 'Stage', 'Actions'].map(h => (
                        <th key={h} className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedRows.map((r, i) => (
                      <tr key={getCardKey(r, i)} onClick={() => handleSelectRow(r)} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                        <td className="px-6 py-5 w-12">{r.is_weekly_priority && <Star size={14} className="fill-amber-400 text-amber-400" />}</td>
                        <td className="px-6 py-5">
                          <p className="text-[14px] font-bold text-slate-900 tracking-tight">{r.full_name}</p>
                          <p className="text-[12px] text-slate-500">{r.primary_specialty}</p>
                        </td>
                        <td className="px-6 py-5 text-[12px] font-medium text-slate-600">{r.home_state || '—'}</td>
                        <td className="px-6 py-5"><SourceBadge sourceType={r.source_type} isActiveSubmittal={r.is_active_submittal} /></td>
                        <td className="px-6 py-5">
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold">{r.tab}</span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={e => { e.stopPropagation(); handleOpenEmail(r); }} className="p-2 hover:bg-white rounded-xl shadow-sm border border-slate-100"><Mail size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DashboardShell>

      <AnimatePresence>
        {selectedRow && showDetailModal && (
          <AssignmentDetailModal
            isOpen={true}
            onClose={() => { setShowDetailModal(false); setSelectedRow(null); }}
            assignment={rowToAssignment(selectedRow)}
            onEmail={() => { setShowDetailModal(false); handleOpenEmail(selectedRow); }}
            onUpdateStage={(_id, stage) => {
              showToast(`Updated to ${stage}`, 'success');
              refresh();
            }}
            onToggleRetention={() => { }}
            onToggleExiting={() => { }}
          />
        )}
      </AnimatePresence>

      {activeModal === 'prospect' && prospectData && (
        <EmailTemplateModal
          isOpen={true}
          prospect={{
            ...prospectData,
            name: prospectData.full_name || (prospectData as Record<string, unknown>).name as string || 'Unknown',
            id: Number(prospectData.id),
            created_at: (prospectData as Record<string, unknown>).updated_at as string || new Date().toISOString()
          } as any}
          onSend={() => setActiveModal(null)}
          onClose={() => setActiveModal(null)}
          showToastNotification={showToast}
          extractedData={null}
        />
      )}

      {activeModal === 'assignment' && contractData && (
        <AssignmentEmailModal
          isOpen={true}
          contract={contractData}
          onClose={() => setActiveModal(null)}
          initialTab={(selectedRow?.extension_stage as 'outreach' | 'interested' | 'extension_request') || 'outreach'}
          showToast={showToast}
        />
      )}

      {activeModal === 'edit_prospect' && prospectData && (
        <EditProspectModal
          prospect={{
            ...prospectData,
            name: prospectData.full_name || (prospectData as Record<string, unknown>).name as string || 'Unknown',
            id: Number(prospectData.id),
            created_at: (prospectData as Record<string, unknown>).updated_at as string || new Date().toISOString()
          } as any}
          onClose={() => { setActiveModal(null); setSelectedRow(null); refresh(); }}
          onUpdate={refresh}
          showToastNotification={showToast}
        />
      )}

      {toast && (
        <div className={cn("fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl z-[100] animate-in slide-in-from-bottom-4", toast.type === 'success' ? 'bg-emerald-600' : 'bg-slate-900', "text-white")}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-[13px] font-bold">{toast.message}</span>
        </div>
      )}
    </div>
  );
}