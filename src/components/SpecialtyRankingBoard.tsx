// ============================================================================
// src/components/SpecialtyRankingBoard.tsx
// PRODUCTION READY - Refined Minimal Design with Apple × Stripe Aesthetic
// Architecture: Drag-and-drop specialty ranking, clean visual hierarchy
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, X, Phone, Mail, ExternalLink, MapPin, Calendar,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, GripVertical
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { Badge } from './shared/Badges';

// ============================================================================
// TYPES
// ============================================================================

interface Prospect {
  id: number;
  candidate_id?: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  specialty?: string | null;
  profession?: string | null;
  status: string;
  home_state?: string | null;
  licenses?: string[] | null;
  shift_preference?: string | null;
  last_placement?: string | null;
  contract_end_date?: string | null;
  pool_notes?: string | null;
  facility_tags?: string[] | null;
  specialty_rank?: number | null;
  updated_at?: string;
  has_worked_before?: boolean;
  nova_url?: string;
}

interface ToastNotification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SPECIALTY_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
];

const STATUSES_TO_INCLUDE = [
  'New',
  'Contacted',
  'Profile Updates',
  'Submittal Ready',
  'Not Interested'
];

const SPECIALTIES_PER_PAGE = 4;

// ============================================================================
// DATA HOOKS
// ============================================================================

