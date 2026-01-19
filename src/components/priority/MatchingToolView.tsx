// ============================================================================
// src/components/priority/MatchingToolView.tsx
// PRODUCTION READY - NEW - Intelligent Candidate-Job Matching
// Architecture: Scoring algorithm, side-by-side view, quick actions
// ============================================================================

import React, { useState, useMemo } from 'react';
import { Search, X, GitCompareArrows, ExternalLink, Mail, Building2, MapPin, DollarSign, User, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { LocalCandidate, JobOpening } from '../../hooks/usePriorityCommandCenterData';

interface MatchingToolViewProps {
  localCandidates: LocalCandidate[];
  jobOpenings: JobOpening[];
}

interface Match {
  candidate: LocalCandidate;
  job: JobOpening;
  score: number;
  reasons: string[];
}

const calculateMatchScore = (candidate: LocalCandidate, job: JobOpening): { score: number; reasons: string[] } => {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.specialty && job.specialty && candidate.specialty === job.specialty) {
    score += 40;
    reasons.push('Specialty match');
  }

  if (candidate.distance_miles != null) {
    if (candidate.distance_miles <= 25) {
      score += 30;
      reasons.push('Within 25 miles');
    } else if (candidate.distance_miles <= 50) {
      score += 20;
      reasons.push('Within 50 miles');
    } else if (candidate.distance_miles <= 75) {
      score += 10;
      reasons.push('Within 75 miles');
    }
  }

  if (candidate.gross_weekly && job.gross_weekly) {
    const payDiff = Math.abs(candidate.gross_weekly - job.gross_weekly);
    if (payDiff <= 200) {
      score += 20;
      reasons.push('Pay aligned');
    } else if (payDiff <= 500) {
      score += 10;
      reasons.push('Pay similar');
    }
  }

  if (candidate.application_date) {
    const daysSince = Math.floor(
      (Date.now() - new Date(candidate.application_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince <= 7) {
      score += 10;
      reasons.push('Recent applicant');
    }
  }

  return { score, reasons };
};

const formatCurrency = (amount?: number | null): string => {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function MatchingToolView({ localCandidates = [], jobOpenings = [] }: MatchingToolViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [minScore, setMinScore] = useState<number>(50);

  const matches = useMemo(() => {
    const allMatches: Match[] = [];

    localCandidates.forEach(candidate => {
      jobOpenings.forEach(job => {
        const { score, reasons } = calculateMatchScore(candidate, job);
        
        if (score >= minScore) {
          allMatches.push({ candidate, job, score, reasons });
        }
      });
    });

    return allMatches.sort((a, b) => b.score - a.score);
  }, [localCandidates, jobOpenings, minScore]);

  const filteredMatches = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();
    if (!lowerSearch) return matches;

    return matches.filter(match =>
      match.candidate.candidate_name?.toLowerCase().includes(lowerSearch) ||
      match.job.facility_name?.toLowerCase().includes(lowerSearch) ||
      match.candidate.specialty?.toLowerCase().includes(lowerSearch)
    );
  }, [matches, searchTerm]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {filteredMatches.length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Matches Found
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">
            {filteredMatches.filter(m => m.score >= 80).length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Strong Matches
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {localCandidates.length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Candidates
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {jobOpenings.length}
          </div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
            Job Openings
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search candidates or facilities..."
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
            <label className="text-sm font-medium text-slate-600">Min Score:</label>
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
            >
              <option value={0}>All (0+)</option>
              <option value={50}>Good (50+)</option>
              <option value={70}>Strong (70+)</option>
              <option value={80}>Excellent (80+)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredMatches.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
            <GitCompareArrows size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 mb-2">No matches found</p>
            <p className="text-xs text-slate-400">Try lowering the minimum score</p>
          </div>
        ) : (
          filteredMatches.map((match) => {
            const isStrong = match.score >= 80;
            const isGood = match.score >= 70;

            return (
              <div
                key={`${match.candidate.id}-${match.job.job_id}`}
                className={cn(
                  'bg-white rounded-xl border p-5 hover:shadow-md transition-all duration-200',
                  isStrong ? 'border-emerald-200 bg-emerald-50/20' : isGood ? 'border-blue-200 bg-blue-50/20' : 'border-slate-200/80'
                )}
              >
                <div className="flex items-start gap-6">
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className={cn(
                        'flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold',
                        isStrong
                          ? 'bg-emerald-100 text-emerald-700'
                          : isGood
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {match.score}
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">
                      Score
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900 truncate">
                        {match.candidate.candidate_name}
                      </h4>
                      {isStrong && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                          <Zap size={11} />
                          Strong
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mb-3">
                      {match.candidate.specialty && (
                        <span className="flex items-center gap-1.5">
                          <User size={13} className="text-slate-400" />
                          {match.candidate.specialty}
                        </span>
                      )}
                      {(match.candidate.home_city || match.candidate.home_state) && (
                        <span className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400" />
                          {[match.candidate.home_city, match.candidate.home_state].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {match.candidate.gross_weekly && (
                        <span className="flex items-center gap-1.5 font-semibold">
                          <DollarSign size={13} className="text-slate-400" />
                          {formatCurrency(match.candidate.gross_weekly)}/wk
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {match.reasons.map((reason, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] font-medium rounded-full"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-center shrink-0">
                    <GitCompareArrows size={20} className="text-slate-300" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900 mb-2 truncate">
                      {match.job.facility_name || 'Unknown Facility'}
                    </h4>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mb-3">
                      {match.job.specialty && (
                        <span className="flex items-center gap-1.5">
                          <Building2 size={13} className="text-slate-400" />
                          {match.job.specialty}
                        </span>
                      )}
                      {(match.job.location_city || match.job.location_state) && (
                        <span className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400" />
                          {[match.job.location_city, match.job.location_state].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {match.job.gross_weekly && (
                        <span className="flex items-center gap-1.5 font-semibold">
                          <DollarSign size={13} className="text-slate-400" />
                          {formatCurrency(match.job.gross_weekly)}/wk
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {match.candidate.candidate_email && (
                        <a
                          href={`mailto:${match.candidate.candidate_email}?subject=Job Opportunity: ${match.job.facility_name}`}
                          className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          <Mail size={12} className="inline mr-1.5" />
                          Email Candidate
                        </a>
                      )}
                      {match.candidate.candidate_id && (
                        <a
                          href={`https://nova.ayahealthcare.com/#/recruiting/candidates/${match.candidate.candidate_id}/new-profile/about`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          title="View Candidate"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
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
