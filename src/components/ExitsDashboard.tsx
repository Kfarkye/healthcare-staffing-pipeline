// ============================================================================
// Exit Buckets Dashboard
// Every prospect has a story. This is where their journeys pause.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Pause, Coffee, Briefcase, Eye, EyeOff, RotateCcw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ============================================================================
// DESIGN SYSTEM
// ============================================================================

const DESIGN = {
  space: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '0.75rem',    // 12px
    lg: '1rem',       // 16px
    xl: '1.5rem',     // 24px
    '2xl': '2rem',    // 32px
  },
  text: {
    xs: '0.6875rem',  // 11px
    sm: '0.8125rem',  // 13px
    base: '0.875rem', // 14px
    lg: '1rem',       // 16px
    xl: '1.25rem',    // 20px
    '2xl': '1.75rem', // 28px
  },
  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  color: {
    stalled: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    break: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    perm: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    neutral: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  },
  elevation: {
    none: 'shadow-none',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
  },
  radius: {
    sm: '0.5rem',   // 8px
    md: '0.75rem',  // 12px
    lg: '1rem',     // 16px
    full: '9999px',
  },
  transition: {
    fast: '100ms',
    base: '150ms',
    slow: '200ms',
  },
};

// ============================================================================
// TYPES
// ============================================================================

type ExitStatus = 'Stalled' | 'Break' | 'Perm';
type ViewMode = 'Active' | 'Hidden';

interface Prospect {
  id: number;
  candidate_id: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  profession: string | null;
  exit_bucket: ExitStatus | null;
  soft_deleted: boolean;
  soft_deleted_at: string | null;
  updated_at: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// UTILITIES
// ============================================================================

const getStatusConfig = (status: ExitStatus | null) => {
  if (!status) return null;
  const configs = {
    Stalled: { icon: Pause, label: 'Stalled', iconColor: '#f59e0b', ...DESIGN.color.stalled },
    Break: { icon: Coffee, label: 'Taking Break', iconColor: '#3b82f6', ...DESIGN.color.break },
    Perm: { icon: Briefcase, label: 'Going Perm', iconColor: '#a855f7', ...DESIGN.color.perm },
  };
  return configs[status];
};

const cn = (...classes: (string | boolean | undefined)[]) => 
  classes.filter(Boolean).join(' ');

// ============================================================================
// TOAST NOTIFICATION
// ============================================================================

const Toast: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const Icon = toast.type === 'success' ? Check : AlertCircle;
  const bgColor = toast.type === 'success' ? 'bg-green-600' : 
                  toast.type === 'error' ? 'bg-red-600' : 'bg-slate-900';

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 px-4 py-3 rounded-xl text-white z-50',
        'flex items-center gap-2.5 animate-slideUp backdrop-blur-sm',
        bgColor, DESIGN.elevation.lg
      )}
      style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
      role="alert"
    >
      <Icon size={16} strokeWidth={2.5} />
      {toast.message}
    </div>
  );
};

// ============================================================================
// METRIC CARD
// ============================================================================

const Metric: React.FC<{
  label: string;
  value: number;
  status?: ExitStatus;
  isActive?: boolean;
  onClick?: () => void;
}> = ({ label, value, status, isActive, onClick }) => {
  const config = status ? getStatusConfig(status) : null;
  const Icon = config?.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-3 rounded-xl border transition-all text-left w-full',
        'hover:shadow-sm active:scale-[0.98]',
        isActive && 'ring-2 ring-slate-900 ring-offset-2',
        config ? `${config.bg} ${config.border}` : 'bg-white border-slate-200'
      )}
      style={{ 
        transition: `all ${DESIGN.transition.base} cubic-bezier(0.16, 1, 0.3, 1)`,
      }}
      aria-label={`View ${label} prospects`}
      aria-pressed={isActive}
    >
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} strokeWidth={2} style={{ color: config.icon }} />}
        <span 
          className="text-slate-500 uppercase tracking-wider"
          style={{ fontSize: DESIGN.text.xs, fontWeight: DESIGN.weight.semibold }}
        >
          {label}
        </span>
      </div>
      <div 
        className="text-slate-900 tabular-nums"
        style={{ fontSize: DESIGN.text['2xl'], fontWeight: DESIGN.weight.bold }}
      >
        {value}
      </div>
    </button>
  );
};

// ============================================================================
// PROSPECT CARD
// ============================================================================