function useSpecialtyRankings() {
  const queryClient = useQueryClient();
  const queryKey = ['specialty-rankings'];

  const { data: prospects = [], isLoading, error, refetch } = useQuery<Prospect[]>({
    queryKey,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('prospects')
        .select('*')
        .in('status', STATUSES_TO_INCLUDE)
        .order('specialty_rank', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      return (data || []).map((p) => ({
        ...p,
        has_worked_before: !!p.last_placement,
      }));
    },
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Prospect>[]) => {
      const promises = updates.map(update =>
        supabase.from('prospects').update(update).eq('id', update.id)
      );
      const results = await Promise.all(promises);
      const firstError = results.find(res => res.error);
      if (firstError) throw firstError.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    prospects,
    isLoading,
    error,
    refetch,
    updateProspects: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

const formatDate = (dateString?: string | null) => {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const normalizeSpecialty = (specialty?: string | null) => {
  if (!specialty) return 'Uncategorized';
  return specialty.trim();
};

// ============================================================================
// TALENT CARD - Minimal Jony Ive Style
// ============================================================================

const TalentCard: React.FC<{
  prospect: Prospect;
  index: number;
  onDragStart: (e: React.DragEvent, prospect: Prospect) => void;
}> = ({ prospect, index, onDragStart }) => {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const availableDate = formatDate(prospect.contract_end_date);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, prospect)}
      className={cn(
        'group relative bg-white rounded-lg border p-4 cursor-grab active:cursor-grabbing transition-all duration-200',
        'hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-slate-300 hover:-translate-y-0.5',
        'border-slate-200',
        prospect.has_worked_before && 'border-l-2 border-l-blue-500'
      )}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      {/* Drag Handle */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <GripVertical size={14} className="text-slate-300" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-2 pl-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-slate-900 truncate">
            {prospect.name}
          </h4>
          {(prospect.home_state || availableDate) && (
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {[prospect.home_state, availableDate && `Available ${availableDate}`]
                .filter(Boolean)
                .join(' • ')}
            </p>
          )}
        </div>
        {prospect.has_worked_before && (
          <Badge variant="info" className="ml-2 shrink-0 text-[10px]">
            Past
          </Badge>
        )}
      </div>

      {/* Actions - Appear on hover */}
      <div className="flex items-center gap-1 pl-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {prospect.phone && (
          <a
            href={`tel:${prospect.phone}`}
            onClick={stop}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            aria-label="Call"
          >
            <Phone size={13} />
          </a>
        )}
        {prospect.email && (
          <a
            href={`mailto:${prospect.email}`}
            onClick={stop}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            aria-label="Email"
          >
            <Mail size={13} />
          </a>
        )}
        {prospect.candidate_id && (
          <a
            href={`https://nova.ayahealthcare.com/#/recruiting/candidates/${prospect.candidate_id}/new-profile/about`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            aria-label="Nova"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SPECIALTY COLUMN
// ============================================================================

const Column: React.FC<{
  specialty: string;
  prospects: Prospect[];
  color: string;
  onDrop: (e: React.DragEvent, specialty: string) => void;
  onDragStart: (e: React.DragEvent, prospect: Prospect) => void;
}> = ({ specialty, prospects, color, onDrop, onDragStart }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        onDrop(e, specialty);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      className={cn(
        "flex-1 min-w-[300px] max-w-[360px] flex flex-col rounded-xl transition-all duration-200",
        isDragOver
          ? "bg-slate-50 scale-[1.01] shadow-sm"
          : "bg-transparent"
      )}
    >
      {/* Column Header */}
      <div className="pb-3 mb-4 flex justify-between items-center border-b-2" style={{ borderColor: color }}>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          {specialty}
        </h3>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {prospects.length}
        </span>
      </div>

      {/* Cards Container */}
      <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
        {prospects.length === 0 ? (
          <div className="flex items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-lg">
            <p className="text-xs text-slate-400 font-medium">Drop candidates here</p>
          </div>
        ) : (
          prospects.map((p, i) => (
            <TalentCard
              key={p.id}
              prospect={p}
              index={i}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ============================================================================
// TOAST COMPONENT
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

  const Icon = type === 'error' ? AlertCircle : AlertCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-2xl backdrop-blur-sm animate-slideUp',
        styles[type]
      )}
    >
      <Icon size={18} />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="ml-4 -mr-2 p-1 rounded-full hover:bg-white/10 transition-all duration-200 active:scale-[0.99]"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SpecialtyRankingBoard() {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  const { prospects, isLoading, error, refetch, updateProspects } = useSpecialtyRankings();

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const newToast = { id: Date.now(), message: msg, type };
    setToast(newToast);
    setTimeout(() => {
      setToast(current => (current?.id === newToast.id ? null : current));
    }, 4000);
  }, []);

  // Filter prospects by search
  const filteredProspects = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();
    if (!lowerSearch) return prospects;
    return prospects.filter(p =>
      p.name.toLowerCase().includes(lowerSearch) ||
      p.specialty?.toLowerCase().includes(lowerSearch) ||
      p.home_state?.toLowerCase().includes(lowerSearch) ||
      p.profession?.toLowerCase().includes(lowerSearch)
    );
  }, [prospects, search]);

  // Group by specialty and paginate
  const { specialtyPages, columns } = useMemo(() => {
    const specialtyMap = new Map<string, Prospect[]>();
    
    filteredProspects.forEach(p => {
      const spec = normalizeSpecialty(p.specialty);
      if (!specialtyMap.has(spec)) {
        specialtyMap.set(spec, []);
      }
      specialtyMap.get(spec)!.push(p);
    });

    // Sort prospects within each specialty by rank
    specialtyMap.forEach(prospectsInSpec => {
      prospectsInSpec.sort((a, b) => (a.specialty_rank || Infinity) - (b.specialty_rank || Infinity));
    });

    // Sort specialties by count (descending)
    const sortedSpecialties = Array.from(specialtyMap.keys()).sort(
      (a, b) => specialtyMap.get(b)!.length - specialtyMap.get(a)!.length
    );

    // Create pages
    const pages: string[][] = [];
    for (let i = 0; i < sortedSpecialties.length; i += SPECIALTIES_PER_PAGE) {
      pages.push(sortedSpecialties.slice(i, i + SPECIALTIES_PER_PAGE));
    }

    return { specialtyPages: pages, columns: specialtyMap };
  }, [filteredProspects]);

  const currentSpecialtiesOnPage = specialtyPages[currentPage] || [];

  // Handle drop to change specialty
  const handleDrop = useCallback(
    async (e: React.DragEvent, newSpecialty: string) => {
      e.preventDefault();
      
      const prospectId = Number(e.dataTransfer.getData('text/plain'));
      const draggedProspect = prospects.find(p => p.id === prospectId);

      if (!draggedProspect) return;

      const currentSpecialty = normalizeSpecialty(draggedProspect.specialty);

      if (currentSpecialty !== newSpecialty) {
        try {
          await updateProspects([{
            id: draggedProspect.id,
            specialty: newSpecialty,
            specialty_rank: null,
            updated_at: new Date().toISOString()
          }]);
          showToast(`Moved ${draggedProspect.name} to ${newSpecialty}`, 'success');
        } catch (err) {
          console.error('[Drop] Update failed:', err);
          showToast('Failed to update specialty', 'error');
        }
      }
    },
    [prospects, updateProspects, showToast]
  );

  const handleDragStart = useCallback((e: React.DragEvent, prospect: Prospect) => {
    e.dataTransfer.setData('text/plain', prospect.id.toString());
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">Loading talent pool...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Data</h3>
          <p className="text-sm text-slate-600 mb-4">{error.toString()}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-1">
                Talent Pool Rankings
              </h1>
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700 tabular-nums">{filteredProspects.length}</span> candidates
                {search && ` matching "${search}"`}
              </p>
            </div>

            {/* Pagination */}
            {specialtyPages.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className={cn(
                    'p-2 rounded-lg border transition-colors',
                    currentPage === 0
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  )}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-slate-600 font-medium tabular-nums min-w-[80px] text-center">
                  {currentPage + 1} of {specialtyPages.length}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(specialtyPages.length - 1, p + 1))}
                  disabled={currentPage >= specialtyPages.length - 1}
                  className={cn(
                    'p-2 rounded-lg border transition-colors',
                    currentPage >= specialtyPages.length - 1
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  )}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, specialty, location..."
              className="w-full pl-11 pr-10 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Clear search"
              >
                <X size={16} className="text-slate-500" />
              </button>
            )}
          </div>
        </header>

        {/* Columns */}
        {currentSpecialtiesOnPage.length > 0 ? (
          <div className="flex gap-6 overflow-x-auto pb-4">
            {currentSpecialtiesOnPage.map((specialty, idx) => (
              <Column
                key={specialty}
                specialty={specialty}
                prospects={columns.get(specialty) || []}
                color={SPECIALTY_COLORS[idx % SPECIALTY_COLORS.length]}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="text-center max-w-md">
              <p className="text-lg font-medium text-slate-900 mb-2">No results found</p>
              <p className="text-sm text-slate-500">
                Try adjusting your search terms or <button onClick={() => setSearch('')} className="text-blue-600 hover:text-blue-700 font-medium">clear filters</button>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp {
          animation: slideUp 0.3s cubic-bezier(0.215, 0.610, 0.355, 1) forwards;
        }
        
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}