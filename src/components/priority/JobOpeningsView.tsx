// ============================================================================
// src/components/priority/JobOpeningsView.tsx
// PRODUCTION READY - Top Job Openings Sorted by Gross Weekly
// Architecture: Sortable table, quick filters, premium highlighting
// ============================================================================

import React, { useState, useMemo } from 'react';
import { Search, X, Building2, MapPin, Briefcase, DollarSign, Calendar, Zap, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { JobOpening } from '../../hooks/usePriorityCommandCenterData';

interface JobOpeningsViewProps {
  jobOpenings: JobOpening[];
}

const formatCurrency = (amount?: number | null): string => {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function JobOpeningsView({ jobOpenings = [] }: JobOpeningsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [minWeekly, setMinWeekly] = useState<number>(0);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');

  const specialties = useMemo(() => {
    const specs = new Set<string>();
    jobOpenings.forEach(job => {
      if (job.specialty) specs.add(job.specialty);
    });
    return Array.from(specs).sort();
  }, [jobOpenings]);

  const filteredJobs = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();

    return jobOpenings.filter(job => {
      const matchesSearch = !lowerSearch ||
        job.facility_name?.toLowerCase().includes(lowerSearch) ||
        job.specialty?.toLowerCase().includes(lowerSearch) ||
        job.location_city?.toLowerCase().includes(lowerSearch) ||
        job.location_state?.toLowerCase().includes(lowerSearch);

      const matchesWeekly = !job.gross_weekly || job.gross_weekly >= minWeekly;

      const matchesSpecialty = selectedSpecialty === 'all' || job.specialty === selectedSpecialty;

      return matchesSearch && matchesWeekly && matchesSpecialty;
    });
  }, [jobOpenings, searchTerm, minWeekly, selectedSpecialty]);

  const isPremium = (weekly?: number | null): boolean => {
    return weekly != null && weekly >= 3000;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {filteredJobs.length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Job Openings
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {filteredJobs.filter(j => isPremium(j.gross_weekly)).length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Premium ($3K+)
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {specialties.length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Specialties
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search facilities, specialties, locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={14} className="text-slate-500" />
              </button>
            )}
          </div>

          <select
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
          >
            <option value="all">All Specialties</option>
            {specialties.map(spec => (
              <option key={spec} value={spec}>{spec}</option>
            ))}
          </select>

          <select
            value={minWeekly}
            onChange={(e) => setMinWeekly(Number(e.target.value))}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
          >
            <option value={0}>Any Pay</option>
            <option value={2000}>$2K+ /week</option>
            <option value={2500}>$2.5K+ /week</option>
            <option value={3000}>$3K+ /week</option>
            <option value={3500}>$3.5K+ /week</option>
          </select>
        </div>
      </div>

      {/* Job List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
            <p className="text-slate-500">No jobs match your filters</p>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const premium = isPremium(job.gross_weekly);

            return (
              <div
                key={job.job_id}
                className={cn(
                  'bg-white rounded-lg border p-4 hover:shadow-sm transition-all duration-200',
                  premium ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Job Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900 truncate">
                        {job.facility_name || 'Unknown Facility'}
                      </h4>
                      {premium && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                          <Zap size={11} />
                          Premium
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                      {job.specialty && (
                        <span className="flex items-center gap-1.5">
                          <Briefcase size={13} className="text-slate-400" />
                          {job.specialty}
                        </span>
                      )}
                      {(job.location_city || job.location_state) && (
                        <span className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400" />
                          {[job.location_city, job.location_state].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {job.start_date && (
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400" />
                          Starts {formatDate(job.start_date)}
                        </span>
                      )}
                      {job.gross_weekly && (
                        <span className="flex items-center gap-1.5 font-bold text-slate-900">
                          <DollarSign size={13} className="text-slate-400" />
                          {formatCurrency(job.gross_weekly)}/wk
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {job.job_id && (
                      <a
                        href={`https://nova.ayahealthcare.com/#/recruiting/job-openings/${job.job_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        title="Open in Nova"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
