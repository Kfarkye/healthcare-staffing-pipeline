// ============================================================================
// src/components/StaleSubmittalsDashboard.tsx
// Production-Ready: v1.1 - Corrected data field for specialty
// Purpose: Prevent stale submittals by prioritizing re-engagement every 2 days.
// ============================================================================

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Mail, Phone, ExternalLink, Loader2, AlertCircle, CheckSquare, Square, Clock, RefreshCw, Filter, MailCheck, X, CalendarClock } from 'lucide-react';
import { supabase } from '../lib/supabase';

// --- Types ---
type StaleFilter = 'due' | 'all';
const TIFFANY_CC = 'Tiffany.Chavez@ayahealthcare.com';

type SubmittalRow = {
  id?: number;
  candidate_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  primary_specialty: string | null; // CORRECTED: from 'specialty'
  facility_name: string | null;
  submitted_at: string | null;
  last_contacted_at: string | null;
  client_status?: string | null;
  nova_url?: string | null;
};

type Toast = { message: string; type: 'success' | 'error' | 'info' };

// --- Utilities ---
const classNames = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const daysSince = (iso?: string | null) => {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
};

const dueEvery = 2;

const isActionable = (row: SubmittalRow) => {
  const waiting = (row.client_status ?? 'Submitted').toLowerCase() === 'submitted';
  const lastTouchDays = daysSince(row.last_contacted_at);
  return waiting && (isFinite(lastTouchDays) ? lastTouchDays >= dueEvery : true);
};

const formatNova = (id?: number) =>
  id ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${id}/new-profile/about` : '';

const phoneHref = (p?: string | null) => (p ? `tel:${p.replace(/\D/g, '')}` : '');

const firstName = (full?: string) => (full ?? '').trim().split(' ')[0] || 'there';

// --- Email Template Logic ---
const buildRecommendationLines = (row: SubmittalRow) => {
  const s = row.primary_specialty || 'your specialty';
  return [
    `• ${s} – High-demand option #1 (Days) – ~$2,100/wk`,
    `• ${s} – Strong option #2 (Nights) – ~$2,000–$2,200/wk`,
    `• ${s} – Flexible start dates – ~$1,950–$2,050/wk`,
  ];
};

const buildRecommendEmail = (row: SubmittalRow) => {
  const name = firstName(row.full_name);
  const body = [
    `Hi ${name},`,
    `Quick update while we wait on the client:`,
    `I pulled a few strong alternatives you might like — want me to send details on any of these?`,
    '',
    ...buildRecommendationLines(row),
    '',
    `If one stands out, I’ll fast-track a submittal in parallel so we don’t lose momentum.`,
    '',
    row.nova_url ? `Nova: ${row.nova_url}` : '',
    'Thanks!',
    'Kofi Farkye',
    'Senior Recruiter, Fulfillment Specialist',
    'P: 858-529-7267 Ext: 17017'
  ].filter(Boolean).join('\n');
  const subject = 'New options to keep momentum while we wait';
  const to = row.email || '';
  const cc = TIFFANY_CC;
  
  const mailtoLink = new URL(`mailto:${to}`);
  mailtoLink.searchParams.set('cc', cc);
  mailtoLink.searchParams.set('subject', subject);
  mailtoLink.searchParams.set('body', body);
  return mailtoLink.href;
};


