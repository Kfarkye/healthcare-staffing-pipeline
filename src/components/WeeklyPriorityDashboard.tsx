import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlusCircle, AlertTriangle, Building, Calendar, Clock, X, Loader2, Phone, Mail, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const PRIORITY_STATUSES = ['This Week', 'Offer Out', 'Signed / Accepted'];
const ACTIVE_PRIORITY_STATUSES = ['This Week', 'Offer Out'];
const MAX_WEEKLY_PROSPECTS = 15;

// ============================================================================
// THEME & DESIGN TOKENS
// ============================================================================

const theme = {
  colors: {
    background: '#ffffff',
    surface: '#fafafa',
    surfaceHover: '#f5f5f5',
    border: '#e5e5e5',
    borderLight: '#f0f0f0',
    text: {
      primary: '#171717',
      secondary: '#737373',
      tertiary: '#a3a3a3',
    },
    accent: '#0066ff',
    accentHover: '#0052cc',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    overlay: 'rgba(0, 0, 0, 0.4)',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 4px 12px rgba(0, 0, 0, 0.08)',
    lg: '0 12px 32px rgba(0, 0, 0, 0.12)',
    xl: '0 20px 40px rgba(0, 0, 0, 0.15)',
  },
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const safeDate = (dateString) => {
  if (!dateString) return null;
  const d = new Date(dateString);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (dateString) => {
  const d = safeDate(dateString);
  if (!d) return 'No date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const calculateDaysInColumn = (dateString) => {
  const updated = safeDate(dateString);
  if (!updated) return 0;
  const now = new Date();
  const diffTime = now.getTime() - updated.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

// ============================================================================
// PRESENTATIONAL COMPONENTS
// ============================================================================

const Badge = ({ children, variant = 'default' }) => {
  const variants = {
    default: { bg: theme.colors.surface, color: theme.colors.text.secondary },
    accent: { bg: `${theme.colors.accent}15`, color: theme.colors.accent },
    success: { bg: `${theme.colors.success}15`, color: theme.colors.success },
    warning: { bg: `${theme.colors.warning}15`, color: theme.colors.warning },
  };
  const style = variants[variant] || variants.default;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        fontSize: '11px',
        fontWeight: 500,
        borderRadius: theme.radius.full,
        backgroundColor: style.bg,
        color: style.color,
        letterSpacing: '0.01em',
        transition: `all ${theme.transitions.fast}`,
      }}
    >
      {children}
    </span>
  );
};

interface IconButtonProps {
  icon: any;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  title: string;
  color?: string;
}

const IconButton: React.FC<IconButtonProps> = ({ icon: Icon, onClick, href, title, color = theme.colors.text.tertiary }) => {
  const [isHovered, setIsHovered] = useState(false);

  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    border: 'none',
    backgroundColor: isHovered ? theme.colors.surface : 'transparent',
    color: isHovered ? theme.colors.text.primary : color,
    cursor: 'pointer',
    transition: `all ${theme.transitions.fast}`,
    transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={baseStyle}
      title={title}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
};

