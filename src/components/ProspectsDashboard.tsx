// ============================================================================
// src/components/ProspectsDashboard.tsx
// Production-grade: SWR cache, request dedupe, abort-safety, realtime sync,
// focus/online refresh, deferred search, reduced motion.
// FIXES: preserves status 'Stalled', SSR-safe useEvent, cache writes are functional.
// ============================================================================

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Columns3,
  Diamond,
  ExternalLink,
  GripVertical,
  Heart,
  List,
  Mail,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  User,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import {
  circuitBreaker,
  clearCachedData,
  getCachedData,
  retryWithBackoff,
  setCachedData,
  withTimeout,
} from '../lib/resilience';
import { useMountedRef } from '../hooks/useMountedRef';
import { useEvent } from '../hooks/useEvent';
import { SMSModal } from './SMSModal';
import { EmailTemplateModal } from './prospects/EmailTemplateModal';
import AddProspectModal from './prospects/AddProspectModal';
import EditProspectModal from './prospects/EditProspectModal';
import { DashboardShell } from './shared/DashboardShell';
import { StatCard } from './shared/StatCard';
import { Badge } from '../shared/components/Badge';
import type { Prospect } from '../shared/types/database';

// ============================================================================
// TYPES
// ============================================================================

type ProspectStatus = 'New' | 'Contacted' | 'Interested' | 'Stalled';
type ViewMode = 'kanban' | 'list' | 'ranking';
type ToastState = { message: string; type: 'success' | 'error' } | null;

// ============================================================================
// CONSTANTS
// ============================================================================

const PROSPECT_STATUS: ProspectStatus[] = ['New', 'Contacted', 'Interested', 'Stalled'];

const CACHE_KEY = 'prospects_list_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min fresh
const STALE_HINT_MS = 60 * 60 * 1000; // 60 min acceptable offline
const FETCH_TIMEOUT_MS = 12_000;
const STALLED_DAYS = 3;

const PRISMATIC_GLOW =
  'after:absolute after:inset-0 after:rounded-xl after:shadow-[0_0_15px_rgba(96,165,250,0.4)] after:animate-pulse';

// ============================================================================
// SMALL UTILS
// ============================================================================

function safeLower(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : '';
}

