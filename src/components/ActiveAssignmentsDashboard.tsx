// ============================================================================
// src/components/ActiveAssignmentsDashboard.tsx
// JONY IVE CLARITY: Every element earns its place
// Design system synchronized with ProspectsDashboard & SubmittalsDashboard
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import {
  Search, X, Phone, Mail, CheckCircle, ExternalLink, Calendar, Zap,
  Upload, RefreshCw, List, AlertCircle, Eye, LogOut, DollarSign
} from 'lucide-react';
import { AssignmentEmailModal } from './AssignmentEmailModal';
import { AssignmentDetailModal } from './AssignmentDetailModal';
import { Tooltip } from './shared/Tooltip';
import {
  useAssignments,
  useUpdateExtensionStage,
  useToggleAssignmentFlag,
  useImportAssignments,
  type ActiveAssignment,
} from '../lib/supabase/assignments';
import { assignmentToContract } from '../utils/modalTransformers';
import { trackEvent } from '../utils/telemetry';
import type { ActiveEmailModal, Contract, TemplateType } from '../types/email';

// ============================================================================
// DESIGN SYSTEM - Unified with all dashboards
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
    full: 'rounded-full',
  },
  transition: 'transition-all duration-150 ease-out',
};

// ============================================================================
// TYPES
// ============================================================================

type ExtensionStage = 'not_started' | 'outreach' | 'interested' | 'requested' | 'offer' | 'signed';
type ViewMode = 'pipeline' | 'week_kanban' | 'list';
type SpecialView = 'all' | 'requested' | 'retentions' | 'prestarts' | 'exiting';
type WeekBand = 'week_8_plus' | 'week_7' | 'week_6' | 'week_5_or_less';

