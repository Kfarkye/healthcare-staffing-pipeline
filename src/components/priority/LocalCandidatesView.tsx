// ============================================================================
// src/components/priority/LocalCandidatesView.tsx
// PRODUCTION READY - Local Candidates Within 50 Miles
// Architecture: Distance-based filtering, facility grouping
// ============================================================================

import React, { useState, useMemo } from 'react';
import { Search, X, MapPin, User, Building2, DollarSign, ExternalLink, Mail, Phone } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { LocalCandidate } from '../../hooks/usePriorityCommandCenterData';

interface LocalCandidatesViewProps {
  localCandidates: LocalCandidate[];
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

export default function LocalCandidatesView({ localCandidates = [] }: LocalCandidatesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDistance, setMaxDistance] = useState<number>(50);

  const filteredCandidates = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();

    return localCandidates.filter(candidate => {
      const matchesSearch = !lowerSearch ||
        candidate.candidate_name?.toLowerCase().includes(lowerSearch) ||
        candidate.specialty?.toLowerCase().includes(lowerSearch) ||
        candidate.facility_name?.toLowerCase().includes(lowerSearch) ||
        candidate.home_city?.toLowerCase().includes(lowerSearch);

      const matchesDistance = !candidate.distance_miles || candidate.distance_miles <= maxDistance;

      return matchesSearch && matchesDistance;
    });
  }, [localCandidates, searchTerm, maxDistance]);

  const groupedByFacility = useMemo(() => {
    const grouped = filteredCandidates.reduce((acc, candidate) => {
      const facility = candidate.facility_name || 'No Facility';
      if (!acc[facility]) acc[facility] = [];
      acc[facility].push(candidate);
      return acc;
    }, {} as Record<string, LocalCandidate[]>);

    return Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
  }, [filteredCandidates]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {filteredCandidates.length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Local Candidates
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {groupedByFacility.length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Facilities
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {maxDistance}mi
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Max Distance
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
              placeholder="Search candidates, facilities, specialties..."
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

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Distance:</label>
            <select
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
            >
              <option value={25}>25 miles</option>
              <option value={50}>50 miles</option>
              <option value={75}>75 miles</option>
              <option value={100}>100 miles</option>
            </select>
          </div>
        </div>
      </div>

      {/* Candidate List */}
      <div className="space-y-3">
        {filteredCandidates.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
            <p className="text-slate-500">No local candidates found</p>
          </div>
        ) : (
          filteredCandidates.map((candidate) => (
            <div
              key={candidate.id}
              className="bg-white rounded-lg border border-slate-200/80 p-4 hover:shadow-sm transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: Candidate Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 mb-2 truncate">
                    {candidate.candidate_name}
                  </h4>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                    {candidate.specialty && (
                      <span className="flex items-center gap-1.5">
                        <User size={13} className="text-slate-400" />
                        {candidate.specialty}
                      </span>
                    )}
                    {candidate.facility_name && (
                      <span className="flex items-center gap-1.5">
                        <Building2 size={13} className="text-slate-400" />
                        {candidate.facility_name}
                      </span>
                    )}
                    {(candidate.home_city || candidate.home_state) && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-slate-400" />
                        {[candidate.home_city, candidate.home_state].filter(Boolean).join(', ')}
                        {candidate.distance_miles != null && ` (${candidate.distance_miles}mi)`}
                      </span>
                    )}
                    {candidate.gross_weekly && (
                      <span className="flex items-center gap-1.5 font-semibold">
                        <DollarSign size={13} className="text-slate-400" />
                        {formatCurrency(candidate.gross_weekly)}/wk
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {candidate.candidate_email && (
                    <a
                      href={`mailto:${candidate.candidate_email}`}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      title="Email"
                    >
                      <Mail size={14} />
                    </a>
                  )}
                  {candidate.candidate_phone && (
                    <a
                      href={`tel:${candidate.candidate_phone}`}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      title="Call"
                    >
                      <Phone size={14} />
                    </a>
                  )}
                  {candidate.candidate_id && (
                    <a
                      href={`https://nova.ayahealthcare.com/#/recruiting/candidates/${candidate.candidate_id}/new-profile/about`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      title="Nova"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