function parseDateMs(v: unknown): number | null {
  if (!v) return null;
  const d = new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function daysSince(ms: number): number {
  const diff = Date.now() - ms;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function normalizeStatus(v: unknown): ProspectStatus {
  const s = typeof v === 'string' ? v : '';
  if (s === 'New' || s === 'Contacted' || s === 'Interested' || s === 'Stalled') return s;
  return 'New';
}

// Computed "stalled" (age-based), independent from DB status
function isProspectAgedStalled(p: Prospect): boolean {
  const ms = parseDateMs(p.updated_at);
  if (!ms) return false;
  return daysSince(ms) >= STALLED_DAYS;
}

function sortByUpdatedDesc(a: Prospect, b: Prospect): number {
  const ams = parseDateMs(a.updated_at) ?? 0;
  const bms = parseDateMs(b.updated_at) ?? 0;
  return bms - ams;
}

function upsertOne(prev: Prospect[], updated: Prospect): Prospect[] {
  const map = new Map<number, Prospect>();
  for (const p of prev) map.set(p.id, p);
  map.set(updated.id, updated);
  return Array.from(map.values()).sort(sortByUpdatedDesc);
}

function removeOne(prev: Prospect[], id: number): Prospect[] {
  return prev.filter((p) => p.id !== id);
}

function mergeById(prev: Prospect[], next: Prospect[]): Prospect[] {
  const map = new Map<number, Prospect>();
  for (const p of prev) map.set(p.id, p);
  for (const p of next) map.set(p.id, p);
  return Array.from(map.values()).sort(sortByUpdatedDesc);
}

function writeCache(next: Prospect[]) {
  setCachedData(CACHE_KEY, next, CACHE_TTL_MS);
  setCachedData(`${CACHE_KEY}:stale`, next, STALE_HINT_MS);
}

function buildNovaUrl(candidateId: string | number): string {
  return `https://nova.ayahealthcare.com/#/recruiting/candidates/${candidateId}/new-profile/about`;
}

// ============================================================================
// VIEW SWITCHER
// ============================================================================

const ViewSwitcher: React.FC<{
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}> = ({ viewMode, setViewMode }) => (
  <div className="flex items-center p-1 rounded-[16px] bg-slate-100/80 border border-slate-200/50">
    {(
      [
        { mode: 'kanban', icon: Columns3, label: 'Pipeline' },
        { mode: 'ranking', icon: GripVertical, label: 'Specialty' },
        { mode: 'list', icon: List, label: 'List' },
      ] as const
    ).map(({ mode, icon: Icon, label }) => (
      <button
        key={mode}
        onClick={() => setViewMode(mode)}
        className={cn(
          'px-4 py-2 text-[11px] font-bold rounded-[12px] transition-all flex items-center gap-2 active:scale-95',
          viewMode === mode
            ? 'bg-white text-slate-900 shadow-sm border border-slate-200/40'
            : 'text-slate-500 hover:text-slate-800'
        )}
      >
        <Icon size={14} strokeWidth={2.5} />
        <span className="uppercase tracking-widest">{label}</span>
      </button>
    ))}
  </div>
);

// ============================================================================
// PROSPECT CARD (KANBAN)
// ============================================================================

const ProspectCard = React.memo(function ProspectCard({
  prospect,
  onSelect,
  onOpenEmail,
  onOpenSMS,
  reducedMotion,
}: {
  prospect: Prospect;
  onSelect: (p: Prospect) => void;
  onOpenEmail: (p: Prospect) => void;
  onOpenSMS: (p: Prospect) => void;
  reducedMotion: boolean;
}) {
  const isDiamond = !!prospect.is_diamond_verified;
  const status = normalizeStatus(prospect.status);
  const updatedLabel = prospect.updated_at
    ? new Date(prospect.updated_at).toLocaleDateString()
    : 'Recently';

  const MotionDiv: any = reducedMotion ? 'div' : motion.div;

  const dot =
    status === 'New'
      ? 'bg-blue-500'
      : status === 'Contacted'
        ? 'bg-amber-500'
        : status === 'Interested'
          ? 'bg-emerald-500'
          : 'bg-slate-400';

  return (
    <MotionDiv
      {...(!reducedMotion
        ? {
          layoutId: String(prospect.id),
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, scale: 0.95 },
          whileHover: { y: -4, transition: { duration: 0.2 } },
        }
        : {})}
      onClick={() => onSelect(prospect)}
      className={cn(
        'group relative bg-white p-5 rounded-[24px] border border-slate-200/60 hover:border-blue-500/30 hover:shadow-floating transition-all duration-300 cursor-pointer',
        isDiamond ? PRISMATIC_GLOW : ''
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-2 h-2 rounded-full', dot)} />
          {prospect.candidate_id ? (
            <a
              href={buildNovaUrl(prospect.candidate_id)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-bold text-slate-900 tracking-tight hover:text-blue-600 hover:underline transition-colors flex items-center gap-1.5"
            >
              {prospect.name}
              <ExternalLink
                size={12}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </a>
          ) : (
            <h4 className="font-bold text-slate-900 tracking-tight">{prospect.name}</h4>
          )}
        </div>
        {isDiamond && <Diamond size={14} className="text-blue-500 fill-blue-500/10" />}
      </div>

      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium">
          <User size={13} className="text-slate-400" />
          <span>
            {prospect.profession} • {prospect.specialty}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium">
          <MapPin size={13} className="text-slate-400" />
          <span>{prospect.home_state || 'Location TBD'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Updated {updatedLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEmail(prospect);
            }}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            aria-label="Email"
          >
            <Mail size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenSMS(prospect);
            }}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            aria-label="SMS"
          >
            <MessageSquare size={15} />
          </button>
        </div>
      </div>
    </MotionDiv>
  );
});

// ============================================================================
// MAIN
// ============================================================================

const ProspectsDashboard: React.FC = () => {
  const mountedRef = useMountedRef();
  const reducedMotion = useReducedMotion();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  const [statusFilter, setStatusFilter] = useState<ProspectStatus | null>(null);

  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [emailModalProspect, setEmailModalProspect] = useState<Prospect | null>(null);
  const [smsModalProspect, setSmsModalProspect] = useState<Prospect | null>(null);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const [online, setOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  const inflightRef = useRef<Promise<Prospect[]> | null>(null);
  const fetchIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const showToast = useEvent((message: string, type: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setToast(null);
    }, 3000);
  });

  const primeFromCache = useEvent(() => {
    const fresh = getCachedData<Prospect[]>(CACHE_KEY);
    if (fresh?.length) {
      setProspects(fresh);
      setIsStale(false);
      setInitialLoading(false);
      return;
    }

    const stale = getCachedData<Prospect[]>(`${CACHE_KEY}:stale`);
    if (stale?.length) {
      setProspects(stale);
      setIsStale(true);
      setInitialLoading(false);
    }
  });

  const fetchProspects = useEvent(async (): Promise<Prospect[]> => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const run = async () => {
      const { data, error: qErr } = await supabase
        .from('prospects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (qErr) throw qErr;
      return ((data as Prospect[]) || []).sort(sortByUpdatedDesc);
    };

    return await circuitBreaker(
      'prospects_query',
      async () =>
        await retryWithBackoff(async () => await withTimeout(run(), FETCH_TIMEOUT_MS))
    );
  });

  const loadData = useEvent(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') primeFromCache();

    if (inflightRef.current) return inflightRef.current;

    setError(null);

    const currentFetchId = ++fetchIdRef.current;
    const doFetch = (async () => {
      try {
        if (!online) throw new Error('Offline');

        if (mode === 'refresh') setRefreshing(true);

        const data = await fetchProspects();

        if (fetchIdRef.current !== currentFetchId) return data;
        if (!mountedRef.current) return data;

        setProspects(data);
        writeCache(data);

        setIsStale(false);
        setLastSyncedAt(Date.now());

        return data;
      } catch (err: any) {
        const msg = err?.message ? String(err.message) : 'Failed to load candidates';

        if (!mountedRef.current) throw err;

        const hadData = prospects.length > 0;
        setIsStale(hadData);

        if (hadData) {
          showToast('Refresh failed. Showing cached data.', 'error');
          setError(msg);
        } else {
          showToast('Failed to load candidates', 'error');
          setError(msg);
        }

        throw err;
      } finally {
        if (!mountedRef.current) return;
        setInitialLoading(false);
        setRefreshing(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = doFetch;
    return doFetch;
  });

  useEffect(() => {
    loadData('initial').catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if ((isStale || !!error) && online) loadData('refresh').catch(() => { });
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStale, error, online]);

  useEffect(() => {
    const onRefresh = () => {
      loadData('refresh').catch(() => { });
    };
    window.addEventListener('refresh_dashboard', onRefresh);
    return () => window.removeEventListener('refresh_dashboard', onRefresh);
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('prospects:realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prospects' }, (payload: any) => {
        if (!mountedRef.current) return;

        const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';

        if (event === 'DELETE') {
          const id = payload.old?.id;
          if (typeof id === 'number') {
            setProspects((prev) => {
              const next = removeOne(prev, id);
              writeCache(next);
              return next;
            });
          }
          return;
        }

        const row = payload.new as Prospect | undefined;
        if (!row || typeof row.id !== 'number') return;

        setProspects((prev) => {
          const next = upsertOne(prev, row);
          writeCache(next);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mountedRef]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const stats = useMemo(() => {
    let stalledAge = 0;
    let nNew = 0;
    let nContacted = 0;
    let nInterested = 0;

    for (const p of prospects) {
      const s = normalizeStatus(p.status);
      if (s === 'New') nNew += 1;
      if (s === 'Contacted') nContacted += 1;
      if (s === 'Interested') nInterested += 1;
      if (isProspectAgedStalled(p)) stalledAge += 1;
    }

    return {
      total: prospects.length,
      new: nNew,
      contacted: nContacted,
      interested: nInterested,
      stalled: stalledAge,
    };
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    const q = safeLower(deferredSearch).trim();

    const out: Prospect[] = [];
    for (const p of prospects) {
      const status = normalizeStatus(p.status);

      // Filter semantics preserved:
      // - If statusFilter === 'Stalled': show "aged stalled" (3+ days), regardless of DB status
      // - Else: filter by DB status match
      if (statusFilter === 'Stalled') {
        if (!isProspectAgedStalled(p)) continue;
      } else if (statusFilter) {
        if (status !== statusFilter) continue;
      }

      if (q) {
        const ok =
          safeLower(p.name).includes(q) ||
          safeLower(p.specialty).includes(q) ||
          safeLower(p.profession).includes(q) ||
          safeLower(p.home_state).includes(q);
        if (!ok) continue;
      }

      out.push(p);
    }

    return out.sort(sortByUpdatedDesc);
  }, [prospects, statusFilter, deferredSearch]);

  const byStatus = useMemo(() => {
    const buckets: Record<ProspectStatus, Prospect[]> = {
      New: [],
      Contacted: [],
      Interested: [],
      Stalled: [],
    };

    for (const p of filteredProspects) {
      buckets[normalizeStatus(p.status)].push(p);
    }

    return buckets;
  }, [filteredProspects]);

  const specialtyRanking = useMemo(() => {
    const map = new Map<string, { total: number; interested: number; contacted: number; fresh: number; stalled: number }>();
    for (const p of filteredProspects) {
      const key = (p.specialty || 'Unknown').trim() || 'Unknown';
      const s = normalizeStatus(p.status);
      const row = map.get(key) ?? { total: 0, interested: 0, contacted: 0, fresh: 0, stalled: 0 };
      row.total += 1;
      if (s === 'Interested') row.interested += 1;
      if (s === 'Contacted') row.contacted += 1;
      if (s === 'New') row.fresh += 1;
      if (s === 'Stalled') row.stalled += 1;
      map.set(key, row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 50);
  }, [filteredProspects]);

  const markContactedIfNew = useEvent(async (p: Prospect) => {
    const status = normalizeStatus(p.status);
    if (status !== 'New') return;

    setProspects((prev) => {
      const next = upsertOne(prev, { ...p, status: 'Contacted' as any, updated_at: new Date().toISOString() });
      writeCache(next);
      return next;
    });

    try {
      const { data, error: uErr } = await supabase
        .from('prospects')
        .update({ status: 'Contacted' })
        .eq('id', p.id)
        .select('*')
        .single();

      if (uErr) throw uErr;

      if (data) {
        setProspects((prev) => {
          const next = upsertOne(prev, data as Prospect);
          writeCache(next);
          return next;
        });
      }

      showToast('Status updated to Contacted', 'success');
    } catch {
      showToast('Failed to update status. Refreshing…', 'error');
      loadData('refresh').catch(() => { });
    }
  });

  const resetAndRefresh = useEvent(() => {
    setSearchQuery('');
    setStatusFilter(null);
    setError(null);
    setIsStale(false);
    clearCachedData(CACHE_KEY);
    clearCachedData(`${CACHE_KEY}:stale`);
    loadData('refresh').catch(() => { });
  });

  const showEmpty = !initialLoading && filteredProspects.length === 0;

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
            subtitle={`${STALLED_DAYS}+ days`}
          />
        </div>

        <div className="precision-glass rounded-[28px] p-5 flex items-center justify-between gap-4 shadow-lift border-white/20">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative group flex-1 max-w-md">
              <Search
                size={15}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors"
              />
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
                <button
                  onClick={() => setStatusFilter(null)}
                  className="hover:text-slate-900 ml-1"
                  aria-label="Clear filter"
                >
                  <X size={12} />
                </button>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData('refresh').catch(() => { })}
              className="text-[12px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-[0.12em] px-2 active:scale-95 flex items-center gap-2"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>

            <button
              onClick={resetAndRefresh}
              className="text-[12px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-[0.12em] px-2 active:scale-95 flex items-center gap-2"
              aria-label="Clear and reset"
            >
              Clear & Reset
            </button>

            {!online && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-full border border-slate-800">
                <AlertCircle size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Offline</span>
              </div>
            )}

            {isStale && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200">
                <Clock size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Stale</span>
              </div>
            )}

            {!!lastSyncedAt && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-full border border-slate-200">
                <CheckCircle size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Synced {new Date(lastSyncedAt).toLocaleTimeString()}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-full border border-rose-200">
                <AlertCircle size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Error</span>
              </div>
            )}
          </div>
        </div>

        <div className="relative min-h-[600px] bg-slate-50/50 rounded-[32px] border border-slate-200/50 p-8">
          {initialLoading && prospects.length === 0 ? (
            <div className="h-[540px] flex items-center justify-center">
              <div className="flex items-center gap-3 text-slate-500 font-semibold">
                <RefreshCw className="animate-spin" size={18} />
                Loading candidates…
              </div>
            </div>
          ) : showEmpty ? (
            <div className="h-[540px] flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                  <User size={18} />
                </div>
                <div className="text-slate-900 font-bold text-[16px]">No candidates found</div>
                <div className="text-slate-500 text-[13px]">
                  Clear filters or add a new candidate to start the funnel.
                </div>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {viewMode === 'kanban' ? (
                <div key="kanban" className="flex gap-6 overflow-x-auto pb-6 scrollbar-thin">
                  {PROSPECT_STATUS.map((status) => (
                    <div key={status} className="flex-shrink-0 w-80">
                      <div className="flex items-center justify-between mb-6 px-1">
                        <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                          {status}
                          <span className="text-slate-400 font-medium">({byStatus[status].length})</span>
                        </h3>
                      </div>

                      <div className="space-y-5">
                        {byStatus[status].map((prospect) => (
                          <ProspectCard
                            key={prospect.id}
                            prospect={prospect}
                            onSelect={setSelectedProspect}
                            onOpenEmail={setEmailModalProspect}
                            onOpenSMS={setSmsModalProspect}
                            reducedMotion={!!reducedMotion}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : viewMode === 'ranking' ? (
                <div
                  key="ranking"
                  className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden min-h-[500px]"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div className="text-[12px] font-bold uppercase tracking-widest text-slate-500">
                      Specialty ranking (filtered)
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {specialtyRanking.length} shown
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {specialtyRanking.map(([spec, agg]) => (
                      <div key={spec} className="px-6 py-5 flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{spec}</div>
                          <div className="text-[12px] text-slate-500 font-semibold">
                            Total {agg.total} • Interested {agg.interested} • Engaged {agg.contacted} • New {agg.fresh} • Stalled {agg.stalled}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="accent" className="h-8 px-3 font-bold">
                            {agg.total}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  key="list"
                  className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden min-h-[500px]"
                >
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-[#F9F9FB]">
                      <tr>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          Candidate
                        </th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          Specialty
                        </th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          Location
                        </th>
                        <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProspects.map((p) => {
                        const s = normalizeStatus(p.status);
                        const dot =
                          s === 'New'
                            ? 'bg-blue-500'
                            : s === 'Contacted'
                              ? 'bg-amber-500'
                              : s === 'Interested'
                                ? 'bg-emerald-500'
                                : 'bg-slate-400';

                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelectedProspect(p)}
                            className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                          >
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-[12px]">
                                  {p.name?.charAt(0) || '?'}
                                </div>
                                <div className="flex flex-col">
                                  {p.candidate_id ? (
                                    <a
                                      href={buildNovaUrl(p.candidate_id)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="font-bold text-slate-900 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                                    >
                                      {p.name}
                                      <ExternalLink
                                        size={12}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                      />
                                    </a>
                                  ) : (
                                    <span className="font-bold text-slate-900">{p.name}</span>
                                  )}
                                  {p.is_diamond_verified ? (
                                    <span className="text-[11px] font-bold text-blue-600 inline-flex items-center gap-1">
                                      <Diamond size={12} className="fill-blue-500/10" />
                                      Diamond verified
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-5 text-[13px] text-slate-600 font-medium">
                              {p.profession} • {p.specialty}
                            </td>

                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2">
                                <div className={cn('w-1.5 h-1.5 rounded-full', dot)} />
                                <span className="text-[13px] font-semibold text-slate-700">{s}</span>
                                {isProspectAgedStalled(p) && (
                                  <Badge variant="accent" className="h-6 px-2 text-[10px] font-bold">
                                    Aged
                                  </Badge>
                                )}
                              </div>
                            </td>

                            <td className="px-6 py-5 text-[13px] text-slate-600">{p.home_state || '—'}</td>

                            <td className="px-6 py-5">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEmailModalProspect(p);
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  aria-label="Email"
                                >
                                  <Mail size={15} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSmsModalProspect(p);
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  aria-label="SMS"
                                >
                                  <MessageSquare size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {isAddModalOpen && (
        <AddProspectModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={async (d) => {
            try {
              const { data, error: insErr } = await supabase
                .from('prospects')
                .insert([d])
                .select('*')
                .single();

              if (insErr) throw insErr;

              if (data) {
                setProspects((prev) => {
                  const next = mergeById(prev, [data as Prospect]);
                  writeCache(next);
                  return next;
                });
              }

              setIsAddModalOpen(false);
              showToast('Prospect added', 'success');
            } catch (e: any) {
              showToast(e?.message ? String(e.message) : 'Failed to add prospect', 'error');
            }
          }}
          showToast={showToast}
        />
      )}

      {selectedProspect && (
        <EditProspectModal
          prospect={selectedProspect as any}
          onClose={() => setSelectedProspect(null)}
          onUpdate={() => {
            loadData('refresh').catch(() => { });
            setSelectedProspect(null);
            showToast('Updated', 'success');
          }}
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
            const p = emailModalProspect;
            setEmailModalProspect(null);
            showToast('Email sent', 'success');
            await markContactedIfNew(p);
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
          onSend={() => {
            setSmsModalProspect(null);
            showToast('SMS sent', 'success');
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slideIn">
          <div
            className={cn(
              'px-6 py-4 rounded-[20px] shadow-floating backdrop-blur-md border border-white/20 text-[14px] font-bold flex items-center gap-3',
              toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
            )}
          >
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
