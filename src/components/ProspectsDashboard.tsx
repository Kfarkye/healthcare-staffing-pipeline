import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Search, Plus, RefreshCw, Mail, MessageSquare,
  Columns3, List, GripVertical, Diamond,
  Archive, X, CheckCircle, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { SMSModal } from './SMSModal';
import { EmailTemplateModal } from './prospects/EmailTemplateModal';
import AddProspectModal from './prospects/AddProspectModal';
import EditProspectModal from './prospects/EditProspectModal';

// ============================================================================
// DESIGN SYSTEM - Jony Ive Infused Precision
// ============================================================================

const DESIGN = {
  colors: {
    primary: 'slate-950',
    primaryHover: 'slate-900',
    bgCard: 'white',
    bgSubtle: 'slate-50',
    border: 'slate-200',
    borderHover: 'slate-300',
    accent: 'blue-600',
  },
  radius: {
    sm: 'rounded-xl',
    md: 'rounded-[24px]',
    lg: 'rounded-[32px]',
    full: 'rounded-full',
  },
  elevation: {
    card: 'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
    modal: 'shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)]',
  },
  transition: 'transition-all duration-300 cubic-bezier(0.23, 1, 0.32, 1)',
  text: {
    heading: 'text-[22px] font-bold tracking-tight text-slate-900',
    stat: 'text-[18px] font-bold tracking-tight',
    label: 'text-[11px] font-bold uppercase tracking-widest text-slate-400',
    body: 'text-[13px] text-slate-600 leading-relaxed',
    value: 'text-[14px] font-bold text-slate-900 tracking-tight',
    caption: 'text-[11px] text-slate-400 font-medium',
  },
  motion: {
    spring: { type: 'spring', stiffness: 300, damping: 30 } as any
  }
};

const PRISMATIC_GLOW = "after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[0_0_15px_rgba(59,130,246,0.15)] after:opacity-0 group-hover:after:opacity-100 after:transition-opacity";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type StatusId = 'New' | 'Contacted' | 'Interested' | 'Profile Updates' | 'Not Interested' | 'Submittal Ready' | 'Submitted' | 'Archived';
type ViewMode = 'kanban' | 'list' | 'ranking';
type ReadinessFilter = 'notReady' | 'almostReady' | 'ready' | 'stalled' | null;
type ModalType = 'add' | 'edit' | 'email' | 'batch_reference' | 'batch_reassignment' | null;

interface Prospect {
  id: number;
  candidate_id: number;
  name: string;
  email?: string;
  phone?: string;
  profession?: string;
  specialty?: string;
  home_state?: string;
  status: StatusId;
  profile_score?: number;
  updated_at?: string;
  created_at?: string;
  is_diamond_verified?: boolean;
  nova_url?: string;
  template_extracted_data?: any;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const PIPELINE_COLUMNS: { id: StatusId; label: string }[] = [
  { id: 'New', label: 'New Lead' },
  { id: 'Contacted', label: 'In Outreach' },
  { id: 'Interested', label: 'Engaged' },
  { id: 'Profile Updates', label: 'Profiling' },
  { id: 'Submittal Ready', label: 'Ready' },
  { id: 'Submitted', label: 'Submitted' },
];

const SPECIALTY_COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-amber-500',
  'bg-emerald-500', 'bg-cyan-500', 'bg-rose-500', 'bg-teal-500',
];

// ============================================================================
// UTILITIES
// ============================================================================

const isStalled = (p: Prospect): boolean => {
  if (!p.updated_at) return false;
  const days = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24));
  return days >= 3;
};

// ============================================================================
// COMPONENTS
// ============================================================================