const ProspectCard = ({ prospect, onDragStart, onDragEnd, isDragging }) => {
  const [isHovered, setIsHovered] = useState(false);
  const daysInColumn = calculateDaysInColumn(prospect.status_updated_at);
  const isUrgent = daysInColumn >= 7;

  return (
    <div
      draggable
      onDragStart={(e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(prospect.id));
        }
        onDragStart?.(e, prospect);
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        backgroundColor: theme.colors.background,
        border: `1px solid ${isDragging ? theme.colors.accent : theme.colors.border}`,
        borderRadius: theme.radius.lg,
        boxShadow: isDragging ? theme.shadows.xl : (isHovered ? theme.shadows.md : theme.shadows.sm),
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: `all ${theme.transitions.base}`,
        opacity: isDragging ? 0.6 : 1,
        transform: isDragging ? 'scale(1.02) rotate(-1deg)' : (isHovered ? 'translateY(-2px)' : 'translateY(0)'),
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
        <h4 style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          color: theme.colors.text.primary,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
        }}>
          {prospect.name}
        </h4>
        {isUrgent && prospect.status !== 'Signed / Accepted' && (
          <Badge variant="warning">
            <Clock size={10} style={{ marginRight: 4 }} />
            {daysInColumn}d
          </Badge>
        )}
      </div>

      <p style={{
        margin: `0 0 ${theme.spacing.md} 0`,
        fontSize: '12px',
        fontWeight: 500,
        color: theme.colors.text.secondary,
      }}>
        {prospect.specialty}
      </p>

      <div style={{
        paddingTop: theme.spacing.md,
        borderTop: `1px solid ${theme.colors.borderLight}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {prospect.status === 'Signed / Accepted' ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: theme.colors.success,
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.colors.success,
            }}>
              Signed {formatDate(prospect.status_updated_at)}
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            opacity: isHovered ? 1 : 0.6,
            transition: `opacity ${theme.transitions.fast}`,
          }}>
            {prospect.phone && (
              <IconButton
                icon={Phone}
                href={`tel:${prospect.phone}`}
                title={`Call ${prospect.name}`}
              />
            )}
            {prospect.email && (
              <IconButton
                icon={Mail}
                href={`mailto:${prospect.email}`}
                title={`Email ${prospect.name}`}
              />
            )}
          </div>
        )}

        {prospect.previous_status_info && (
          <Badge variant="accent">{prospect.previous_status_info}</Badge>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

const Column = ({ title, prospects, status, onDrop, isDragOver, totalCount, onCardDragStart, onCardDragEnd, draggingId }) => {
  const showCount = status === 'This Week';
  const count = prospects.length;
  const countColor = totalCount >= MAX_WEEKLY_PROSPECTS ? theme.colors.warning : theme.colors.text.tertiary;

  return (
    <div
      onDrop={(e) => onDrop(e, status)}
      onDragOver={(e) => e.preventDefault()}
      style={{
        flex: 1,
        minWidth: 320,
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDragOver ? theme.colors.surfaceHover : theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        border: `1px solid ${isDragOver ? theme.colors.accent : theme.colors.borderLight}`,
        transition: `all ${theme.transitions.base}`,
        minHeight: 500,
        transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.lg,
        paddingBottom: theme.spacing.md,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          color: theme.colors.text.primary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {title}
        </h3>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: showCount ? countColor : theme.colors.text.tertiary,
          transition: `color ${theme.transitions.fast}`,
        }}>
          {showCount ? `${totalCount} / ${MAX_WEEKLY_PROSPECTS}` : count}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: theme.spacing.xs }}>
        {prospects.length === 0 ? (
          <div style={{
            padding: theme.spacing.xxl,
            textAlign: 'center',
            color: theme.colors.text.tertiary,
            fontSize: '13px',
            border: `2px dashed ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            transition: `all ${theme.transitions.base}`,
            opacity: isDragOver ? 1 : 0.5,
          }}>
            Drop prospects here
          </div>
        ) : (
          prospects.map((prospect) => (
            <ProspectCard
              key={prospect.id}
              prospect={prospect}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              isDragging={draggingId === prospect.id}
            />
          ))
        )}
      </div>
    </div>
  );
};

