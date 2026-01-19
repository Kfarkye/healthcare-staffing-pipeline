// ============================================================================
// src/components/OffersSignedPrestartDashboard.tsx
// PRODUCTION READY – Offers/Signed/Prestart Pipeline View
// READ: offers_signed_prestart_dashboard VIEW
// Design: Apple × Stripe × Vercel
// ============================================================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, X, Phone, Mail, ExternalLink, Calendar, MapPin, Briefcase, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn, formatPhoneLink, formatDate as utilFormatDate } from '../lib/utils';
import PageHeader from './layout/PageHeader';

// ============================================================================
// TYPES - Matching DATABASE VIEW
// ============================================================================

export type StageBucket = 'OFFER_EXTENDED' | 'SIGNED' | 'PRESTART';

export interface OfferRow {
  candidate_id: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  primary_specialty: string | null;
  home_state: string | null;
  licenses: string[] | null;
  engagement_id: number;
  facility_name: string | null;
  location_city: string | null;
  location_state: string | null;
  job_id: string | null;
  recruiter: string | null;
  stage: StageBucket;
  start_date: string | null;
  submitted_at: string | null;
  days_until_start: number | null;
  orientation_week_start: string | null;
  in_orientation_week: boolean;
  orientation_badge_label: string | null;
  stage_bucket: StageBucket;
  source_type: 'TRANSITIONING_CLINICIAN' | null;
  nova_url: string | null;
}

interface ColumnDefinition {
  id: StageBucket;
  label: string;
  color: string;
  description: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STAGE_COLUMNS: ColumnDefinition[] = [
  { id: 'OFFER_EXTENDED', label: 'Offer Extended', color: '#2563EB', description: 'Awaiting candidate acceptance' },
  { id: 'SIGNED', label: 'Signed', color: '#16A34A', description: 'Contract signed, preparing for start' },
  { id: 'PRESTART', label: 'Pre-Start', color: '#7C3AED', description: 'Within 7 days of start date' },
];

// ============================================================================
// UTILITIES
// ============================================================================

const formatNovaLink = (url: string | null) => url || '';

const formatDate = utilFormatDate;

const formatRelativeDate = (dateString: string | null): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Started';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `${diffDays} days`;
  return formatDate(dateString);
};

// ============================================================================
// OFFER CARD
// ============================================================================