const StatWidget: React.FC<{ label: string; value: number; onClick: () => void; isActive: boolean }> = ({ label, value, onClick, isActive }) => (
  <button
    onClick={onClick}
    className={cn(
      `group relative flex flex-col items-start p-4 ${DESIGN.radius.md} border ${DESIGN.transition}`,
      isActive
        ? `bg-slate-900 border-slate-900 ${DESIGN.elevation.card} text-white`
        : `bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50`
    )}
  >
    <div className={cn(DESIGN.text.label, isActive ? 'text-slate-400' : 'text-slate-400')}>{label}</div>
    <div className={cn(DESIGN.text.stat, isActive ? 'text-white' : 'text-slate-900')}>{value}</div>
  </button>
);

const ViewSwitcher: React.FC<{ viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }> = ({ viewMode, setViewMode }) => (
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
          viewMode === mode ? `bg-white text-slate-900 ${DESIGN.elevation.card}` : 'bg-transparent text-slate-500 hover:text-slate-800'
        )}
      >
        <Icon size={14} strokeWidth={2.5} />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

const ProspectCard: React.FC<{ prospect: Prospect; onSelect: () => void; onOpenEmail: () => void; onOpenSMS: () => void; onArchive: () => void; index: number }> = ({ prospect, onSelect, onOpenEmail, onOpenSMS, onArchive }) => {
  const stop = (e: React.MouseEvent, fn: () => void) => { e.stopPropagation(); fn(); };
  const isDiamond = prospect.is_diamond_verified;
  const [isDragging, setIsDragging] = useState(false);

  // Drag handler: Attaches prospect data to the drag payload
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      contextType: 'candidate',
      id: prospect.id,
      name: prospect.name,
      specialty: prospect.specialty,
      status: prospect.status,
      email: prospect.email
    }));
    e.dataTransfer.effectAllowed = 'copy';
    setIsDragging(true);
  };

  const handleDragEnd = () => setIsDragging(false);

  return (
    <motion.div
      layoutId={prospect.id.toString()}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0, scale: isDragging ? 0.95 : 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      style={{ cursor: 'grab' }}
      draggable="true"
      onDragStart={handleDragStart as any}
      onDragEnd={handleDragEnd as any}
      onClick={onSelect}
      className={cn(
        `group relative bg-white p-4 rounded-xl border border-slate-200/60 hover:border-blue-400/30 hover:shadow-lg hover:shadow-blue-900/5 transition-all duration-300`,
        isDragging ? 'ring-2 ring-indigo-400 rotate-2 opacity-50' : '',
        isDiamond ? PRISMATIC_GLOW : ''
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full",
            prospect.status === 'New' ? 'bg-blue-500' :
              prospect.status === 'Contacted' ? 'bg-amber-500' :
                prospect.status === 'Interested' ? 'bg-emerald-500' : 'bg-slate-400')} />
          <h4 className={DESIGN.text.value}>{prospect.name}</h4>
        </div>
        {isDiamond && <Diamond size={14} className="text-blue-500" />}
      </div>
      <div className="space-y-1 mb-4">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{prospect.profession} {prospect.specialty}</div>
        {prospect.home_state && <div className="text-[10px] font-medium text-slate-400">{prospect.home_state}</div>}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-slate-50">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => stop(e, onOpenEmail)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-950 transition-colors"><Mail size={14} /></button>
          <button onClick={(e) => stop(e, onOpenSMS)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-950 transition-colors"><MessageSquare size={14} /></button>
          <button onClick={(e) => stop(e, onArchive)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"><Archive size={14} /></button>
        </div>
        <span className="text-[10px] font-bold text-slate-300 tabular-nums">#{prospect.candidate_id}</span>
      </div>
    </motion.div>
  );
};

const KanbanColumn: React.FC<{ title: string; count: number; rows: Prospect[]; onSelectRow: (p: Prospect) => void; onOpenEmail: (p: Prospect) => void; onOpenSMS: (p: Prospect) => void; onArchive: (p: Prospect) => void; onDragOver?: (e: React.DragEvent) => void; onDrop?: (e: React.DragEvent) => void; onDragStart?: (e: React.DragEvent, p: Prospect) => void; color?: string }> = ({ title, count, rows, onSelectRow, onOpenEmail, onOpenSMS, onArchive, onDragOver, onDrop, color }) => (
  <div className="flex flex-col h-full">
    <div className="mb-4 bg-gradient-to-b from-slate-50 to-transparent pb-3 sticky top-0 z-10 flex items-center gap-2">
      {color && <div className={cn(`w-2 h-2 ${DESIGN.radius.full}`, color)} />}
      <h3 className="text-[12px] font-semibold tracking-tight text-slate-900">{title}</h3>
      <span className="text-[11px] font-bold text-slate-400 tabular-nums">{count}</span>
    </div>
    <div onDragOver={onDragOver} onDrop={onDrop} className="flex-1 space-y-3 p-2 rounded-2xl bg-slate-100/30 border border-transparent overflow-y-auto no-scrollbar">
      {rows.map((r, i) => (
        <ProspectCard key={r.id} prospect={r} index={i} onSelect={() => onSelectRow(r)} onOpenEmail={() => onOpenEmail(r)} onOpenSMS={() => onOpenSMS(r)} onArchive={() => onArchive(r)} />
      ))}
    </div>
  </div>
);

const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info'; onDismiss: () => void }> = ({ message, type, onDismiss }) => {
  const styles = { info: 'bg-slate-900 text-white', success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white' };
  const Icon = type === 'success' ? CheckCircle : AlertCircle;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className={cn(`fixed bottom-6 right-6 z-50 flex items-center gap-3 ${DESIGN.radius.md} px-5 py-3.5 text-[13px] font-medium shadow-2xl backdrop-blur-sm`, styles[type])}>
      <Icon size={18} strokeWidth={2.5} />
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-4 -mr-2 p-1 rounded-full hover:bg-white/10 transition-colors"><X size={16} /></button>
    </motion.div>
  );
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
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
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [selectedForSMS, setSelectedForSMS] = useState<Prospect | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ id: Date.now(), message: msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const { data, error } = await supabase.from('prospects').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setProspects((data || []).map(p => ({ ...p, status: p.status || 'New' })));
    } catch (err: any) {
      console.error('[Load]', err);
      showToast(err.message || 'Failed to load prospects', 'error');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(true); }, [load]);

  useEffect(() => {
    const handleUI = (e: CustomEvent) => {
      const s = e.detail;
      if (s.search_term !== undefined) setSearch(s.search_term);
      if (s.view_mode !== undefined) setViewMode(s.view_mode);
      if (s.filter_status !== undefined) setReadinessFilter(s.filter_status as any);
    };

    const handleRefresh = () => load();

    window.addEventListener('set_dashboard_ui_state' as any, handleUI as any);
    window.addEventListener('refresh_dashboard' as any, handleRefresh as any);

    return () => {
      window.removeEventListener('set_dashboard_ui_state' as any, handleUI as any);
      window.removeEventListener('refresh_dashboard' as any, handleRefresh as any);
    };
  }, [load]);

  const byStatus = useMemo(() => {
    const map: Record<StatusId, Prospect[]> = { 'New': [], 'Contacted': [], 'Interested': [], 'Profile Updates': [], 'Not Interested': [], 'Submittal Ready': [], 'Submitted': [], 'Archived': [] };
    prospects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.specialty?.toLowerCase().includes(search.toLowerCase()))
      .forEach(p => {
        // Resiliency: Find matching status key case-insensitively to handle DB impurities
        const statusKey = Object.keys(map).find(k => k.toLowerCase() === (p.status || '').toLowerCase());
        if (statusKey && map[statusKey as StatusId]) {
          map[statusKey as StatusId].push(p);
        } else {
          // Fallback to New if status is unknown/mismatched
          map['New'].push(p);
        }
      });
    return map;
  }, [prospects, search]);

  const filteredRows = useMemo(() => {
    let rows = prospects;
    if (readinessFilter) {
      rows = rows.filter(p => {
        const s = p.profile_score || 0;
        if (readinessFilter === 'notReady') return s < 80;
        if (readinessFilter === 'almostReady') return s >= 80 && s < 100;
        if (readinessFilter === 'ready') return s === 100;
        if (readinessFilter === 'stalled') return isStalled(p);
        return true;
      });
    }
    if (search) {
      const t = search.toLowerCase();
      rows = rows.filter(p => p.name.toLowerCase().includes(t) || p.specialty?.toLowerCase().includes(t) || p.email?.toLowerCase().includes(t));
    }
    return rows;
  }, [prospects, readinessFilter, search]);

  const stats = useMemo(() => ({
    all: prospects.length,
    notReady: prospects.filter(p => (p.profile_score || 0) < 80).length,
    almostReady: prospects.filter(p => (p.profile_score || 0) >= 80 && (p.profile_score || 0) < 100).length,
    ready: prospects.filter(p => (p.profile_score || 0) === 100).length,
    stalled: prospects.filter(isStalled).length
  }), [prospects]);

  const handleArchive = async (p: Prospect) => {
    if (!confirm(`Archive ${p.name}?`)) return;
    try {
      const { error } = await supabase.from('prospects').update({ status: 'Not Interested' }).eq('id', p.id);
      if (error) throw error;
      showToast('Prospect archived', 'success'); load();
    } catch (err: any) { showToast(err.message, 'error'); }
  };

  const renderContent = () => {
    if (loading) return (
      <div className="h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
        <p className="editorial-caption">Cultivating Pipeline Data...</p>
      </div>
    );

    if (viewMode === 'ranking') {
      const specMap = new Map<string, Prospect[]>();
      filteredRows.forEach(p => { const s = p.specialty || 'Uncategorized'; if (!specMap.has(s)) specMap.set(s, []); specMap.get(s)!.push(p); });
      const sorted = Array.from(specMap.keys()).sort((a, b) => specMap.get(b)!.length - specMap.get(a)!.length);
      return (
        <motion.div key="ranking" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={DESIGN.motion.spring as any} className="h-full pb-10">
          <div className="flex gap-4 overflow-x-auto pb-4 h-full no-scrollbar">
            {sorted.map((s, i) => (
              <div key={s} className="flex-1 min-w-[280px] max-w-[400px] h-full">
                <KanbanColumn title={s} count={specMap.get(s)!.length} rows={specMap.get(s)!} onSelectRow={(p) => { setSelected(p); setModal('edit'); }} onOpenEmail={(p) => { setSelected(p); setModal('email'); }} onOpenSMS={(p) => { setSelectedForSMS(p); setSmsModalOpen(true); }} onArchive={handleArchive} color={SPECIALTY_COLORS[i % SPECIALTY_COLORS.length]} />
              </div>
            ))}
          </div>
        </motion.div>
      );
    }

    return (
      <AnimatePresence mode="wait">
        {viewMode === 'kanban' ? (
          <motion.div key="kanban" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={DESIGN.motion.spring as any} className="h-full no-scrollbar pb-10">
            <div className="flex gap-6 h-full min-w-max">
              {PIPELINE_COLUMNS.map(col => (
                <div key={col.id} className="w-80 flex flex-col group/column">
                  <div className="flex items-center gap-2 mb-4 px-2">
                    <h3 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-widest leading-none">{col.label}</h3>
                    <span className="bg-slate-200/50 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums group-hover/column:bg-slate-900 group-hover/column:text-white transition-all">{byStatus[col.id]?.length || 0}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 no-scrollbar space-y-1">
                    {byStatus[col.id]?.map((p, i) => (
                      <ProspectCard key={p.id} prospect={p} index={i} onSelect={() => { setSelected(p); setModal('edit'); }} onOpenEmail={() => { setSelected(p); setModal('email'); }} onOpenSMS={() => { setSelectedForSMS(p); setSmsModalOpen(true); }} onArchive={() => handleArchive(p)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={DESIGN.motion.spring as any}>
            <div className="bg-white rounded-[24px] border border-slate-200/60 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Candidate</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Profession</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRows.map(p => (
                    <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => { setSelected(p); setModal('edit'); }}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 font-bold text-[10px] tracking-tight uppercase">{p.name?.split(' ').map(n => n[0]).join('')}</div>
                          <div><div className="text-[13px] font-bold text-slate-900 tracking-tight">{p.name}</div><div className="text-[10px] text-slate-400 font-medium">#{p.candidate_id}</div></div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight",
                          p.status === 'New' ? 'bg-blue-50 text-blue-600' :
                            p.status === 'Contacted' ? 'bg-amber-50 text-amber-600' :
                              p.status === 'Interested' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[12px] text-slate-600 font-medium">{p.profession} {p.specialty}</td>
                      <td className="px-6 py-4 text-[12px] text-slate-600">{p.home_state || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setSelected(p); setModal('email'); }} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all text-slate-400 hover:text-slate-950"><Mail size={14} /></button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedForSMS(p); setSmsModalOpen(true); }} className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all text-slate-400 hover:text-slate-950"><MessageSquare size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans text-slate-800">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20">
        <div className="px-8 py-5">
          <div className="grid grid-cols-5 gap-4 mb-6">
            <StatWidget label="All" value={stats.all} onClick={() => setReadinessFilter(null)} isActive={readinessFilter === null} />
            <StatWidget label="Not Ready" value={stats.notReady} onClick={() => setReadinessFilter('notReady')} isActive={readinessFilter === 'notReady'} />
            <StatWidget label="Almost" value={stats.almostReady} onClick={() => setReadinessFilter('almostReady')} isActive={readinessFilter === 'almostReady'} />
            <StatWidget label="Ready" value={stats.ready} onClick={() => setReadinessFilter('ready')} isActive={readinessFilter === 'ready'} />
            <StatWidget label="Stalled 3+" value={stats.stalled} onClick={() => setReadinessFilter('stalled')} isActive={readinessFilter === 'stalled'} />
          </div>
          <div className="flex items-center justify-between">
            <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2} />
                <input ref={searchInputRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className={`w-64 pl-10 pr-4 py-2 text-[13px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 transition-all`} />
              </div>
              <button onClick={() => load()} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><RefreshCw size={18} className={cn(loading && 'animate-spin')} /></button>
              <button onClick={() => { setModal('add'); setSelected(null); }} className="px-4 py-2 bg-slate-950 text-white rounded-xl text-[13px] font-semibold hover:bg-slate-900 transition-colors flex items-center gap-2"><Plus size={16} /> Add</button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 p-8 overflow-hidden">{renderContent()}</main>
      {modal === 'add' && <AddProspectModal onClose={() => setModal(null)} onSave={async (d) => { const { error } = await supabase.from('prospects').insert([d]); if (!error) { setModal(null); load(); showToast('Prospect added', 'success'); } }} showToast={showToast} />}
      {modal === 'edit' && selected && <EditProspectModal prospect={selected as any} onClose={() => setModal(null)} onUpdate={() => { load(); setModal(null); showToast('Updated', 'success'); }} showToastNotification={showToast} />}
      {modal === 'email' && selected && <EmailTemplateModal isOpen={true} prospect={selected as any} extractedData={selected.template_extracted_data} onClose={() => setModal(null)} onSend={async () => { if (selected.status === 'New') { await supabase.from('prospects').update({ status: 'Contacted' }).eq('id', selected.id); load(); } setModal(null); showToast('Email sent', 'success'); }} showToastNotification={showToast} />}
      {smsModalOpen && selectedForSMS && <SMSModal isOpen={smsModalOpen} onClose={() => { setSmsModalOpen(false); setSelectedForSMS(null); }} candidateName={selectedForSMS.name} candidatePhone={selectedForSMS.phone || ''} onSend={() => { setSmsModalOpen(false); setSelectedForSMS(null); showToast('SMS Sent', 'success'); }} />}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <style>{` ::-webkit-scrollbar { width: 0; height: 0; } * { scrollbar-width: none; -ms-overflow-style: none; } `}</style>
    </div>
  );
}