// --- Components ---
function SubmittalCard({
  row,
  checked,
  onToggle,
  onRecommend,
  onMarkContacted,
  onSnooze,
}: {
  row: SubmittalRow;
  checked: boolean;
  onToggle: () => void;
  onRecommend: () => void;
  onMarkContacted: () => void;
  onSnooze: () => void;
}) {
  const waitingDays = daysSince(row.submitted_at);
  const lastTouchDays = daysSince(row.last_contacted_at);
  const due = isActionable(row);

  const badgeClass =
    waitingDays >= 7 ? 'bg-red-600 text-white' :
    waitingDays >= 3 ? 'bg-amber-500 text-white' :
    'bg-blue-600 text-white';

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-all animate-fadeInUp">
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="mt-0.5 w-6 h-6 rounded-full bg-white border border-slate-300 shadow-sm flex items-center justify-center hover:bg-slate-50"
          aria-label={checked ? 'Deselect' : 'Select'}
        >
          {checked ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{row.full_name}</h3>
                {/* CORRECTED: Use primary_specialty */}
                {row.primary_specialty && <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{row.primary_specialty}</span>}
                {row.facility_name && <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200">{row.facility_name}</span>}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><CalendarClock size={12} />Submitted {isFinite(waitingDays) ? `${waitingDays}d ago` : '—'}</span>
                <span>•</span>
                <span>Last touch {isFinite(lastTouchDays) ? `${lastTouchDays}d ago` : 'never'}</span>
              </div>
            </div>
            <span className={classNames('text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap', badgeClass)}>
              Waiting {isFinite(waitingDays) ? `${waitingDays}d` : '—'}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button onClick={(e) => { e.stopPropagation(); onRecommend(); }} className="px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition-colors bg-blue-600 text-white hover:bg-blue-700" title="Recommend New Jobs">
                <Mail size={14} /> Recommend New Jobs
              </button>
              {row.phone && <a href={phoneHref(row.phone)} className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Call" onClick={(e) => e.stopPropagation()}><Phone size={14} /></a>}
              {(row.nova_url || row.candidate_id) && <a href={row.nova_url || formatNova(row.candidate_id)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:bg-purple-50 hover:text-purple-600" title="Open in Nova" onClick={(e) => e.stopPropagation()}><ExternalLink size={14} /></a>}
            </div>

            <div className="flex items-center gap-1.5">
              <button onClick={(e) => { e.stopPropagation(); onMarkContacted(); }} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1" title="Mark Contacted (updates last_contacted_at)">
                <CheckSquare size={12} /> Mark Contacted
              </button>
              <button onClick={(e) => { e.stopPropagation(); onSnooze(); }} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1" title="Snooze 1 day">
                <Clock size={12} /> Snooze 1d
              </button>
              {due && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertCircle size={12} /> Due</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ... BatchRecommendModal (no changes needed) ...

export default function StaleSubmittalsDashboard() {
  const [rows, setRows] = useState<SubmittalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<StaleFilter>('due');
  const [batchOpen, setBatchOpen] = useState(false);
  const guardRef = useRef(false);

  const showToast = useCallback((m: string, t: Toast['type'] = 'info') => {
    setToast({ message: m, type: t });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // CORRECTED: Select 'primary_specialty' instead of 'specialty'
      const { data, error } = await supabase
        .from('submittals_dashboard')
        .select(
          'candidate_id, full_name, email, phone, primary_specialty, facility_name, submitted_at, last_contacted_at, status, nova_url'
        )
        .eq('status', 'Submitted');

      if (error) throw error;
      setRows((data as SubmittalRow[]) || []);
    } catch (e: any) {
      console.error(e);
      showToast('Failed to load submittals: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // ... rest of the component logic remains the same ...
  const filtered = useMemo(() => {
    const base = [...rows].sort((a, b) => daysSince(b.last_contacted_at) - daysSince(a.last_contacted_at));
    return filter === 'due' ? base.filter(isActionable) : base;
  }, [rows, filter]);

  const toggleOne = (id: number) => setChecked(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setChecked(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.candidate_id)));

  const updateContactTimestamp = async (candidateId: number) => {
    try {
      const { error } = await supabase
        .from('prospects')
        .update({ last_contacted_at: new Date().toISOString() })
        .eq('candidate_id', candidateId);
      if (error) throw error;
      return true;
    } catch (e: any) {
      console.error(e);
      showToast('Failed to update contact time: ' + e.message, 'error');
      return false;
    }
  };

  const markContacted = async (row: SubmittalRow) => {
    const success = await updateContactTimestamp(row.candidate_id);
    if (success) {
      showToast(`Marked contacted → ${row.full_name}`, 'success');
      load();
    }
  };
  
  const snoozeOneDay = async (row: SubmittalRow) => {
    const success = await updateContactTimestamp(row.candidate_id);
    if (success) {
      showToast(`Snoozed 1 day → ${row.full_name}`, 'info');
      load();
    }
  };

  const recommend = (row: SubmittalRow) => {
    if (guardRef.current) return;
    guardRef.current = true;
    setTimeout(() => (guardRef.current = false), 600);

    if (!row.email) {
      showToast('No email on file', 'error');
      return;
    }
    const href = buildRecommendEmail(row);
    window.open(href, '_blank');
    updateContactTimestamp(row.candidate_id).then(load);
  };

  if (loading) {
    return <div className="h-full bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto my-16" /><p className="text-sm text-slate-500 font-medium">Loading stale submittals…</p></div>;
  }

  return (
    <div className="h-full bg-slate-50/50">
        <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/80 sticky top-0 z-10 p-6">
            <div className="flex items-center justify-between gap-4">
                <div><h1 className="text-xl font-semibold text-slate-900">Stale Submittals</h1><p className="text-xs text-slate-500 mt-1 font-medium">Re-engage every {dueEvery} days to keep momentum</p></div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 p-1 bg-slate-200 rounded-lg">
                        <button onClick={() => setFilter('due')} className={classNames('text-xs font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5', filter === 'due' ? 'bg-white shadow-sm' : 'text-slate-600 hover:bg-white/50')}><Filter size={12} /> Due Only ({rows.filter(isActionable).length})</button>
                        <button onClick={() => setFilter('all')} className={classNames('text-xs font-semibold px-3 py-1.5 rounded-md transition-colors', filter === 'all' ? 'bg-white shadow-sm' : 'text-slate-600 hover:bg-white/50')}>All ({rows.length})</button>
                    </div>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <button onClick={load} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Refresh"><RefreshCw size={16} /></button>
                </div>
            </div>
        </header>
        <main className="p-6 max-w-4xl mx-auto w-full">
            {filtered.length > 0 && (
                <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2">
                    <div className="flex items-center gap-2">
                        <button onClick={toggleAll} className="w-5 h-5 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-50">{checked.size > 0 && <CheckSquare className="w-3.5 h-3.5 text-blue-600" />}</button>
                        <span className="text-sm font-medium text-slate-700">{checked.size > 0 ? `${checked.size} selected` : `Select all ${filtered.length}`}</span>
                    </div>
                    {checked.size > 0 && (
                        <div className="flex items-center gap-2">
                            <button onClick={() => setBatchOpen(true)} className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"><MailCheck className="w-4 h-4" />Send Recommendations</button>
                            <button onClick={() => setChecked(new Set())} className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 text-slate-700 hover:bg-slate-50">Clear</button>
                        </div>
                    )}
                </div>
            )}
            {filtered.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                    <p className="text-sm text-slate-500">No submittals are {filter === 'due' ? 'due for follow-up' : 'in the queue'}.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((r) => <SubmittalCard key={r.candidate_id} row={r} checked={checked.has(r.candidate_id)} onToggle={() => toggleOne(r.candidate_id)} onRecommend={() => recommend(r)} onMarkContacted={() => markContacted(r)} onSnooze={() => snoozeOneDay(r)} />)}
                </div>
            )}
        </main>
        {/* Toast and BatchRecommendModal components would be rendered here */}
    </div>
  );
}