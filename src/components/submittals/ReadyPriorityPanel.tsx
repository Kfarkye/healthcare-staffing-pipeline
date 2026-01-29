// ============================================================================
// src/components/submittals/ReadyPriorityPanel.tsx
// Simplified Priority Panel - Pure Presentation Component
// ============================================================================

import React, { useMemo } from 'react';
import { Star, Clock, Mail, Phone, ExternalLink } from 'lucide-react';
import { Tooltip } from '../shared/Tooltip';
import { getUrgencyLevel, getUrgencyIndicator } from '../../hooks/useSortedCandidates';
import { SourceBadge } from '../../shared/components/Badge';
import type { ClinicianRow } from '../../types/submittals';

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

interface PriorityColumn {
  id: string;
  title: string;
  description: string;
  tabs: string[]; // Which main tabs this column represents
  candidates: ClinicianRow[];
}

const MAX_PRIORITY_SLOTS = 15;

interface ReadyPriorityPanelProps {
  priorityCandidates?: ClinicianRow[];
  onTogglePriority?: (row: ClinicianRow) => void;
  onSelectRow?: (row: ClinicianRow) => void;
  onOpenEmail?: (row: ClinicianRow) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function ReadyPriorityPanel({
  priorityCandidates = [],
  onTogglePriority,
  onSelectRow,
  onOpenEmail,
  showToast,
}: ReadyPriorityPanelProps) {
  // Group priority candidates by their actual pipeline stage
  const columns: PriorityColumn[] = useMemo(() => {
    const pipeline = priorityCandidates.filter(c =>
      c.tab === 'READY' || c.tab === 'SUBMITTED'
    );
    const offer = priorityCandidates.filter(c => c.tab === 'OFFER');
    const signed = priorityCandidates.filter(c => c.tab === 'PRESTART');

    return [
      {
        id: 'pipeline',
        title: 'Priority Pipeline',
        description: 'Ready & Submitted stages',
        tabs: ['READY', 'SUBMITTED'],
        candidates: pipeline,
      },
      {
        id: 'offer',
        title: 'Priority Offer',
        description: 'Offer stage',
        tabs: ['OFFER'],
        candidates: offer,
      },
      {
        id: 'signed',
        title: 'Priority Signed',
        description: 'Prestart stage',
        tabs: ['PRESTART'],
        candidates: signed,
      },
    ];
  }, [priorityCandidates]);

  const totalPriority = priorityCandidates.length;
  const availableSlots = MAX_PRIORITY_SLOTS - totalPriority;

  if (priorityCandidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-4">
          <Star size={32} className="text-amber-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Priority Candidates Yet</h3>
        <p className="text-sm text-slate-500 text-center max-w-md mb-6">
          Click the star icon on any prospect card to add them to your weekly priority list.
          Focus on up to 15 candidates at a time.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-sm text-slate-600">
            <span className="font-bold text-slate-900">{availableSlots}</span> slots available
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-lg font-semibold text-slate-900">Weekly Priority</h2>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200/60">
              <Star size={14} className="text-amber-600 fill-amber-600" />
              <span className="text-sm font-bold text-amber-700">
                {totalPriority} / {MAX_PRIORITY_SLOTS} slots
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Filtered view of priority candidates across all pipeline stages • Click stars to remove
          </p>
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-3 gap-6">
        {columns.map((column) => (
          <div key={column.id} className="flex flex-col">
            {/* Column Header */}
            <div className="mb-4 pb-3 border-b border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-900">{column.title}</h3>
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-bold bg-slate-900 text-white">
                  {column.candidates.length}
                </span>
              </div>
              <p className="text-xs text-slate-500">{column.description}</p>
            </div>

            {/* Column Cards */}
            <div className="space-y-3 flex-1">
              {column.candidates.length === 0 ? (
                <div className="flex items-center justify-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-xs text-slate-400 text-center">
                    No priority candidates<br />in this stage
                  </p>
                </div>
              ) : (
                column.candidates.map((candidate) => (
                  <PriorityCard
                    key={candidate.candidate_id}
                    candidate={candidate}
                    onRemove={() => onTogglePriority?.(candidate)}
                    onSelect={() => onSelectRow?.(candidate)}
                    onOpenEmail={() => onOpenEmail?.(candidate)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PRIORITY CARD COMPONENT
// ============================================================================

const PriorityCard: React.FC<{
  candidate: ClinicianRow;
  onRemove: () => void;
  onSelect: () => void;
  onOpenEmail: () => void;
}> = ({ candidate, onRemove, onSelect, onOpenEmail }) => {
  const urgencyLevel = getUrgencyLevel(candidate.days_since_submitted);
  const urgency = getUrgencyIndicator(urgencyLevel);

  return (
    <div
      onClick={onSelect}
      className="group relative p-4 bg-white border-2 border-amber-200/60 rounded-xl hover:shadow-md transition-all duration-200 cursor-pointer"
    >
      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white hover:bg-amber-50 border border-amber-200 opacity-0 group-hover:opacity-100 transition-all duration-200"
        aria-label="Remove from priority"
      >
        <Star size={14} className="text-amber-500 fill-amber-500" />
      </button>

      {/* Card Content */}
      <div className="pr-8">
        <div className="flex items-start gap-2 mb-2">
          <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 truncate">
              {candidate.full_name}
            </h4>
            <p className="text-xs text-slate-500 truncate">
              {candidate.primary_specialty || candidate.engagement_specialty || '—'}
            </p>
          </div>
        </div>

        {/* Facility */}
        {candidate.facility_name && (
          <p className="text-xs text-slate-400 mb-3 truncate">
            {candidate.facility_name}
          </p>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SourceBadge
              sourceType={candidate.source_type}
              isActiveSubmittal={candidate.is_active_submittal}
            />

            {candidate.days_since_submitted != null && candidate.days_since_submitted > 0 && (
              <div className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold",
                urgency ? `${urgency.color} text-white` : 'bg-slate-100 text-slate-600'
              )}>
                <Clock size={11} />
                <span className="tabular-nums">{candidate.days_since_submitted}d</span>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {candidate.email && (
              <Tooltip content="Email" delay={300}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEmail();
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  aria-label="Email"
                >
                  <Mail size={14} />
                </button>
              </Tooltip>
            )}
            {candidate.phone && (
              <Tooltip content="Call" delay={300}>
                <a
                  href={`tel:${candidate.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Call"
                >
                  <Phone size={14} />
                </a>
              </Tooltip>
            )}
            {candidate.nova_url && (
              <Tooltip content="Nova" delay={300}>
                <a
                  href={candidate.nova_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Nova"
                >
                  <ExternalLink size={14} />
                </a>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};