const OfferCard: React.FC<{
  offer: OfferRow;
  onClick: () => void;
  index: number;
}> = ({ offer, onClick, index }) => {
  const openLink = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    window.open(url, '_blank', 'noopener');
  };

  const urgencyColor = offer.days_until_start !== null
    ? offer.days_until_start <= 3
      ? 'text-red-600 bg-red-50'
      : offer.days_until_start <= 7
        ? 'text-amber-600 bg-amber-50'
        : 'text-slate-600 bg-slate-50'
    : 'text-slate-600 bg-slate-50';

  return (
    <div
      onClick={onClick}
      className="relative bg-white rounded-xl border border-slate-200 p-4 cursor-pointer transition-all duration-200 group hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 animate-fadeInUp"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, opacity: 0 }}
    >
      <div className="space-y-3">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-[13px] font-semibold text-slate-900 truncate flex-1 pr-2 transition-colors duration-150 group-hover:text-blue-600 tracking-tight">
              {offer.full_name || 'Unknown Candidate'}
            </h3>
            {offer.in_orientation_week && offer.orientation_badge_label && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                <Clock size={10} />
                {offer.orientation_badge_label}
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {offer.primary_specialty || 'No specialty'}
          </p>
        </div>

        {/* Facility Info */}
        {(offer.facility_name || offer.location_city || offer.location_state) && (
          <div className="flex items-start gap-2 text-[11px] text-slate-600">
            <MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{offer.facility_name || '—'}</p>
              {(offer.location_city || offer.location_state) && (
                <p className="text-slate-500">
                  {[offer.location_city, offer.location_state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Start Date */}
        {offer.start_date && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-[11px]">
              <Calendar size={12} className="text-slate-400" />
              <span className="text-slate-600">Start:</span>
              <span className="font-medium text-slate-900">{formatDate(offer.start_date)}</span>
            </div>
            {offer.days_until_start !== null && (
              <div className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums', urgencyColor)}>
                {offer.days_until_start <= 0 ? 'Started' : `${offer.days_until_start}d`}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 pt-2 border-t border-slate-100">
          {offer.phone && (
            <button
              onClick={e => openLink(e, formatPhoneLink(offer.phone))}
              className="p-1.5 rounded text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all duration-150"
              aria-label="Call"
            >
              <Phone size={13} />
            </button>
          )}
          {offer.email && (
            <button
              onClick={e => openLink(e, `mailto:${offer.email}`)}
              className="p-1.5 rounded text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all duration-150"
              aria-label="Email"
            >
              <Mail size={13} />
            </button>
          )}
          {offer.nova_url && (
            <button
              onClick={e => openLink(e, formatNovaLink(offer.nova_url))}
              className="p-1.5 rounded text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all duration-150"
              aria-label="Open Nova"
            >
              <ExternalLink size={13} />
            </button>
          )}
          {offer.recruiter && (
            <div className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-600 font-medium">
              <Briefcase size={10} />
              {offer.recruiter}
            </div>
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
  column: ColumnDefinition;
  offers: OfferRow[];
  onClick: (offer: OfferRow) => void;
}> = ({ column, offers, onClick }) => {
  return (
    <div className="flex flex-col h-full">
      {/* STICKY COLUMN HEADER */}
      <div className="mb-4 bg-gradient-to-b from-slate-50 to-transparent pb-3 sticky top-0 z-10">
        <div className="flex items-baseline gap-3 mb-1.5">
          <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{column.label}</h3>
          <span className="text-[13px] font-medium text-slate-400 tabular-nums">{offers.length}</span>
        </div>
        <p className="text-[11px] text-slate-500 tracking-wide">{column.description}</p>
      </div>

      {/* SCROLLABLE CONTENT AREA */}
      <div className="flex-1 space-y-3 p-3 rounded-xl bg-slate-50/60 border-2 border-transparent overflow-y-auto">
        {offers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
            <div className="w-full max-w-[180px] border-2 border-dashed border-slate-200 rounded-lg p-6">
              <p className="text-sm font-medium text-slate-700">No candidates</p>
              <p className="text-xs text-slate-400 mt-1">in {column.label.toLowerCase()}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {offers.map((offer, i) => (
              <OfferCard
                key={offer.engagement_id}
                offer={offer}
                onClick={() => onClick(offer)}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// DETAIL MODAL
// ============================================================================

const DetailModal: React.FC<{
  offer: OfferRow | null;
  onClose: () => void;
}> = ({ offer, onClose }) => {
  if (!offer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 animate-slideUp">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {offer.full_name || 'Unknown Candidate'}
            </h2>
            <p className="text-[13px] text-slate-500 mt-1">
              {offer.primary_specialty || 'No specialty'} • Engagement #{offer.engagement_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Contact Info */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Contact</h3>
            <div className="space-y-2">
              {offer.email && (
                <div className="flex items-center gap-3 text-[13px]">
                  <Mail size={14} className="text-slate-400" />
                  <a href={`mailto:${offer.email}`} className="text-blue-600 hover:text-blue-700 font-medium">
                    {offer.email}
                  </a>
                </div>
              )}
              {offer.phone && (
                <div className="flex items-center gap-3 text-[13px]">
                  <Phone size={14} className="text-slate-400" />
                  <a href={formatPhoneLink(offer.phone)} className="text-blue-600 hover:text-blue-700 font-medium">
                    {offer.phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Assignment Details */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Assignment</h3>
            <div className="space-y-3">
              {offer.facility_name && (
                <div>
                  <p className="text-[11px] text-slate-500 mb-1">Facility</p>
                  <p className="text-[13px] font-medium text-slate-900">{offer.facility_name}</p>
                </div>
              )}
              {(offer.location_city || offer.location_state) && (
                <div>
                  <p className="text-[11px] text-slate-500 mb-1">Location</p>
                  <p className="text-[13px] font-medium text-slate-900">
                    {[offer.location_city, offer.location_state].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
              {offer.start_date && (
                <div>
                  <p className="text-[11px] text-slate-500 mb-1">Start Date</p>
                  <p className="text-[13px] font-medium text-slate-900">
                    {formatDate(offer.start_date)}
                    {offer.days_until_start !== null && (
                      <span className="ml-2 text-slate-500">
                        ({formatRelativeDate(offer.start_date)})
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Licenses */}
          {offer.licenses && offer.licenses.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Licenses</h3>
              <div className="flex flex-wrap gap-2">
                {offer.licenses.map(license => (
                  <div key={license} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-[12px] font-medium">
                    {license}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-2xl">
          {offer.nova_url && (
            <a
              href={formatNovaLink(offer.nova_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all"
            >
              <ExternalLink size={14} />
              Open in Nova
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
    </div>
  );
};

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

export default function OffersSignedPrestartDashboard() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedOffer, setSelectedOffer] = useState<OfferRow | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('offers_signed_prestart_dashboard')
        .select('*')
        .order('start_date', { ascending: true });

      if (error) throw error;

      setOffers(data || []);
    } catch (error) {
      console.error('Load error:', error);
      showToast('Failed to load offers', 'error');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load(true);

    const channel = supabase
      .channel('offers_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'engagements' },
        () => {
          console.log('Engagement changed, reloading...');
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const { byStage, stats } = useMemo(() => {
    const filtered = offers.filter(o =>
      !search ||
      o.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.email?.toLowerCase().includes(search.toLowerCase()) ||
      o.facility_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.primary_specialty?.toLowerCase().includes(search.toLowerCase())
    );

    const grouped = STAGE_COLUMNS.reduce((acc, col) => {
      acc[col.id] = filtered.filter(o => o.stage_bucket === col.id);
      return acc;
    }, {} as Record<StageBucket, OfferRow[]>);

    const orientationCount = filtered.filter(o => o.in_orientation_week).length;

    return {
      byStage: grouped,
      stats: {
        total: filtered.length,
        orientation: orientationCount
      }
    };
  }, [offers, search]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-center animate-fadeIn">
          <Loader2 className="w-7 h-7 text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">Loading offers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-20 animate-fadeIn" style={{ opacity: 0 }}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Offers & Pre-Start</h1>
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-semibold text-slate-700 tabular-nums">{stats.total}</span> Active ·
                <span className="font-semibold text-slate-700 tabular-nums ml-1">{stats.orientation}</span> In Orientation
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-64 pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                  aria-label="Search candidates"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 transition-colors"
                    aria-label="Clear search"
                  >
                    <X size={14} className="text-slate-500" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* KANBAN COLUMNS */}
      <main className="flex-1 p-6 overflow-hidden">
        <div className="grid grid-cols-3 gap-4 h-[calc(100vh-200px)]">
          {STAGE_COLUMNS.map((col, i) => (
            <div key={col.id} className="h-full overflow-hidden animate-fadeInUp" style={{ animationDelay: `${i * 75}ms`, opacity: 0 }}>
              <KanbanColumn
                column={col}
                offers={byStage[col.id] ?? []}
                onClick={setSelectedOffer}
              />
            </div>
          ))}
        </div>
      </main>

      {/* TOAST */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-5 right-5 px-4 py-3 rounded-lg text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2.5 animate-slideUp',
            {
              'bg-slate-900': toast.type === 'info',
              'bg-green-600': toast.type === 'success',
              'bg-red-600': toast.type === 'error'
            }
          )}
        >
          {toast.type === 'success' && <CheckCircle size={15} />}
          {toast.type === 'error' && <AlertCircle size={15} />}
          {toast.type === 'info' && <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* DETAIL MODAL */}
      <DetailModal offer={selectedOffer} onClose={() => setSelectedOffer(null)} />

      {/* GLOBAL STYLES */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }

        .animate-fadeInUp {
          animation: fadeInUp 0.4s ease-out forwards;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }

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