const AddProspectModal = ({ isOpen, onClose, onAdd, prospects, currentCount }) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const limitReached = currentCount >= MAX_WEEKLY_PROSPECTS;
  const normalize = (s) => (s || '').toString().toLowerCase();
  const filteredProspects = prospects.filter((p) =>
    normalize(p.name).includes(normalize(searchTerm)) ||
    normalize(p.specialty).includes(normalize(searchTerm))
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.overlay,
      backdropFilter: 'blur(8px)',
      animation: 'fadeIn 200ms ease-out',
    }}>
      <div style={{
        width: 520,
        maxHeight: '80vh',
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadows.xl,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{ padding: theme.spacing.xl, borderBottom: `1px solid ${theme.colors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: theme.colors.text.primary }}>
              Add to Priority Board
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                padding: theme.spacing.sm,
                color: theme.colors.text.tertiary,
                cursor: 'pointer',
                borderRadius: theme.radius.md,
                transition: `all ${theme.transitions.fast}`,
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.surface}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <X size={20} />
            </button>
          </div>

          {limitReached && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              backgroundColor: `${theme.colors.warning}15`,
              borderRadius: theme.radius.md,
              fontSize: '13px',
              color: theme.colors.warning,
              fontWeight: 500,
            }}>
              <AlertTriangle size={16} />
              Weekly limit of {MAX_WEEKLY_PROSPECTS} prospects reached
            </div>
          )}
        </div>

        <div style={{ padding: `${theme.spacing.lg} ${theme.spacing.xl}` }}>
          <input
            type="text"
            placeholder="Search by name or specialty..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              fontSize: '14px',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              outline: 'none',
              boxSizing: 'border-box',
              transition: `border-color ${theme.transitions.fast}`,
            }}
            onFocus={(e) => e.target.style.borderColor = theme.colors.accent}
            onBlur={(e) => e.target.style.borderColor = theme.colors.border}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${theme.spacing.xl} ${theme.spacing.xl}` }}>
          {filteredProspects.length === 0 ? (
            <div style={{ padding: theme.spacing.lg, color: theme.colors.text.tertiary, fontSize: 13, textAlign: 'center' }}>
              No matches found
            </div>
          ) : (
            filteredProspects.map((prospect) => (
              <div
                key={prospect.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: theme.spacing.lg,
                  borderBottom: `1px solid ${theme.colors.borderLight}`,
                  transition: `background-color ${theme.transitions.fast}`,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.surface}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text.primary, marginBottom: theme.spacing.xs }}>
                    {prospect.name}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.colors.text.secondary }}>
                    {prospect.specialty || 'Unknown'} • {prospect.status || 'Unknown'}
                  </div>
                </div>
                <button
                  onClick={() => onAdd(prospect)}
                  disabled={limitReached}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: limitReached ? theme.colors.surface : theme.colors.accent,
                    color: limitReached ? theme.colors.text.tertiary : theme.colors.background,
                    border: 'none',
                    borderRadius: theme.radius.md,
                    cursor: limitReached ? 'not-allowed' : 'pointer',
                    transition: `all ${theme.transitions.fast}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!limitReached) e.currentTarget.style.backgroundColor = theme.colors.accentHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!limitReached) e.currentTarget.style.backgroundColor = theme.colors.accent;
                  }}
                >
                  Add
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

const LoadingState = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    color: theme.colors.text.tertiary,
    gap: theme.spacing.md,
  }}>
    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
    <span>Loading priority board...</span>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const ErrorState = ({ error, onRetry }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: theme.spacing.lg,
  }}>
    <div style={{
      padding: theme.spacing.xl,
      backgroundColor: `${theme.colors.error}0A`,
      borderRadius: theme.radius.lg,
      border: `1px solid ${theme.colors.error}20`,
      textAlign: 'center',
      maxWidth: 400,
    }}>
      <AlertTriangle size={32} color={theme.colors.error} style={{ marginBottom: theme.spacing.md }} />
      <h3 style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: theme.colors.text.primary, fontSize: '16px', fontWeight: 600 }}>
        Failed to load priority board
      </h3>
      <p style={{ margin: 0, color: theme.colors.text.secondary, fontSize: '14px' }}>{error}</p>
    </div>
    <button
      onClick={onRetry}
      style={{
        padding: `${theme.spacing.md} ${theme.spacing.xl}`,
        fontSize: '14px',
        fontWeight: 600,
        backgroundColor: theme.colors.accent,
        color: theme.colors.background,
        border: 'none',
        borderRadius: theme.radius.md,
        cursor: 'pointer',
        transition: `all ${theme.transitions.fast}`,
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.accentHover}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.accent}
    >
      Retry
    </button>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const WeeklyPriorityDashboard = () => {
  const [prospects, setProspects] = useState([]);
  const [availableProspects, setAvailableProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const draggingProspect = useRef(null);

  const handleWeeklyReset = useCallback(async () => {
    const today = new Date();
    const startOfThisWeek = getStartOfWeek(today);
    startOfThisWeek.setHours(0, 0, 0, 0);

    const lastResetStr = localStorage.getItem('weeklyPriorityReset');
    const lastReset = lastResetStr ? new Date(lastResetStr) : new Date(0);

    if (lastReset < startOfThisWeek) {
      const { error: archiveError } = await supabase
        .from('prospects')
        .update({
          status: 'Archived',
          previous_status_info: 'Archived from Weekly Priority Board',
        })
        .in('status', ACTIVE_PRIORITY_STATUSES);

      if (archiveError) {
        console.error('Weekly reset error:', archiveError);
      } else {
        localStorage.setItem('weeklyPriorityReset', today.toISOString());
      }
    }
  }, [supabase]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      await handleWeeklyReset();

      const { data: priorityData, error: priorityError } = await supabase
        .from('prospects')
        .select('id, name, specialty, last_contacted_at, status, previous_status_info, status_updated_at, updated_at, phone, email')
        .in('status', PRIORITY_STATUSES)
        .order('updated_at', { ascending: false });

      if (priorityError) throw priorityError;

      const { data: availableData, error: availableError } = await supabase
        .from('prospects')
        .select('id, name, specialty, status')
        .not('status', 'in', `(${PRIORITY_STATUSES.map(s => `"${s}"`).join(',')})`)
        .order('name', { ascending: true });

      if (availableError) throw availableError;

      setProspects(priorityData || []);
      setAvailableProspects(availableData || []);
    } catch (err) {
      setError(err.message);
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, handleWeeklyReset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCardDragStart = (e, prospect) => {
    draggingProspect.current = prospect;
    setDraggingId(prospect.id);
  };

  const handleCardDragEnd = () => {
    setDraggingId(null);
    setDragOverColumn(null);
    draggingProspect.current = null;
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    const prospect = draggingProspect.current;
    if (!prospect || prospect.status === newStatus) return;

    const optimisticUpdate = prospects.map((p) =>
      p.id === prospect.id
        ? {
          ...p,
          previous_status_info: `From: ${p.status}`,
          status: newStatus,
          status_updated_at: new Date().toISOString(),
        }
        : p
    );
    setProspects(optimisticUpdate);

    const { error: updateError } = await supabase
      .from('prospects')
      .update({
        status: newStatus,
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', prospect.id);

    if (updateError) {
      console.error('Update error:', updateError);
      fetchData();
    }

    setDraggingId(null);
    draggingProspect.current = null;
  };

  const handleAddProspect = async (prospect) => {
    if (prospects.length >= MAX_WEEKLY_PROSPECTS) return;

    const updates = {
      status: 'This Week',
      previous_status_info: `From: ${prospect.status || 'Unspecified'}`,
      status_updated_at: new Date().toISOString(),
    };

    const { data, error: updateError } = await supabase
      .from('prospects')
      .update(updates)
      .eq('id', prospect.id)
      .select('id, name, specialty, last_contacted_at, status, previous_status_info, status_updated_at, updated_at, phone, email')
      .single();

    if (updateError) {
      console.error('Add error:', updateError);
      return;
    }

    setProspects((prev) => [data, ...prev]);
    setAvailableProspects((prev) => prev.filter((p) => p.id !== prospect.id));
    setShowModal(false);
  };

  const columns = {
    'This Week': prospects.filter((p) => p.status === 'This Week'),
    'Offer Out': prospects.filter((p) => p.status === 'Offer Out'),
    'Signed / Accepted': prospects.filter((p) => p.status === 'Signed / Accepted'),
  };
  const totalCount = prospects.length;

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={fetchData} />;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background,
      padding: theme.spacing.xxl,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', marginBottom: theme.spacing.xxl }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: theme.colors.text.primary, letterSpacing: '-0.02em' }}>
              Weekly Priority Board
            </h1>
            <p style={{ margin: `${theme.spacing.sm} 0 0 0`, fontSize: 15, color: theme.colors.text.secondary }}>
              Your commitments to close this week. Resets every Monday at 7 AM.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            disabled={totalCount >= MAX_WEEKLY_PROSPECTS}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              fontSize: '14px',
              fontWeight: 600,
              backgroundColor: totalCount >= MAX_WEEKLY_PROSPECTS ? theme.colors.surface : theme.colors.accent,
              color: totalCount >= MAX_WEEKLY_PROSPECTS ? theme.colors.text.tertiary : theme.colors.background,
              border: 'none',
              borderRadius: theme.radius.md,
              cursor: totalCount >= MAX_WEEKLY_PROSPECTS ? 'not-allowed' : 'pointer',
              transition: `all ${theme.transitions.base}`,
              boxShadow: totalCount >= MAX_WEEKLY_PROSPECTS ? 'none' : theme.shadows.sm,
            }}
            onMouseEnter={(e) => {
              if (totalCount < MAX_WEEKLY_PROSPECTS) {
                e.currentTarget.style.backgroundColor = theme.colors.accentHover;
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = theme.shadows.md;
              }
            }}
            onMouseLeave={(e) => {
              if (totalCount < MAX_WEEKLY_PROSPECTS) {
                e.currentTarget.style.backgroundColor = theme.colors.accent;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = theme.shadows.sm;
              }
            }}
          >
            <PlusCircle size={16} />
            Add Priority
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: theme.spacing.xl, alignItems: 'flex-start' }}>
        {PRIORITY_STATUSES.map((status) => (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(status);
            }}
            onDragLeave={() => setDragOverColumn(null)}
          >
            <Column
              title={status}
              prospects={columns[status]}
              status={status}
              onDrop={handleDrop}
              isDragOver={dragOverColumn === status}
              totalCount={totalCount}
              onCardDragStart={handleCardDragStart}
              onCardDragEnd={handleCardDragEnd}
              draggingId={draggingId}
            />
          </div>
        ))}
      </div>

      <AddProspectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAdd={handleAddProspect}
        prospects={availableProspects}
        currentCount={totalCount}
      />
    </div>
  );
};

export default WeeklyPriorityDashboard;