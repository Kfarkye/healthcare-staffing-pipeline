import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, Plus, X, Edit3, Trash2, Loader, User,
  MapPin, Clock, RefreshCw, Mail, MessageSquare,
  Columns3, List, GripVertical, Diamond, Zap, Heart,
  CheckCircle, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { retryWithBackoff, withTimeout, circuitBreaker, getCachedData, setCachedData } from '../lib/resilience';
import { SMSModal } from './SMSModal';
import { EmailTemplateModal } from './prospects/EmailTemplateModal';
import AddProspectModal from './prospects/AddProspectModal';
import EditProspectModal from './prospects/EditProspectModal';
import { DashboardShell } from './shared/DashboardShell';
import { StatCard } from './shared/StatCard';
import { Badge } from '../shared/components/Badge';

// Import from shared types - single source of truth
import type { Prospect } from '../shared/types/database';

// ============================================================================
// TYPES
// ============================================================================

// View-specific types (not replacing Prospect)
type ProspectStatus = 'New' | 'Contacted' | 'Interested' | 'Stalled';
type ViewMode = 'kanban' | 'list' | 'ranking';

// ============================================================================
// CONSTANTS
// ============================================================================

const PROSPECT_STATUS: ProspectStatus[] = ['New', 'Contacted', 'Interested', 'Stalled'];
const SPECIALTIES = ['RN', 'LPN', 'CNA', 'Therapy', 'Other'];
const PRISMATIC_GLOW = "after:absolute after:inset-0 after:rounded-xl after:shadow-[0_0_15px_rgba(96,165,250,0.4)] after:animate-pulse";

// ============================================================================
// COMPONENTS
// ============================================================================

const ViewSwitcher: React.FC<{ viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }> = ({ viewMode, setViewMode }) => (
  <div className="flex items-center p-1 rounded-[16px] bg-slate-100/80 border border-slate-200/50">
    {([
      { mode: 'kanban', icon: Columns3, label: 'Pipeline' },
      { mode: 'ranking', icon: GripVertical, label: 'Specialty' },
      { mode: 'list', icon: List, label: 'List' }
    ] as const).map(({ mode, icon: Icon, label }) => (
      <button
        key={mode}
        onClick={() => setViewMode(mode as ViewMode)}
        className={cn(
          "px-4 py-2 text-[11px] font-bold rounded-[12px] transition-all flex items-center gap-2 active:scale-95",
          viewMode === mode
            ? "bg-white text-slate-900 shadow-sm border border-slate-200/40"
            : "text-slate-500 hover:text-slate-800"
        )}
      >
        <Icon size={14} strokeWidth={2.5} />
        <span className="uppercase tracking-widest">{label}</span>
      </button>
    ))}
  </div>
);

