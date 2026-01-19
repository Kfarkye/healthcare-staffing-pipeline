// ============================================================================
// Follow-Up Panel Component
// ============================================================================

import { useState, useMemo } from 'react';
import { Calendar, Check, Clock, MoreVertical, X, Edit2, Trash2, ExternalLink } from 'lucide-react';
import {
  usePendingFollowUps,
  useCompleteFollowUp,
  useRescheduleFollowUp,
  useDeleteFollowUp,
} from '../../hooks/useFollowUps';
import {
  sortFollowUpsByPriority,
  getFollowUpStatus,
  getBadgeClasses,
  formatFollowUpDate,
  calculateFollowUpStats,
  getSuggestedDates,
} from '../../lib/followUpUtils';
import type { FollowUpDashboard } from '../../types/followUps';

export function FollowUpPanel() {
  const { data: followUps = [], isLoading, error } = usePendingFollowUps();
  const completeFollowUp = useCompleteFollowUp();
  const rescheduleFollowUp = useRescheduleFollowUp();
  const deleteFollowUp = useDeleteFollowUp();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');

  const sortedFollowUps = useMemo(
    () => sortFollowUpsByPriority(followUps),
    [followUps]
  );

  const stats = useMemo(
    () => calculateFollowUpStats(followUps),
    [followUps]
  );

  const handleComplete = async (id: string) => {
    try {
      await completeFollowUp.mutateAsync(id);
    } catch (err) {
      console.error('Failed to complete follow-up:', err);
    }
  };

  const handleReschedule = async (id: string) => {
    if (!newDate) return;

    try {
      await rescheduleFollowUp.mutateAsync({ followUpId: id, newDate });
      setRescheduleId(null);
      setNewDate('');
    } catch (err) {
      console.error('Failed to reschedule follow-up:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;

    try {
      await deleteFollowUp.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete follow-up:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/2"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="text-center text-red-600">
          <p className="font-medium">Failed to load follow-ups</p>
          <p className="text-sm text-slate-600 mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          Follow-Ups
        </h2>

        {/* Stats */}
        <div className="flex gap-4 mt-3 text-sm">
          <div>
            <span className="text-slate-600">Overdue:</span>{' '}
            <span className="font-semibold text-red-600">{stats.overdue}</span>
          </div>
          <div>
            <span className="text-slate-600">Today:</span>{' '}
            <span className="font-semibold text-blue-600">{stats.today}</span>
          </div>
          <div>
            <span className="text-slate-600">Upcoming:</span>{' '}
            <span className="font-semibold text-slate-600">{stats.upcoming}</span>
          </div>
        </div>
      </div>

      {/* Follow-Ups List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {sortedFollowUps.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No pending follow-ups</p>
            <p className="text-sm text-slate-500 mt-1">You're all caught up!</p>
          </div>
        ) : (
          sortedFollowUps.map((followUp) => (
            <FollowUpCard
              key={followUp.id}
              followUp={followUp}
              isExpanded={expandedId === followUp.id}
              isRescheduling={rescheduleId === followUp.id}
              newDate={newDate}
              onToggleExpand={() =>
                setExpandedId(expandedId === followUp.id ? null : followUp.id)
              }
              onComplete={() => handleComplete(followUp.id)}
              onStartReschedule={() => {
                setRescheduleId(followUp.id);
                setNewDate(followUp.scheduled_date);
              }}
              onCancelReschedule={() => {
                setRescheduleId(null);
                setNewDate('');
              }}
              onReschedule={() => handleReschedule(followUp.id)}
              onDelete={() => handleDelete(followUp.id)}
              onDateChange={setNewDate}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface FollowUpCardProps {
  followUp: FollowUpDashboard;
  isExpanded: boolean;
  isRescheduling: boolean;
  newDate: string;
  onToggleExpand: () => void;
  onComplete: () => void;
  onStartReschedule: () => void;
  onCancelReschedule: () => void;
  onReschedule: () => void;
  onDelete: () => void;
  onDateChange: (date: string) => void;
}

function FollowUpCard({
  followUp,
  isExpanded,
  isRescheduling,
  newDate,
  onToggleExpand,
  onComplete,
  onStartReschedule,
  onCancelReschedule,
  onReschedule,
  onDelete,
  onDateChange,
}: FollowUpCardProps) {
  const status = getFollowUpStatus(followUp.scheduled_date);
  const badgeClasses = getBadgeClasses(status);
  const suggestedDates = getSuggestedDates();

  return (
    <div className="border border-slate-200 rounded-lg hover:shadow-md transition-shadow bg-white">
      <div className="p-4">
        {/* Main Content */}
        <div className="flex items-start gap-3">
          {/* Complete Button */}
          <button
            onClick={onComplete}
            className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-slate-300 hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center group"
            aria-label="Complete follow-up"
          >
            <Check className="w-3 h-3 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-slate-900 truncate">
                  {followUp.candidate_name}
                </h3>
                <p className="text-sm text-slate-600 truncate">
                  {followUp.candidate_specialty || followUp.candidate_profession}
                </p>
              </div>

              <button
                onClick={onToggleExpand}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>

            {/* Date & Type */}
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-1 rounded border ${badgeClasses}`}>
                {formatFollowUpDate(followUp.scheduled_date)}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {followUp.follow_up_type === 'active' ? 'Active' : 'Rotation'}
              </span>
            </div>

            {/* Notes */}
            {followUp.notes && (
              <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                {followUp.notes}
              </p>
            )}
          </div>
        </div>

        {/* Expanded Actions */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            {/* Reschedule Section */}
            {isRescheduling ? (
              <div className="space-y-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => onDateChange(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-wrap gap-1">
                  {suggestedDates.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      onClick={() => onDateChange(suggestion.date)}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onReschedule}
                    className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={onCancelReschedule}
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={onStartReschedule}
                  className="flex-1 px-3 py-2 text-sm flex items-center justify-center gap-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                  Reschedule
                </button>
                {followUp.candidate_nova_url && (
                  <a
                    href={followUp.candidate_nova_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-3 py-2 text-sm flex items-center justify-center gap-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open Nova
                  </a>
                )}
                <button
                  onClick={onDelete}
                  className="px-3 py-2 text-sm flex items-center justify-center gap-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Contact Info */}
            <div className="text-xs text-slate-600 space-y-1">
              {followUp.candidate_email && (
                <div>Email: {followUp.candidate_email}</div>
              )}
              {followUp.candidate_phone && (
                <div>Phone: {followUp.candidate_phone}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