const ProspectCard: React.FC<{
  prospect: Prospect;
  onStatusChange: (status: ExitStatus | null) => void;
  onVisibilityToggle: () => void;
  index: number;
}> = ({ prospect, onStatusChange, onVisibilityToggle, index }) => {
  const [showActions, setShowActions] = useState(false);
  const config = prospect.exit_bucket ? getStatusConfig(prospect.exit_bucket) : null;
  const StatusIcon = config?.icon;

  return (
    <article
      className={cn(
        'bg-white rounded-xl border border-slate-200 p-4',
        'transition-all hover:shadow-md hover:border-slate-300',
        'animate-fadeIn',
        prospect.soft_deleted && 'opacity-40 hover:opacity-60'
      )}
      style={{ 
        animationDelay: `${Math.min(index * 30, 300)}ms`,
        transition: `all ${DESIGN.transition.base} cubic-bezier(0.16, 1, 0.3, 1)`,
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 
            className="text-slate-900 truncate mb-0.5"
            style={{ fontSize: DESIGN.text.base, fontWeight: DESIGN.weight.semibold }}
          >
            {prospect.name}
          </h3>
          <p 
            className="text-slate-500 truncate"
            style={{ fontSize: DESIGN.text.sm }}
          >
            {prospect.specialty || prospect.profession || 'No specialty'}
          </p>
        </div>

        {/* Visibility Toggle */}
        <button
          onClick={onVisibilityToggle}
          className={cn(
            'p-1.5 rounded-lg transition-all',
            showActions || prospect.soft_deleted ? 'opacity-100' : 'opacity-0',
            prospect.soft_deleted 
              ? 'text-green-600 hover:bg-green-50' 
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          )}
          style={{ transition: `all ${DESIGN.transition.fast} ease-out` }}
          aria-label={prospect.soft_deleted ? 'Restore prospect' : 'Hide prospect'}
          title={prospect.soft_deleted ? 'Restore' : 'Hide'}
        >
          {prospect.soft_deleted ? (
            <RotateCcw size={16} strokeWidth={2} />
          ) : (
            <EyeOff size={16} strokeWidth={2} />
          )}
        </button>
      </header>

      {/* Status Badges */}
      {!prospect.soft_deleted && (
        <div className="flex flex-wrap gap-2">
          {(['Stalled', 'Break', 'Perm'] as ExitStatus[]).map((status) => {
            const statusConfig = getStatusConfig(status);
            const Icon = statusConfig.icon;
            const isActive = prospect.exit_bucket === status;

            return (
              <button
                key={status}
                onClick={() => onStatusChange(isActive ? null : status)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all',
                  'hover:shadow-sm active:scale-95',
                  isActive 
                    ? `${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} ring-1 ring-offset-1` 
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                )}
                style={{ 
                  fontSize: DESIGN.text.xs, 
                  fontWeight: DESIGN.weight.semibold,
                  transition: `all ${DESIGN.transition.fast} cubic-bezier(0.16, 1, 0.3, 1)`,
                }}
                aria-label={`Mark as ${status}`}
                aria-pressed={isActive}
                title={statusConfig.label}
              >
                <Icon 
                  size={12} 
                  strokeWidth={2.5}
                  style={{ color: isActive ? statusConfig.icon : 'currentColor' }}
                />
                {status}
              </button>
            );
          })}
        </div>
      )}

      {/* Hidden State */}
      {prospect.soft_deleted && (
        <div 
          className="flex items-center gap-1.5 text-slate-500"
          style={{ fontSize: DESIGN.text.xs }}
        >
          <EyeOff size={12} strokeWidth={2} />
          <span>Hidden</span>
          {prospect.soft_deleted_at && (
            <>
              <span>·</span>
              <time dateTime={prospect.soft_deleted_at}>
                {new Date(prospect.soft_deleted_at).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </time>
            </>
          )}
        </div>
      )}
    </article>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ExitBuckets(): JSX.Element {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('Active');
  const [activeFilter, setActiveFilter] = useState<ExitStatus | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
  }, []);

  // Load data
  const loadProspects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('prospect_exit_view')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProspects((data as Prospect[]) || []);
    } catch (error) {
      console.error('Load error:', error);
      showToast('Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  // Compute metrics
  const metrics = useMemo(() => {
    const active = prospects.filter(p => !p.soft_deleted);
    const hidden = prospects.filter(p => p.soft_deleted);

    return {
      active: active.length,
      stalled: active.filter(p => p.exit_bucket === 'Stalled').length,
      break: active.filter(p => p.exit_bucket === 'Break').length,
      perm: active.filter(p => p.exit_bucket === 'Perm').length,
      hidden: hidden.length,
    };
  }, [prospects]);

  // Filter prospects
  const displayedProspects = useMemo(() => {
    let filtered = viewMode === 'Active' 
      ? prospects.filter(p => !p.soft_deleted)
      : prospects.filter(p => p.soft_deleted);

    if (activeFilter && viewMode === 'Active') {
      filtered = filtered.filter(p => p.exit_bucket === activeFilter);
    }

    return filtered;
  }, [prospects, viewMode, activeFilter]);

  // Handle status change
  const handleStatusChange = useCallback(async (prospectId: number, status: ExitStatus | null) => {
    const original = [...prospects];
    
    // Optimistic update
    setProspects(current =>
      current.map(p => p.id === prospectId ? { ...p, exit_bucket: status } : p)
    );

    try {
      const { error } = await supabase.rpc('set_exit_bucket', {
        p_prospect_id: prospectId,
        p_bucket: status,
      });

      if (error) throw error;
      showToast(status ? `Marked ${status}` : 'Cleared', 'success');
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Update failed', 'error');
      setProspects(original);
    }
  }, [prospects, showToast]);

  // Handle visibility toggle
  const handleVisibilityToggle = useCallback(async (prospectId: number, isHidden: boolean) => {
    const original = [...prospects];
    
    // Optimistic update
    setProspects(current =>
      current.map(p => p.id === prospectId 
        ? { ...p, soft_deleted: !isHidden, soft_deleted_at: !isHidden ? new Date().toISOString() : null }
        : p
      )
    );

    try {
      const { error } = await supabase.rpc('mark_soft_deleted', {
        p_prospect_id: prospectId,
        p_soft_deleted: !isHidden,
        p_reason: isHidden ? null : 'Hidden from Exit Buckets',
      });

      if (error) throw error;
      showToast(isHidden ? 'Restored' : 'Hidden', 'info');
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Update failed', 'error');
      setProspects(original);
    }
  }, [prospects, showToast]);

  if (loading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
          <p 
            className="text-slate-600"
            style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
          >
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 overflow-auto">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-5">
        <h1 
          className="text-slate-900 mb-1"
          style={{ fontSize: DESIGN.text.xl, fontWeight: DESIGN.weight.bold }}
        >
          Exit Buckets
        </h1>
        <p 
          className="text-slate-600"
          style={{ fontSize: DESIGN.text.sm }}
        >
          Track prospects who are pausing their journey
        </p>
      </header>

      {/* Metrics */}
      <section 
        className="px-6 py-5 grid grid-cols-5 gap-3"
        aria-label="Metrics"
      >
        <Metric 
          label="Stalled" 
          value={metrics.stalled} 
          status="Stalled"
          isActive={viewMode === 'Active' && activeFilter === 'Stalled'}
          onClick={() => {
            setViewMode('Active');
            setActiveFilter(activeFilter === 'Stalled' ? null : 'Stalled');
          }}
        />
        <Metric 
          label="Break" 
          value={metrics.break} 
          status="Break"
          isActive={viewMode === 'Active' && activeFilter === 'Break'}
          onClick={() => {
            setViewMode('Active');
            setActiveFilter(activeFilter === 'Break' ? null : 'Break');
          }}
        />
        <Metric 
          label="Perm" 
          value={metrics.perm} 
          status="Perm"
          isActive={viewMode === 'Active' && activeFilter === 'Perm'}
          onClick={() => {
            setViewMode('Active');
            setActiveFilter(activeFilter === 'Perm' ? null : 'Perm');
          }}
        />
        <Metric 
          label="Active" 
          value={metrics.active}
          isActive={viewMode === 'Active' && !activeFilter}
          onClick={() => {
            setViewMode('Active');
            setActiveFilter(null);
          }}
        />
        <Metric 
          label="Hidden" 
          value={metrics.hidden}
          isActive={viewMode === 'Hidden'}
          onClick={() => setViewMode('Hidden')}
        />
      </section>

      {/* Grid */}
      <section className="px-6 pb-6" aria-label="Prospects">
        {displayedProspects.length === 0 ? (
          <div className="text-center py-16">
            <div 
              className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3"
            >
              <Eye className="w-6 h-6 text-slate-400" strokeWidth={2} />
            </div>
            <p 
              className="text-slate-900 mb-1"
              style={{ fontSize: DESIGN.text.base, fontWeight: DESIGN.weight.medium }}
            >
              No prospects
            </p>
            <p 
              className="text-slate-500"
              style={{ fontSize: DESIGN.text.sm }}
            >
              {viewMode === 'Hidden' ? 'Nothing hidden' : 'All clear'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedProspects.map((prospect, index) => (
              <ProspectCard
                key={prospect.id}
                prospect={prospect}
                onStatusChange={(status) => handleStatusChange(prospect.id, status)}
                onVisibilityToggle={() => handleVisibilityToggle(prospect.id, prospect.soft_deleted)}
                index={index}
              />
            ))}
          </div>
        )}
      </section>

      {/* Toast */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { 
          animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; 
          opacity: 0;
        }
        .animate-slideUp { 
          animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1); 
        }
      `}</style>
    </div>
  );
}