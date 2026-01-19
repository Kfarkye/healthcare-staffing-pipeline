// src/shared/components/StatsBar.tsx
import React from 'react';

interface StatsBarProps {
  stats: {
    total: number;
    new: number;
    interested: number;
    submitted: number;
    filtered?: number;
  };
}

// ✅ MAKE SURE THIS EXPORT EXISTS
export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-[1400px] mx-auto px-6 py-3">
        <div className="flex items-center gap-8">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900">{stats.total}</span>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total</span>
          </div>
          
          <div className="h-6 w-px bg-gray-200" />
          
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-medium text-gray-700">{stats.new}</span>
            <span className="text-xs text-gray-500">New</span>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-medium text-gray-700">{stats.interested}</span>
            <span className="text-xs text-gray-500">Interested</span>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-medium text-gray-700">{stats.submitted}</span>
            <span className="text-xs text-gray-500">Submitted</span>
          </div>
          
          {stats.filtered !== undefined && stats.filtered < stats.total && (
            <>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-gray-600">
                  Showing {stats.filtered} of {stats.total}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};