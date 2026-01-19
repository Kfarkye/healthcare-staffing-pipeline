// ============================================================================
// src/components/priority/RecruiterHotListView.tsx
// UPDATED: Now includes a file uploader to import the interested clicks report.
// Architecture: Collapsible groups, search, copy-to-clipboard, Excel import
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { Search, X, ChevronRight, Check, Mail, Phone, Copy, ExternalLink, User, Building2, MapPin, Upload, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import type { PriorityClick } from '../../hooks/usePriorityCommandCenterData';

interface RecruiterHotListViewProps {
  priorityClicks: PriorityClick[];
  onImportComplete?: () => void;
}

export default function RecruiterHotListView({ priorityClicks = [], onImportComplete }: RecruiterHotListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['first']));
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        const processedClicks = jsonData.map((row: any) => ({
          candidate_id: row['Candidate ID'] || row.candidate_id,
          candidate_name: row['Candidate Name'] || row.candidate_name,
          candidate_email: row['Email'] || row.candidate_email || row.email,
          candidate_phone: row['Phone'] || row.candidate_phone || row.phone,
          job_id: row['Job ID'] || row.job_id,
          facility_name: row['Facility'] || row.facility_name,
          specialty: row['Specialty'] || row.specialty,
          recruiter_name: row['Recruiter'] || row.recruiter_name,
          location_city: row['City'] || row.location_city,
          location_state: row['State'] || row.location_state,
          application_date: row['Application Date'] || row.application_date
            ? new Date(row['Application Date'] || row.application_date).toISOString()
            : new Date().toISOString(),
        }));

        if (processedClicks.length === 0) throw new Error("No valid records found in file.");

        const { error } = await supabase
          .from('priority_interested_clicks')
          .upsert(processedClicks, { onConflict: 'candidate_id,job_id' });

        if (error) throw error;

        alert(`${processedClicks.length} interested clicks imported successfully!`);
        onImportComplete?.();

      } catch (err: any) {
        alert('Import failed: ' + err.message);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [onImportComplete]);

  const copyToClipboard = async (text: string, id: number) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const recruitersWithCounts = useMemo(() => {
    const counts = priorityClicks.reduce((acc, click) => {
      const recruiter = click.recruiter_name || 'Unassigned';
      acc[recruiter] = (acc[recruiter] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [priorityClicks]);

  const filteredClicks = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();

    return priorityClicks.filter(click => {
      const matchesSearch = !lowerSearch ||
        click.candidate_name?.toLowerCase().includes(lowerSearch) ||
        click.facility_name?.toLowerCase().includes(lowerSearch) ||
        click.specialty?.toLowerCase().includes(lowerSearch) ||
        click.location_city?.toLowerCase().includes(lowerSearch);

      const matchesRecruiter = selectedRecruiter === 'all' ||
        (click.recruiter_name || 'Unassigned') === selectedRecruiter;

      return matchesSearch && matchesRecruiter;
    });
  }, [priorityClicks, searchTerm, selectedRecruiter]);

  const groupedByRecruiter = useMemo(() => {
    const grouped = filteredClicks.reduce((acc, click) => {
      const recruiter = click.recruiter_name || 'Unassigned';
      if (!acc[recruiter]) acc[recruiter] = [];
      acc[recruiter].push(click);
      return acc;
    }, {} as Record<string, PriorityClick[]>);

    return Object.entries(grouped)
      .sort((a, b) => b[1].length - a[1].length);
  }, [filteredClicks]);

  const toggleGroup = (recruiter: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(recruiter)) {
      newExpanded.delete(recruiter);
    } else {
      newExpanded.add(recruiter);
    }
    setExpandedGroups(newExpanded);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
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

          <select
            value={selectedRecruiter}
            onChange={(e) => setSelectedRecruiter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
          >
            <option value="all">All Recruiters ({priorityClicks.length})</option>
            {recruitersWithCounts.map(({ name, count }) => (
              <option key={name} value={name}>
                {name} ({count})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors cursor-pointer">
            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            <span>Import Clicks</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Grouped Lists */}
      <div className="space-y-4">
        {groupedByRecruiter.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
            <p className="text-slate-500">No matches found</p>
          </div>
        ) : (
          groupedByRecruiter.map(([recruiter, clicks], groupIndex) => {
            const isExpanded = expandedGroups.has(recruiter) ||
              (expandedGroups.has('first') && groupIndex === 0);

            return (
              <div
                key={recruiter}
                className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
              >
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(recruiter)}
                  className="w-full px-6 py-4 bg-slate-50/70 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ChevronRight
                        size={20}
                        className={cn(
                          'text-slate-400 transition-transform duration-200',
                          isExpanded && 'rotate-90'
                        )}
                      />
                      <h3 className="font-semibold text-slate-800">{recruiter}</h3>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-bold bg-slate-200 text-slate-700 rounded-full tabular-nums">
                      {clicks.length}
                    </span>
                  </div>
                </button>

                {/* Group Content */}
                {isExpanded && (
                  <div className="divide-y divide-slate-100">
                    {clicks.map((click) => (
                      <div key={click.idx} className="p-4 group hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-start gap-4">
                          {/* Candidate Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-semibold text-slate-900 truncate">
                                {click.candidate_name}
                              </h4>
                              {click.days_since_application != null && (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 text-xs font-medium rounded-full shrink-0',
                                    click.days_since_application <= 3
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-slate-100 text-slate-600'
                                  )}
                                >
                                  {click.days_since_application}d ago
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                              {click.facility_name && (
                                <span className="flex items-center gap-1.5">
                                  <Building2 size={13} className="text-slate-400" />
                                  {click.facility_name}
                                </span>
                              )}
                              {click.specialty && (
                                <span className="flex items-center gap-1.5">
                                  <User size={13} className="text-slate-400" />
                                  {click.specialty}
                                </span>
                              )}
                              {(click.location_city || click.location_state) && (
                                <span className="flex items-center gap-1.5">
                                  <MapPin size={13} className="text-slate-400" />
                                  {[click.location_city, click.location_state].filter(Boolean).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {click.candidate_email && (
                              <>
                                <button
                                  onClick={() => copyToClipboard(click.candidate_email, click.idx)}
                                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                                  title="Copy email"
                                >
                                  {copiedId === click.idx ? (
                                    <Check size={14} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={14} className="text-slate-400" />
                                  )}
                                </button>

                                <a
                                  href={`mailto:${click.candidate_email}`}
                                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                                  title="Send email"
                                >
                                  <Mail size={14} className="text-slate-400" />
                                </a>
                              </>
                            )}
                            {click.candidate_phone && (
                              <a
                                href={`tel:${click.candidate_phone}`}
                                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                                title="Call"
                              >
                                <Phone size={14} className="text-slate-400" />
                              </a>
                            )}
                            {click.candidate_id && (
                              <a
                                href={`https://nova.ayahealthcare.com/#/recruiting/candidates/${click.candidate_id}/new-profile/about`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                                title="Open in Nova"
                              >
                                <ExternalLink size={14} className="text-slate-400" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
