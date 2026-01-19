// ============================================================================
// New Follow-Up Dashboard - Simplified Modern Implementation
// ============================================================================

import { useState } from 'react';
import { Calendar, Plus, Filter as FilterIcon } from 'lucide-react';
import { usePendingFollowUps } from '../hooks/useFollowUps';
import { FollowUpPanel } from './followups/FollowUpPanel';
import { FollowUpModal } from './followups/FollowUpModal';
import { calculateFollowUpStats } from '../lib/followUpUtils';
import type { FollowUpType } from '../types/followUps';

export default function NewFollowUpDashboard() {
  const { data: followUps = [], isLoading, error } = usePendingFollowUps();
  const [showModal, setShowModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FollowUpType | 'all'>('all');

  const stats = calculateFollowUpStats(followUps);

  const handleCloseModal = () => {
    setShowModal(false);
  };

  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-600">Loading follow-ups...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p className="font-semibold mb-2">Failed to load follow-ups</p>
          <p className="text-sm text-slate-600">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-7 h-7 text-blue-600" />
              Follow-Up Calendar
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage all candidate follow-ups and reminders
            </p>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <StatCard
            label="Total"
            value={stats.total}
            color="slate"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            color="red"
          />
          <StatCard
            label="Due Today"
            value={stats.today}
            color="blue"
          />
          <StatCard
            label="Upcoming"
            value={stats.upcoming}
            color="amber"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <FilterIcon className="w-4 h-4 text-slate-600" />
          <div className="flex gap-2">
            <FilterButton
              label="All"
              active={typeFilter === 'all'}
              count={followUps.length}
              onClick={() => setTypeFilter('all')}
            />
            <FilterButton
              label="Active"
              active={typeFilter === 'active'}
              count={stats.byType.active}
              onClick={() => setTypeFilter('active')}
            />
            <FilterButton
              label="Rotation"
              active={typeFilter === 'rotation'}
              count={stats.byType.rotation}
              onClick={() => setTypeFilter('rotation')}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full max-w-2xl mx-auto">
          <FollowUpPanel />
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <FollowUpModal
          candidateId={0}
          candidateName="New Follow-Up"
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color: 'slate' | 'red' | 'blue' | 'amber';
}

function StatCard({ label, value, color }: StatCardProps) {
  const colorClasses = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  };

  return (
    <div className={`rounded-lg border-2 p-4 ${colorClasses[color]}`}>
      <div className="text-sm font-medium opacity-75">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

interface FilterButtonProps {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}

function FilterButton({ label, active, count, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
      }`}
    >
      {label} ({count})
    </button>
  );
}
