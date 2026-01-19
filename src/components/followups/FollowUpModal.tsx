// ============================================================================
// Follow-Up Modal Component
// ============================================================================

import { useState } from 'react';
import { X, Calendar, Clock, User } from 'lucide-react';
import { useCreateFollowUp } from '../../hooks/useFollowUps';
import { getSuggestedDates, validateFollowUpDate } from '../../lib/followUpUtils';
import type { FollowUpType } from '../../types/followUps';

interface FollowUpModalProps {
  candidateId: number;
  candidateName: string;
  onClose: () => void;
}

export function FollowUpModal({ candidateId, candidateName, onClose }: FollowUpModalProps) {
  const [type, setType] = useState<FollowUpType>('active');
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const createFollowUp = useCreateFollowUp();
  const suggestedDates = getSuggestedDates();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!scheduledDate) {
      setError('Please select a date');
      return;
    }

    const validation = validateFollowUpDate(scheduledDate);
    if (!validation.valid) {
      setError(validation.error || 'Invalid date');
      return;
    }

    try {
      await createFollowUp.mutateAsync({
        candidate_id: candidateId,
        follow_up_type: type,
        scheduled_date: scheduledDate,
        notes: notes.trim() || undefined,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create follow-up');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Schedule Follow-Up</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-600">
              <User className="w-4 h-4" />
              <span>{candidateName}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Follow-Up Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('active')}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  type === 'active'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="font-medium">Active</div>
                <div className="text-xs mt-1 opacity-75">Ongoing engagement</div>
              </button>
              <button
                type="button"
                onClick={() => setType('rotation')}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  type === 'rotation'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="font-medium">Rotation</div>
                <div className="text-xs mt-1 opacity-75">Next assignment</div>
              </button>
            </div>
          </div>

          {/* Date Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Scheduled Date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />

            {/* Quick Date Buttons */}
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedDates.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  onClick={() => setScheduledDate(suggestion.date)}
                  className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context for this follow-up..."
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createFollowUp.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {createFollowUp.isPending ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Schedule Follow-Up'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
