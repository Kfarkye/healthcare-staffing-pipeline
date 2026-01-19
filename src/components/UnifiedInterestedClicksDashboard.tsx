// ============================================================================
// Unified Interested Clicks Dashboard
// Combines Priority Candidates and Job Openings with cross-referencing
// ============================================================================

import React, { useState, useCallback } from 'react';
import { Users, Briefcase, X } from 'lucide-react';
import PriorityDashboard from './PriorityDashboard';
import JobOpeningsDashboard from './JobOpeningsDashboard';

type ActiveTab = 'candidates' | 'jobs';

// ============================================================================
// MAIN UNIFIED DASHBOARD
// ============================================================================

export default function UnifiedInterestedClicksDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('candidates');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const handleJobClick = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    setActiveTab('jobs');
  }, []);

  const handleViewApplicants = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    setActiveTab('candidates');
  }, []);

  const clearFilter = useCallback(() => {
    setSelectedJobId(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Unified Header with Tabs */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Tab Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('candidates')}
                className={`
                  group relative flex items-center gap-2 px-6 py-3 text-sm font-semibold
                  transition-all duration-200 rounded-lg
                  ${activeTab === 'candidates'
                    ? 'text-gray-900 bg-gray-50'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'
                  }
                `}
              >
                <Users size={18} strokeWidth={2} />
                <span>Interested Candidates</span>
                {activeTab === 'candidates' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
                )}
              </button>

              <button
                onClick={() => setActiveTab('jobs')}
                className={`
                  group relative flex items-center gap-2 px-6 py-3 text-sm font-semibold
                  transition-all duration-200 rounded-lg
                  ${activeTab === 'jobs'
                    ? 'text-gray-900 bg-gray-50'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'
                  }
                `}
              >
                <Briefcase size={18} strokeWidth={2} />
                <span>Job Openings</span>
                {activeTab === 'jobs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
                )}
              </button>
            </div>

            {/* Active Filter Badge */}
            {selectedJobId && (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                <span>Filtered to Job #{selectedJobId}</span>
                <button
                  onClick={clearFilter}
                  className="p-1 hover:bg-blue-100 rounded transition-colors"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab Content */}
      <div className="relative">
        {activeTab === 'candidates' ? (
          <div className="animate-fadeIn">
            <PriorityDashboard
              selectedJobId={selectedJobId}
              onJobClick={handleJobClick}
              hideHeader={true}
            />
          </div>
        ) : (
          <div className="animate-fadeIn">
            <JobOpeningsDashboard
              selectedJobId={selectedJobId}
              onViewApplicants={handleViewApplicants}
              hideHeader={true}
            />
          </div>
        )}
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s cubic-bezier(0.215, 0.610, 0.355, 1) forwards;
        }
      `}</style>
    </div>
  );
}