interface WeekGroup {
  id: WeekBand;
  label: string;
  min: number;
  max: number;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const WEEK_GROUPS: WeekGroup[] = [
  { id: 'week_8_plus', label: '8+ Weeks', min: 50, max: Infinity },
  { id: 'week_7', label: '7 Weeks', min: 43, max: 49 },
  { id: 'week_6', label: '6 Weeks', min: 36, max: 42 },
  { id: 'week_5_or_less', label: '5 Weeks or Less', min: -Infinity, max: 35 },
];

// ============================================================================
// UTILITIES
// ============================================================================

const getWeekBand = (daysToEnd: number): WeekBand =>
  WEEK_GROUPS.find((g) => daysToEnd >= g.min && daysToEnd <= g.max)?.id || 'week_5_or_less';

const formatDate = (dateStr: string | null) =>
  dateStr
    ? new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : '—';

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
      { mode: 'pipeline', icon: Zap, label: 'Active' },
      { mode: 'week_kanban', icon: Calendar, label: 'Weeks' },
      { mode: 'list', icon: List, label: 'List' }
    ] as const).map(({ mode, icon: Icon, label }) => (
      <button
        key={mode}
        onClick={() => setViewMode(mode)}
        className={cn(
          `px-4 py-2 text-[11px] font-semibold ${DESIGN.radius.sm} ${DESIGN.transition} flex items-center gap-2`,
          viewMode === mode
            ? `bg-white text-slate-900 ${DESIGN.elevation.card}`
            : 'bg-transparent text-slate-500 hover:text-slate-800'
        )}
        aria-label={`${label} view`}
        aria-pressed={viewMode === mode}
      >
        <Icon size={14} strokeWidth={2.5} />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

// ============================================================================
// ASSIGNMENT CARD - Individual assignment
// ============================================================================

const AssignmentCard: React.FC<{
  assignment: ActiveAssignment;
  onMarkAsLooking: () => void;
  onMarkAsExiting: () => void;
  onEmail: () => void;
  onMarginApproval: () => void;
  onClick?: () => void;
  index: number;
}> = ({ assignment, onMarkAsLooking, onMarkAsExiting, onEmail, onMarginApproval, onClick, index }) => {
  const stop = (e: React.MouseEvent, fn?: () => void) => {
    e.stopPropagation();
    fn?.();
  };

  const isCritical = assignment.days_to_end <= 35;

  return (
    <div
      onClick={onClick}
      className={cn(
        `relative bg-${DESIGN.colors.bgCard} ${DESIGN.radius.sm} border p-4 cursor-pointer ${DESIGN.transition} group`,
        `hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-${DESIGN.colors.borderHover} hover:-translate-y-0.5`,
        isCritical ? 'border-red-200' : `border-${DESIGN.colors.border}`
      )}
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
      role="button"
      tabIndex={0}
      aria-label={`${assignment.candidate_name}, ${assignment.specialty || 'No specialty'}, ${assignment.days_to_end} days remaining`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className={`${DESIGN.text.value} truncate mb-0.5`}>
            {assignment.candidate_name}
          </h3>
          {assignment.specialty && (
            <p className={`${DESIGN.text.caption} truncate`}>
              {assignment.specialty}
            </p>
          )}
          {(assignment.is_exiting || assignment.is_looking_for_new_facility) && (
            <div className="mt-1">
              {assignment.is_exiting && (
                <span className={`${DESIGN.text.caption} font-semibold text-red-600`}>Exiting</span>
              )}
              {assignment.is_looking_for_new_facility && (
                <span className={`${DESIGN.text.caption} font-semibold text-blue-600`}>Retention</span>
              )}
            </div>
          )}
        </div>

        <span
          className={cn(
            `${DESIGN.text.value} font-semibold tabular-nums ml-3`,
            isCritical ? 'text-red-600' : 'text-slate-500'
          )}
        >
          {assignment.days_to_end}d
        </span>
      </div>

      {/* Quick Actions - Only visible on hover */}
      <div className={`flex items-center justify-between opacity-0 group-hover:opacity-100 ${DESIGN.transition}`}>
        <div className="flex items-center gap-1">
          {assignment.email && (
            <Tooltip content="Email">
              <button
                onClick={e => stop(e, onEmail)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Email"
              >
                <Mail size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
          <Tooltip content="Margin Approval">
            <button
              onClick={e => stop(e, onMarginApproval)}
              className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 ${DESIGN.transition}`}
              aria-label="Margin Approval"
            >
              <DollarSign size={14} strokeWidth={2.5} />
            </button>
          </Tooltip>
          {assignment.phone && (
            <Tooltip content="Call">
              <a
                href={`tel:${assignment.phone}`}
                onClick={e => stop(e)}
                className={`p-1.5 ${DESIGN.radius.sm} text-slate-400 hover:text-slate-600 hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Call"
              >
                <Phone size={14} strokeWidth={2} />
              </a>
            </Tooltip>
          )}
          {assignment.nova_url && (
            <Tooltip content="Nova">
              <a
                href={assignment.nova_url}
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
          <Tooltip content="Mark as Retention">
            <button
              onClick={e => stop(e, onMarkAsLooking)}
              className={cn(
                `p-1.5 ${DESIGN.radius.sm} ${DESIGN.transition}`,
                assignment.is_looking_for_new_facility
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              )}
              aria-label="Mark as Retention"
            >
              <Eye size={14} strokeWidth={2} />
            </button>
          </Tooltip>

          <Tooltip content="Mark as Exiting">
            <button
              onClick={e => stop(e, onMarkAsExiting)}
              className={cn(
                `p-1.5 ${DESIGN.radius.sm} ${DESIGN.transition}`,
                assignment.is_exiting
                  ? 'text-red-600 bg-red-50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              )}
              aria-label="Mark as Exiting"
            >
              <LogOut size={14} strokeWidth={2} />
            </button>
          </Tooltip>
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
  assignments: ActiveAssignment[];
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, a: ActiveAssignment) => void;
  onMarkAsLooking: (id: number) => void;
  onMarkAsExiting: (id: number) => void;
  onEmail: (assignment: ActiveAssignment) => void;
  onMarginApproval: (assignment: ActiveAssignment) => void;
  onCardClick?: (assignment: ActiveAssignment) => void;
  dropTarget?: boolean;
  color?: string;
  showUrgencyCount?: boolean;
  allowDragOut?: boolean;
}> = ({
  title,
  description,
  count,
  assignments,
  dropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onMarkAsLooking,
  onMarkAsExiting,
  onEmail,
  onMarginApproval,
  onCardClick,
  color,
  showUrgencyCount = false,
  allowDragOut = true,
}) => {
    const urgencyCount = showUrgencyCount
      ? assignments.filter((a) => a.days_to_end <= 49).length
      : 0;

    return (
      <div className="flex flex-col h-full">
        {/* Column Header */}
        <div className="mb-4 bg-gradient-to-b from-slate-50 to-transparent pb-3 sticky top-0 z-10">
          <div className="flex items-baseline gap-2 mb-1">
            {color && <div className={cn(`w-2 h-2 ${DESIGN.radius.full} shrink-0`, color)} />}
            <h3 className={`text-[12px] font-semibold tracking-tight text-slate-900`}>{title}</h3>
            <span className={`${DESIGN.text.caption} font-semibold tabular-nums`}>{count}</span>
            {showUrgencyCount && urgencyCount > 0 && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-orange-600">
                <Zap size={10} strokeWidth={2.5} />
                {urgencyCount}
              </span>
            )}
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
          {assignments.length > 0 ? (
            <div className="space-y-2">
              {assignments.map((a, i) => (
                <div
                  key={a.id}
                  draggable={allowDragOut}
                  onDragStart={(e) => allowDragOut && onDragStart(e, a)}
                  className={allowDragOut ? 'cursor-move' : ''}
                >
                  <AssignmentCard
                    assignment={a}
                    onMarkAsLooking={() => onMarkAsLooking(a.id)}
                    onMarkAsExiting={() => onMarkAsExiting(a.id)}
                    onEmail={() => onEmail(a)}
                    onMarginApproval={() => onMarginApproval(a)}
                    onClick={onCardClick ? () => onCardClick(a) : undefined}
                    index={i}
                  />
                </div>
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

export default function ActiveAssignmentsDashboard() {
  const navigate = useNavigate();

  // State
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [specialView, setSpecialView] = useState<SpecialView>('all');
  const [dragOver, setDragOver] = useState<ExtensionStage | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const [activeModal, setActiveModal] = useState<ActiveEmailModal>(null);
  const [contractData, setContractData] = useState<Contract | null>(null);
  const [emailTemplate, setEmailTemplate] = useState<TemplateType>('outreach');
  const [selectedAssignment, setSelectedAssignment] = useState<ActiveAssignment | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const newToast = { id: Date.now(), message: msg, type };
    setToast(newToast);
    setTimeout(() => {
      setToast(current => (current?.id === newToast.id ? null : current));
    }, 4000);
  }, []);

  const filters = useMemo(() => {
    const baseFilters: any = { search };
    if (specialView === 'requested') baseFilters.stage = 'requested';
    else if (specialView === 'retentions') baseFilters.looking = true;
    else if (specialView === 'exiting') baseFilters.exiting = true;
    return baseFilters;
  }, [search, specialView]);

  const { data: rawAssignments = [], isLoading, isError, refetch } = useAssignments(filters);
  const updateStageMutation = useUpdateExtensionStage();
  const toggleFlagMutation = useToggleAssignmentFlag();
  const importMutation = useImportAssignments();

  const assignments = useMemo(
    () => rawAssignments.filter((a) => a.id != null),
    [rawAssignments]
  );

  const handleFlagToggle = useCallback(
    (id: number, flagName: 'looking' | 'exiting') => {
      const assignment = assignments.find((a) => a.id === id);
      if (!assignment) {
        showToast('Assignment not found', 'error');
        return;
      }

      toggleFlagMutation.mutate(
        { id, flagName, flagValue: true },
        {
          onSuccess: () => {
            const destination = flagName === 'looking' ? '/submittals' : '/exits';
            showToast(
              `${assignment.candidate_name} marked as ${flagName === 'looking' ? 'retention' : 'exiting'}`,
              'success'
            );
            setTimeout(() => navigate(destination), 500);
          },
          onError: (error) => showToast(`Update failed: ${error.message}`, 'error'),
        }
      );
    },
    [assignments, toggleFlagMutation, showToast, navigate]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStage: ExtensionStage) => {
      e.preventDefault();
      setDragOver(null);

      try {
        const assignmentId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const assignment = assignments.find((a) => a.id === assignmentId);

        if (assignment && assignment.extension_stage !== targetStage) {
          updateStageMutation.mutate(
            { id: assignment.id, newStage: targetStage },
            {
              onSuccess: () => {
                const stageLabels = {
                  outreach: 'Outreach',
                  interested: 'Interested',
                  not_started: 'Not Started',
                };
                showToast(
                  `Moved to ${stageLabels[targetStage as keyof typeof stageLabels] || targetStage}`,
                  'success'
                );
              },
              onError: (error) => showToast(`Move failed: ${error.message}`, 'error'),
            }
          );
        }
      } catch (error) {
        console.error('[Drop]', error);
        showToast('Failed to move', 'error');
      }
    },
    [assignments, updateStageMutation, showToast]
  );

  const handleDragStart = (e: React.DragEvent, assignment: ActiveAssignment) => {
    if (assignment?.id == null) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', assignment.id.toString());
  };

  const handleImport = useCallback(() => {
    if (!importData.trim()) {
      showToast('Please paste data to import', 'error');
      return;
    }

    importMutation.mutate(importData, {
      onSuccess: (result) => {
        showToast(`Imported ${result.imported} assignments`, 'success');
        setShowImport(false);
        setImportData('');
      },
      onError: (error) => showToast(`Import failed: ${error.message}`, 'error'),
    });
  }, [importData, importMutation, showToast]);

  const openEmailModal = useCallback(
    (assignment: ActiveAssignment, template: TemplateType = 'outreach') => {
      if (activeModal !== null) return;

      const contract = assignmentToContract(assignment as any);
      setContractData(contract);
      setEmailTemplate(template);
      setActiveModal('assignment');

      trackEvent('email_modal_opened', {
        kind: 'assignment',
        route: 'active_assignments',
        template,
        candidate_id: assignment.candidate_id,
      });
    },
    [activeModal]
  );

  const handleCloseModal = useCallback(() => {
    setActiveModal(null);
    setTimeout(() => {
      setContractData(null);
    }, 300);
  }, []);

  const handleCardClick = useCallback((assignment: ActiveAssignment) => {
    setSelectedAssignment(assignment);
    trackEvent('assignment_detail_opened', {
      candidate_id: assignment.candidate_id,
      days_to_end: assignment.days_to_end,
    });
  }, []);

  const stats = useMemo(() => {
    return {
      all: assignments.filter(
        (a) => !a.is_looking_for_new_facility && !a.is_exiting
      ).length,
      requested: assignments.filter(
        (a) =>
          a.extension_stage === 'requested' &&
          !a.is_looking_for_new_facility &&
          !a.is_exiting
      ).length,
      retentions: assignments.filter(
        (a) =>
          a.is_looking_for_new_facility &&
          !['SIGNED', 'signed', 'ACTIVE_SIGNED', 'PRESTART'].includes(a.extension_stage)
      ).length,
      prestarts: assignments.filter((a) =>
        ['SIGNED', 'signed', 'ACTIVE_SIGNED', 'PRESTART'].includes(a.extension_stage)
      ).length,
      exiting: assignments.filter((a) => a.is_exiting).length,
    };
  }, [assignments]);

  const pipelineCategories = useMemo(() => {
    const active: ActiveAssignment[] = [];
    const endingSoon: ActiveAssignment[] = [];
    const outreach: ActiveAssignment[] = [];
    const interested: ActiveAssignment[] = [];

    let filteredAssignments = assignments.filter(
      (a) => !a.is_looking_for_new_facility && !a.is_exiting
    );

    filteredAssignments = filteredAssignments.filter(
      (a) =>
        !['requested', 'offer', 'signed', 'SIGNED', 'ACTIVE_SIGNED', 'PRESTART', 'extension_approved'].includes(
          a.extension_stage
        )
    );

    filteredAssignments.forEach((assignment) => {
      if (assignment.extension_stage === 'outreach') {
        outreach.push(assignment);
      } else if (assignment.extension_stage === 'interested') {
        interested.push(assignment);
      } else if (assignment.days_to_end <= 56) {
        endingSoon.push(assignment);
      } else {
        active.push(assignment);
      }
    });

    return { active, endingSoon, outreach, interested };
  }, [assignments]);

  const byWeek = useMemo(() => {
    let filteredAssignments = assignments.filter(
      (a) => !a.is_looking_for_new_facility && !a.is_exiting
    );

    filteredAssignments = filteredAssignments.filter(
      (a) => !['signed', 'SIGNED', 'ACTIVE_SIGNED', 'PRESTART', 'extension_approved'].includes(a.extension_stage)
    );

    return WEEK_GROUPS.reduce(
      (acc, week) => ({
        ...acc,
        [week.id]: filteredAssignments.filter(
          (a) => getWeekBand(a.days_to_end) === week.id
        ),
      }),
      {} as Record<WeekBand, ActiveAssignment[]>
    );
  }, [assignments]);

  const renderContent = () => {
    if (isLoading && assignments.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex h-full items-center justify-center flex-col">
          <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
          <p className="font-semibold text-red-800">Error loading data</p>
        </div>
      );
    }

    if (viewMode === 'pipeline') {
      return (
        <div className="grid grid-cols-4 gap-4 h-[calc(100vh-280px)]">
          <div className="h-full overflow-hidden">
            <KanbanColumn
              title="Active"
              description="Currently working"
              count={pipelineCategories.active.length}
              assignments={pipelineCategories.active}
              onDragStart={handleDragStart}
              onMarkAsLooking={(id) => handleFlagToggle(id, 'looking')}
              onMarkAsExiting={(id) => handleFlagToggle(id, 'exiting')}
              onEmail={(a) => openEmailModal(a, 'outreach')}
              onMarginApproval={(a) => openEmailModal(a, 'margin_approval')}
              onCardClick={handleCardClick}
              allowDragOut={true}
              color="bg-slate-500"
            />
          </div>

          <div className="h-full overflow-hidden">
            <KanbanColumn
              title="Ending Soon"
              description="8 weeks or less"
              count={pipelineCategories.endingSoon.length}
              assignments={pipelineCategories.endingSoon}
              onDragStart={handleDragStart}
              onMarkAsLooking={(id) => handleFlagToggle(id, 'looking')}
              onMarkAsExiting={(id) => handleFlagToggle(id, 'exiting')}
              onEmail={(a) => openEmailModal(a, 'extension_request')}
              onMarginApproval={(a) => openEmailModal(a, 'margin_approval')}
              onCardClick={handleCardClick}
              allowDragOut={true}
              color="bg-amber-500"
            />
          </div>

          <div className="h-full overflow-hidden">
            <KanbanColumn
              title="Outreach"
              description="Extension contacted"
              count={pipelineCategories.outreach.length}
              assignments={pipelineCategories.outreach}
              dropTarget={dragOver === 'outreach'}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver('outreach');
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, 'outreach')}
              onDragStart={handleDragStart}
              onMarkAsLooking={(id) => handleFlagToggle(id, 'looking')}
              onMarkAsExiting={(id) => handleFlagToggle(id, 'exiting')}
              onEmail={(a) => openEmailModal(a, 'outreach')}
              onMarginApproval={(a) => openEmailModal(a, 'margin_approval')}
              onCardClick={handleCardClick}
              allowDragOut={true}
              color="bg-blue-500"
            />
          </div>

          <div className="h-full overflow-hidden">
            <KanbanColumn
              title="Interested"
              description="Positive response"
              count={pipelineCategories.interested.length}
              assignments={pipelineCategories.interested}
              dropTarget={dragOver === 'interested'}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver('interested');
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, 'interested')}
              onDragStart={handleDragStart}
              onMarkAsLooking={(id) => handleFlagToggle(id, 'looking')}
              onMarkAsExiting={(id) => handleFlagToggle(id, 'exiting')}
              onEmail={(a) => openEmailModal(a, 'extension_request')}
              onMarginApproval={(a) => openEmailModal(a, 'margin_approval')}
              onCardClick={handleCardClick}
              allowDragOut={true}
              color="bg-cyan-500"
            />
          </div>
        </div>
      );
    }

    if (viewMode === 'week_kanban') {
      return (
        <div className="grid grid-cols-4 gap-6 h-[calc(100vh-280px)]">
          {WEEK_GROUPS.map((week) => (
            <div key={week.id} className="h-full overflow-hidden">
              <KanbanColumn
                title={week.label}
                count={byWeek[week.id]?.length || 0}
                assignments={byWeek[week.id] || []}
                onDragStart={handleDragStart}
                onMarkAsLooking={(id) => handleFlagToggle(id, 'looking')}
                onMarkAsExiting={(id) => handleFlagToggle(id, 'exiting')}
                onEmail={(a) => openEmailModal(a, 'extension_request')}
                onMarginApproval={(a) => openEmailModal(a, 'margin_approval')}
                onCardClick={handleCardClick}
                showUrgencyCount={true}
              />
            </div>
          ))}
        </div>
      );
    }

    if (viewMode === 'list') {
      let listAssignments = assignments;

      if (specialView === 'all') {
        listAssignments = assignments.filter(
          (a) => !a.is_looking_for_new_facility && !a.is_exiting
        );
      } else if (specialView === 'requested') {
        listAssignments = assignments.filter(
          (a) =>
            a.extension_stage === 'requested' &&
            !a.is_looking_for_new_facility &&
            !a.is_exiting
        );
      } else if (specialView === 'retentions') {
        listAssignments = assignments.filter(
          (a) =>
            a.is_looking_for_new_facility &&
            !['SIGNED', 'signed', 'ACTIVE_SIGNED', 'PRESTART'].includes(a.extension_stage)
        );
      } else if (specialView === 'prestarts') {
        listAssignments = assignments.filter((a) =>
          ['SIGNED', 'signed', 'ACTIVE_SIGNED', 'PRESTART'].includes(a.extension_stage)
        );
      } else if (specialView === 'exiting') {
        listAssignments = assignments.filter((a) => a.is_exiting);
      }

      return (
        <div className={`bg-${DESIGN.colors.bgCard} ${DESIGN.radius.md} border border-${DESIGN.colors.border}/80 overflow-hidden animate-fadeInUp`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`bg-${DESIGN.colors.bgSubtle} border-b border-${DESIGN.colors.border}/80`}>
                <tr>
                  {['Candidate', 'Specialty', 'Facility', 'Ends', 'Days', 'Stage', 'Actions'].map((h) => (
                    <th key={h} className={`text-left px-4 py-2.5 ${DESIGN.text.label}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y divide-${DESIGN.colors.border}`}>
                {listAssignments.map((a) => (
                  <tr
                    key={a.id}
                    className={`hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition} group cursor-pointer`}
                    onClick={() => handleCardClick(a)}
                  >
                    <td className={`px-4 py-3 ${DESIGN.text.value}`}>
                      {a.candidate_name}
                    </td>
                    <td className={`px-4 py-3 ${DESIGN.text.body}`}>
                      {a.specialty || '—'}
                    </td>
                    <td className={`px-4 py-3 ${DESIGN.text.body} max-w-xs truncate`}>
                      {a.facility_name}
                    </td>
                    <td className={`px-4 py-3 ${DESIGN.text.body}`}>{formatDate(a.end_date)}</td>
                    <td className={`px-4 py-3 ${DESIGN.text.value} tabular-nums`}>
                      {a.days_to_end}d
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        `inline-flex items-center px-2.5 py-1 ${DESIGN.radius.sm} text-[11px] font-semibold`,
                        (a.extension_stage === 'signed' || a.extension_stage === 'SIGNED' || a.extension_stage === 'ACTIVE_SIGNED') && 'bg-emerald-50 text-emerald-700',
                        a.extension_stage === 'PRESTART' && 'bg-purple-50 text-purple-700',
                        a.extension_stage === 'offer' && 'bg-purple-50 text-purple-700',
                        a.extension_stage === 'requested' && 'bg-amber-50 text-amber-700',
                        a.extension_stage === 'extension_approved' && 'bg-green-50 text-green-700',
                        a.extension_stage === 'interested' && 'bg-cyan-50 text-cyan-700',
                        a.extension_stage === 'outreach' && 'bg-blue-50 text-blue-700',
                        a.extension_stage === 'not_started' && 'bg-slate-100 text-slate-700'
                      )}>
                        {a.extension_stage}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {a.email && (
                          <Tooltip content="Email" delay={300}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEmailModal(a, 'outreach');
                              }}
                              className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-slate-100 hover:text-slate-600 ${DESIGN.transition}`}
                              aria-label="Email"
                            >
                              <Mail size={16} strokeWidth={2} />
                            </button>
                          </Tooltip>
                        )}
                        {a.nova_url && (
                          <Tooltip content="Nova" delay={300}>
                            <a
                              href={a.nova_url}
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
                        <Tooltip content="Retention" delay={300}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFlagToggle(a.id, 'looking');
                            }}
                            className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-blue-50 hover:text-blue-600 ${DESIGN.transition}`}
                            aria-label="Mark as Retention"
                          >
                            <Eye size={16} strokeWidth={2} />
                          </button>
                        </Tooltip>
                        <Tooltip content="Exiting" delay={300}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFlagToggle(a.id, 'exiting');
                            }}
                            className={`p-2 ${DESIGN.radius.sm} text-slate-400 hover:bg-red-50 hover:text-red-600 ${DESIGN.transition}`}
                            aria-label="Mark as Exiting"
                          >
                            <LogOut size={16} strokeWidth={2} />
                          </button>
                        </Tooltip>
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
              label="All Active"
              value={stats.all}
              onClick={() => {
                setSpecialView('all');
                setViewMode('list');
              }}
              isActive={specialView === 'all'}
            />
            <StatWidget
              label="Requested"
              value={stats.requested}
              onClick={() => {
                setSpecialView('requested');
                setViewMode('list');
              }}
              isActive={specialView === 'requested'}
            />
            <StatWidget
              label="Retention"
              value={stats.retentions}
              onClick={() => {
                setSpecialView('retentions');
                setViewMode('list');
              }}
              isActive={specialView === 'retentions'}
            />
            <StatWidget
              label="Prestarts"
              value={stats.prestarts}
              onClick={() => {
                setSpecialView('prestarts');
                setViewMode('list');
              }}
              isActive={specialView === 'prestarts'}
            />
            <StatWidget
              label="Exiting"
              value={stats.exiting}
              onClick={() => {
                setSpecialView('exiting');
                setViewMode('list');
              }}
              isActive={specialView === 'exiting'}
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

              {/* Import */}
              <Tooltip content="Import">
                <button
                  onClick={() => setShowImport(true)}
                  className={`p-2.5 ${DESIGN.radius.sm} text-slate-500 hover:bg-${DESIGN.colors.bgSubtle} hover:text-slate-800 ${DESIGN.transition}`}
                  aria-label="Import"
                >
                  <Upload size={18} strokeWidth={2} />
                </button>
              </Tooltip>

              {/* Refresh */}
              <Tooltip content="Refresh">
                <button
                  onClick={() => refetch()}
                  className={`p-2.5 ${DESIGN.radius.sm} text-slate-500 hover:bg-${DESIGN.colors.bgSubtle} hover:text-slate-800 ${DESIGN.transition}`}
                  aria-label="Refresh"
                >
                  <RefreshCw size={18} className={cn(isLoading && 'animate-spin')} strokeWidth={2} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-hidden">{renderContent()}</main>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fadeIn">
          <div className={`relative w-full max-w-3xl bg-white ${DESIGN.radius.md} ${DESIGN.elevation.modal} border-${DESIGN.colors.border}/80 animate-scaleIn`}>
            <div className={`p-6 border-b border-${DESIGN.colors.border} flex items-center justify-between`}>
              <div>
                <h2 className={DESIGN.text.heading}>Import Assignments</h2>
                <p className={`${DESIGN.text.body} mt-1`}>
                  Paste tab-separated data
                </p>
              </div>
              <button
                onClick={() => setShowImport(false)}
                className={`p-2 ${DESIGN.radius.full} hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
                aria-label="Close"
              >
                <X size={20} className="text-slate-400" strokeWidth={2} />
              </button>
            </div>
            <div className="p-6">
              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder="CandidateID	Name	StartDate	EndDate..."
                className={`w-full h-80 p-4 text-[13px] font-mono bg-${DESIGN.colors.bgSubtle} border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-slate-800 resize-none`}
              />
            </div>
            <div className={`p-6 bg-${DESIGN.colors.bgSubtle}/70 border-t border-${DESIGN.colors.border} flex justify-end gap-3 ${DESIGN.radius.md}`}>
              <button
                onClick={() => setShowImport(false)}
                className={`px-4 py-2 text-[13px] font-semibold ${DESIGN.radius.sm} border border-${DESIGN.colors.border} text-slate-700 bg-white hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition}`}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importData.trim() || importMutation.isPending}
                className={cn(
                  `px-4 py-2 text-[13px] font-semibold ${DESIGN.radius.sm} text-white ${DESIGN.transition} flex items-center gap-2`,
                  !importData.trim() || importMutation.isPending
                    ? 'bg-slate-300 cursor-not-allowed'
                    : `bg-${DESIGN.colors.primary} hover:bg-${DESIGN.colors.primaryHover}`
                )}
              >
                {importMutation.isPending ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={16} strokeWidth={2.5} />
                    Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {activeModal === 'assignment' && contractData && (
        <AssignmentEmailModal
          isOpen={true}
          contract={contractData}
          initialTab={emailTemplate}
          onClose={handleCloseModal}
          showToast={showToast}
        />
      )}

      {selectedAssignment && (
        <AssignmentDetailModal
          isOpen={true}
          onClose={() => setSelectedAssignment(null)}
          assignment={selectedAssignment}
          onToggleRetention={(id) => handleFlagToggle(id, 'looking')}
          onToggleExiting={(id) => handleFlagToggle(id, 'exiting')}
          onEmail={(a) => openEmailModal(a, 'extension_request')}
          onUpdateStage={(id, stage) => {
            updateStageMutation.mutate({ id, newStage: stage }, {
              onSuccess: () => refetch(),
            });
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
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
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn { animation: fadeIn 0.15s ease-out; }
        .animate-fadeInUp { animation: fadeInUp 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.2s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.15s ease-out; }
        
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