const ProspectCard: React.FC<{
  prospect: Prospect;
  onSelect: (p: Prospect) => void;
  onOpenEmail: (p: Prospect) => void;
  onOpenSMS: (p: Prospect) => void;
}> = ({ prospect, onSelect, onOpenEmail, onOpenSMS }) => {
  const isDiamond = prospect.is_diamond_verified;

  return (
    <motion.div
      layoutId={prospect.id.toString()}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={() => onSelect(prospect)}
      className={cn(
        "group relative bg-white p-5 rounded-[24px] border border-slate-200/60 hover:border-blue-500/30 hover:shadow-floating transition-all duration-300 cursor-pointer",
        isDiamond ? PRISMATIC_GLOW : ""
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2 h-2 rounded-full",
            prospect.status === 'New' ? 'bg-blue-500' :
              prospect.status === 'Contacted' ? 'bg-amber-500' :
                prospect.status === 'Interested' ? 'bg-emerald-500' : 'bg-slate-400'
          )} />
          <h4 className="font-bold text-slate-900 tracking-tight">{prospect.name}</h4>
        </div>
        {isDiamond && <Diamond size={14} className="text-blue-500 fill-blue-500/10" />}
      </div>

      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium">
          <User size={13} className="text-slate-400" />
          <span>{prospect.profession} • {prospect.specialty}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium">
          <MapPin size={13} className="text-slate-400" />
          <span>{prospect.home_state || 'Remote'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Updated {prospect.updated_at ? new Date(prospect.updated_at).toLocaleDateString() : 'Recently'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onOpenEmail(prospect); }}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
          >
            <Mail size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSMS(prospect); }}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
          >
            <MessageSquare size={15} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const ProspectsDashboard: React.FC = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | null>(null);

  // Modals
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [emailModalProspect, setEmailModalProspect] = useState<Prospect | null>(null);
  const [smsModalProspect, setSmsModalProspect] = useState<Prospect | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const cacheKey = 'prospects_list_cache';
    const cached = getCachedData<Prospect[]>(cacheKey);

    if (cached) {
      setProspects(cached);
      setIsStale(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const data = await circuitBreaker('prospects_query', async () => {
        return await retryWithBackoff(async () => {
          return await withTimeout((async () => {
            const { data, error } = await supabase
              .from('prospects')
              .select('*')
              .order('updated_at', { ascending: false });

            if (error) throw error;
            return (data as Prospect[]) || [];
          })(), 10000);
        });
      });

      const finalData = data || [];
      setProspects(finalData);
      setCachedData(cacheKey, finalData);
      setIsStale(false);
    } catch (err: any) {
      console.error('Error loading prospects:', err);
      if (cached) {
        setIsStale(true);
        showToast('Refresh failed. Showing offline data.', 'error');
      } else {
        showToast('Failed to load candidates', 'error');
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    return {
      total: prospects.length,
      new: prospects.filter(p => p.status === 'New').length,
      contacted: prospects.filter(p => p.status === 'Contacted').length,
      interested: prospects.filter(p => p.status === 'Interested').length,
      stalled: prospects.filter(p => {
        if (!p.updated_at) return false;
        const days = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        return days >= 3;
      }).length
    };
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    let filtered = prospects;
    if (statusFilter === 'Stalled') {
      filtered = filtered.filter(p => {
        if (!p.updated_at) return false;
        const days = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        return days >= 3;
      });
    } else if (statusFilter) {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.specialty.toLowerCase().includes(q) ||
        p.home_state?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [prospects, statusFilter, searchQuery]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <DashboardShell
      title="Candidate Pipeline"
      subtitle="Track and manage active recruitment funnels and candidate engagement."
      eyebrow="Talent"
      actions={
        <div className="flex items-center gap-4">
          <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-[14px] transition-all shadow-lift font-bold text-[13px] active:scale-95"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Add Candidate</span>
          </button>
        </div>
      }
    >
      <div className="space-y-8 animate-fadeIn">
        {/* Statistics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="All Candidates"
            value={stats.total}
            isActive={!statusFilter}
            onClick={() => setStatusFilter(null)}
            icon={<User size={18} />}
            color="slate"
          />
          <StatCard
            label="Inquiry / New"
            value={stats.new}
            isActive={statusFilter === 'New'}
            onClick={() => setStatusFilter('New')}
            icon={<Zap size={18} />}
            color="blue"
          />
          <StatCard
            label="Engaged"
            value={stats.contacted}
            isActive={statusFilter === 'Contacted'}
            onClick={() => setStatusFilter('Contacted')}
            icon={<MessageSquare size={18} />}
            color="amber"
          />
          <StatCard
            label="Highly Interested"
            value={stats.interested}
            isActive={statusFilter === 'Interested'}
            onClick={() => setStatusFilter('Interested')}
            icon={<Heart size={18} />}
            color="emerald"
          />
          <StatCard
            label="Stalled"
            value={stats.stalled}
            isActive={statusFilter === 'Stalled'}
            onClick={() => setStatusFilter('Stalled')}
            icon={<Clock size={18} />}
            color="rose"
            subtitle="3+ days"
          />
        </div>

        {/* Global Search & Filter Results */}
        <div className="precision-glass rounded-[28px] p-5 flex items-center justify-between gap-4 shadow-lift border-white/20">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative group flex-1 max-w-md">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Search candidates, specialties, or locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-white/50 border border-slate-200/60 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 focus:bg-white transition-all text-[14px] font-medium tracking-tight shadow-sm"
              />
            </div>
            {statusFilter && (
              <Badge variant="accent" className="h-9 px-4 font-bold flex items-center gap-2 animate-scaleIn">
                Filter: {statusFilter}
                <button onClick={() => setStatusFilter(null)} className="hover:text-slate-900 ml-1"><X size={12} /></button>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter(null);
                loadData();
              }}
              className="text-[12px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-[0.12em] px-2 active:scale-95 flex items-center gap-2"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Clear & Reset
            </button>
            {isStale && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200 animate-pulse">
                <Clock size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Stale</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-full border border-rose-200">
                <AlertCircle size={12} />
                <button onClick={() => loadData()} className="text-[10px] font-bold uppercase tracking-wider underline">Retry Refresh</button>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Viewport */}
        <div className="relative min-h-[600px] bg-slate-50/50 rounded-[32px] border border-slate-200/50 p-8">
          <AnimatePresence mode="wait">
            {viewMode === 'kanban' ? (
              <div key="kanban" className="flex gap-6 overflow-x-auto pb-6 scrollbar-thin">
                {PROSPECT_STATUS.map(status => (
                  <div key={status} className="flex-shrink-0 w-80">
                    <div className="flex items-center justify-between mb-6 px-1">
                      <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        {status}
                        <span className="text-slate-400 font-medium">({filteredProspects.filter(p => p.status === status).length})</span>
                      </h3>
                    </div>
                    <div className="space-y-5">
                      {filteredProspects.filter(p => p.status === status).map(prospect => (
                        <ProspectCard
                          key={prospect.id}
                          prospect={prospect}
                          onSelect={setSelectedProspect}
                          onOpenEmail={setEmailModalProspect}
                          onOpenSMS={setSmsModalProspect}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div key="list" className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden min-h-[500px]">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-[#F9F9FB]">
                    <tr>
                      <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Candidate</th>
                      <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Specialty</th>
                      <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Location</th>
                      <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProspects.map(p => (
                      <tr key={p.id} onClick={() => setSelectedProspect(p)} className="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-[12px]">
                              {p.name.charAt(0)}
                            </div>
                            <span className="font-bold text-slate-900">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-[13px] text-slate-600 font-medium">{p.profession} • {p.specialty}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              p.status === 'New' ? 'bg-blue-500' :
                                p.status === 'Contacted' ? 'bg-amber-500' :
                                  p.status === 'Interested' ? 'bg-emerald-500' : 'bg-slate-400'
                            )} />
                            <span className="text-[13px] font-semibold text-slate-700">{p.status}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-[13px] text-slate-600">{p.home_state || '—'}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEmailModalProspect(p); }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            >
                              <Mail size={15} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSmsModalProspect(p); }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            >
                              <MessageSquare size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modals & Portals */}
      {isAddModalOpen && (
        <AddProspectModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={async (d) => {
            const { error } = await supabase.from('prospects').insert([d]);
            if (!error) { setIsAddModalOpen(false); loadData(); showToast('Prospect added', 'success'); }
          }}
          showToast={showToast}
        />
      )}

      {selectedProspect && (
        <EditProspectModal
          prospect={selectedProspect as any}
          onClose={() => setSelectedProspect(null)}
          onUpdate={() => { loadData(); setSelectedProspect(null); showToast('Updated', 'success'); }}
          showToastNotification={showToast}
        />
      )}

      {emailModalProspect && (
        <EmailTemplateModal
          isOpen={true}
          prospect={emailModalProspect as any}
          extractedData={emailModalProspect.template_extracted_data}
          onClose={() => setEmailModalProspect(null)}
          onSend={async () => {
            if (emailModalProspect.status === 'New') {
              await supabase.from('prospects').update({ status: 'Contacted' }).eq('id', emailModalProspect.id);
              loadData();
            }
            setEmailModalProspect(null);
            showToast('Email sent', 'success');
          }}
          showToastNotification={showToast}
        />
      )}

      {smsModalProspect && (
        <SMSModal
          isOpen={!!smsModalProspect}
          onClose={() => setSmsModalProspect(null)}
          candidateName={smsModalProspect.name}
          candidatePhone={smsModalProspect.phone || ''}
          onSend={() => { setSmsModalProspect(null); showToast('SMS Sent', 'success'); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slideIn">
          <div className={cn(
            'px-6 py-4 rounded-[20px] shadow-floating backdrop-blur-md border border-white/20 text-[14px] font-bold flex items-center gap-3',
            toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
          )}>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            </div>
            {toast.message}
          </div>
        </div>
      )}
    </DashboardShell>
  );
};

export default ProspectsDashboard;