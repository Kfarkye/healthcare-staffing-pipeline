// ============================================================================
// Prospect Dashboard
// Connect candidates with opportunities. Every interaction matters.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Mail, DollarSign, ArrowUp, ArrowDown, Copy, Check, 
  RefreshCw, Upload, Filter, X, FileUp, ExternalLink, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { payPackageService } from '../services/payPackageService';
import InterestedClicksSync from './InterestedClicksSync';

// ============================================================================
// DESIGN SYSTEM
// ============================================================================

const DESIGN = {
  space: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '0.75rem',    // 12px
    lg: '1rem',       // 16px
    xl: '1.5rem',     // 24px
    '2xl': '2rem',    // 32px
  },
  text: {
    xs: '0.6875rem',  // 11px
    sm: '0.8125rem',  // 13px
    base: '0.875rem', // 14px
    lg: '1rem',       // 16px
    xl: '1.25rem',    // 20px
    '2xl': '1.75rem', // 28px
  },
  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  color: {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    success: 'bg-green-600 text-white',
    local: 'text-green-600',
  },
  elevation: {
    none: 'shadow-none',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
  },
  radius: {
    sm: '0.5rem',   // 8px
    md: '0.75rem',  // 12px
    lg: '1rem',     // 16px
    full: '9999px',
  },
  transition: {
    fast: '100ms',
    base: '150ms',
    slow: '200ms',
  },
};

const RECORDS_PER_PAGE = 100;
const COPY_DURATION = 2000;
const DEBOUNCE_DELAY = 300;

// ============================================================================
// TYPES
// ============================================================================

type SortKey = 'last_note_date' | 'candidate_name' | 'application_date' | 'recruiter_name' | 'specialty';
type SortDirection = 'asc' | 'desc';

interface Prospect {
  id: number;
  application_id: number;
  application_date: string;
  job_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_homestate: string;
  job_city: string;
  job_state: string;
  profession: string;
  specialty: string;
  recruiter_name: string;
  recruiter_email: string;
  last_note: string;
  last_note_date: string | null;
  last_note_by: string | null;
  status: string;
  created_at: string;
  recruiter_contacted_recently: boolean;
  days_since_application: number;
  pay_range?: string;
  facility_name?: string;
  shift_type?: string;
  start_date?: string;
  end_date?: string;
}

interface PayPackage {
  jobId: string;
  facilityName: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
  shiftType: string | null;
  hoursPerWeek: number | null;
  completionBonus: number | null;
  taxableHourlyRate: number | null;
  stipend: number | null;
  grossWeeklyPay: number | null;
  meals_weekly?: number;
  housing_weekly?: number;
}

interface Filters {
  search: string;
  specialty: string;
  recruiter: string;
  localOnly: boolean;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// UTILITIES
// ============================================================================

const cn = (...classes: (string | boolean | undefined)[]) => 
  classes.filter(Boolean).join(' ');

const formatDate = (date: string | null): string => {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    return '—';
  }
};

const formatNaturalDate = (date: string | null): string => {
  if (!date) return 'ASAP';
  try {
    const d = new Date(`${date}T00:00:00Z`);
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    return date;
  }
};

const formatDateTime = (date: string | null): { date: string; time: string } => {
  if (!date) return { date: '—', time: '' };
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return { date: '—', time: '' };

    const isMidnightUTC = d.getUTCHours() === 0 &&
                          d.getUTCMinutes() === 0 &&
                          d.getUTCSeconds() === 0 &&
                          d.getUTCMilliseconds() === 0;

    const timePart = isMidnightUTC ? '' : d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC'
    });

    return {
      date: formatDate(date),
      time: timePart
    };
  } catch {
    return { date: '—', time: '' };
  }
};

// ============================================================================
// HOOKS
// ============================================================================

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debounced;
};

const useCopy = () => {
  const [copied, setCopied] = useState<{ type: string; id: number } | null>(null);
  
  const copy = useCallback((text: string, type: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopied({ type, id });
    setTimeout(() => setCopied(null), COPY_DURATION);
  }, []);
  
  return { copied, copy };
};

// ============================================================================
// DATA SERVICE
// ============================================================================

const dataService = {
  async fetchProspects(
    filters: Filters,
    sortKey: SortKey,
    sortDir: SortDirection,
    offset: number = 0
  ) {
    try {
      let query = supabase
        .from('priority_interested_clicks')
        .select('*', { count: 'exact' });

      if (filters.search) {
        const term = filters.search.trim();
        query = query.or(
          `candidate_name.ilike.%${term}%,` +
          `specialty.ilike.%${term}%,` +
          `job_id.ilike.%${term}%,` +
          `candidate_email.ilike.%${term}%`
        );
      }

      if (filters.specialty !== 'all') {
        query = query.eq('specialty', filters.specialty);
      }

      if (filters.recruiter !== 'all') {
        query = query.eq('recruiter_name', filters.recruiter);
      }

      query = query.order(sortKey, { 
        ascending: sortDir === 'asc',
        nullsFirst: false 
      });

      query = query.range(offset, offset + RECORDS_PER_PAGE - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        total: count || 0,
        hasMore: offset + RECORDS_PER_PAGE < (count || 0)
      };
    } catch (error) {
      console.error('Fetch error:', error);
      return { data: [], total: 0, hasMore: false };
    }
  },

  async fetchPayPackage(jobId: string): Promise<PayPackage | null> {
    try {
      const pkg = await payPackageService.getPackage(jobId);
      if (!pkg) return null;

      return {
        jobId: pkg.job_id,
        facilityName: pkg.facility_name,
        city: pkg.city,
        state: pkg.state,
        startDate: pkg.start_date,
        endDate: pkg.end_date,
        shiftType: pkg.shift_type,
        hoursPerWeek: pkg.hours_per_week,
        completionBonus: pkg.completion_bonus,
        taxableHourlyRate: pkg.taxable_hourly_rate,
        stipend: pkg.total_stipend,
        grossWeeklyPay: pkg.gross_weekly_pay,
        meals_weekly: pkg.meals_weekly,
        housing_weekly: pkg.housing_weekly,
      };
    } catch (error) {
      console.error('Pay package error:', error);
      return null;
    }
  },

  async generatePayPackage(prospect: Prospect): Promise<PayPackage | null> {
    try {
      const clickData = {
        job_id: prospect.job_id,
        facility_name: prospect.facility_name || `Facility in ${prospect.job_city}`,
        job_city: prospect.job_city,
        job_state: prospect.job_state,
        specialty: prospect.specialty,
        profession: prospect.profession,
        pay_range: prospect.pay_range,
        shift_type: prospect.shift_type,
        start_date: prospect.start_date,
      };

      const generated = await payPackageService.generateFromClick(clickData);

      return {
        jobId: generated.job_id,
        facilityName: generated.facility_name,
        city: generated.city,
        state: generated.state,
        startDate: generated.start_date || 'ASAP',
        endDate: generated.end_date || '13 weeks',
        shiftType: generated.shift_type || '3x12',
        hoursPerWeek: generated.hours_per_week,
        completionBonus: generated.completion_bonus || 0,
        taxableHourlyRate: generated.taxable_hourly_rate,
        stipend: generated.total_stipend,
        grossWeeklyPay: generated.gross_weekly_pay,
        meals_weekly: generated.meals_weekly,
        housing_weekly: generated.housing_weekly,
      };
    } catch (error) {
      console.error('Generate error:', error);
      return null;
    }
  },

  generateEmail(prospect: Prospect, pkg: PayPackage | null) {
    const firstName = prospect.candidate_name.split(' ')[0];

    if (!pkg) {
      return {
        subject: `${prospect.specialty} Opportunity - Job #${prospect.job_id}`,
        body: `Hi ${firstName},\n\nI hope this message finds you well!\n\nI came across your profile and wanted to reach out about a ${prospect.specialty} opportunity that might be a great fit for you.\n\nJob Details:\n- Specialty: ${prospect.specialty}\n- Location: ${prospect.job_city}, ${prospect.job_state}\n- Job ID: ${prospect.job_id}\n\nI'd love to discuss the full pay package and details with you. This position is moving quickly, and I think your background would be perfect for it.\n\nWould you have a few minutes for a quick call to discuss? I can share all the specifics including the competitive pay rate, benefits, and start date.\n\nLooking forward to hearing from you!`
      };
    }

    const clickData = {
      job_id: prospect.job_id,
      facility_name: pkg.facilityName || prospect.facility_name || '',
      job_city: pkg.city || prospect.job_city,
      job_state: pkg.state || prospect.job_state,
      specialty: prospect.specialty,
      start_date: formatNaturalDate(pkg.startDate),
      end_date: formatNaturalDate(pkg.endDate),
      shift_type: pkg.shiftType,
      contract_length: '13-week assignment',
    };

    const template = payPackageService.generateEmailTemplate(
      prospect.candidate_name,
      clickData,
      {
        job_id: pkg.jobId,
        facility_name: pkg.facilityName || '',
        city: pkg.city || '',
        state: pkg.state || '',
        specialty: prospect.specialty,
        hours_per_week: pkg.hoursPerWeek || 36,
        taxable_hourly_rate: pkg.taxableHourlyRate || 0,
        meals_stipend: pkg.meals_weekly || 0,
        housing_stipend: pkg.housing_weekly || 0,
        stipend: pkg.stipend || 0,
        gross_weekly_pay: pkg.grossWeeklyPay || 0,
        completion_bonus: pkg.completionBonus || 0,
        start_date: formatNaturalDate(pkg.startDate),
        end_date: formatNaturalDate(pkg.endDate),
        shift_type: pkg.shiftType,
        contract_length: '13-week assignment',
        source: 'calculated',
      }
    );

    // Remove signature for Outlook
    const lines = template.body.split('\n');
    const sigIndex = lines.findIndex(line => 
      line.includes('Best,') || line.includes('Sincerely,') || line.includes('Regards,')
    );

    if (sigIndex !== -1) {
      template.body = lines.slice(0, sigIndex).join('\n').trim() + 
                      '\n\nLooking forward to hearing from you!';
    }

    return template;
  }
};

// ============================================================================
// TOAST
// ============================================================================

const Toast: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const Icon = toast.type === 'success' ? Check : X;
  const bg = toast.type === 'success' ? 'bg-green-600' : 
             toast.type === 'error' ? 'bg-red-600' : 'bg-slate-900';

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 px-4 py-3 rounded-xl z-50',
        'flex items-center gap-2.5 animate-slideUp backdrop-blur-sm text-white',
        bg, DESIGN.elevation.lg
      )}
      style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
      role="alert"
    >
      <Icon size={16} strokeWidth={2.5} />
      {toast.message}
    </div>
  );
};

// ============================================================================
// SORT BUTTON
// ============================================================================

const SortButton: React.FC<{
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}> = ({ label, active, direction, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all',
      active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
    )}
    style={{ fontSize: DESIGN.text.xs, fontWeight: DESIGN.weight.semibold }}
    aria-label={`Sort by ${label}`}
    aria-pressed={active}
  >
    {label}
    {active && (
      direction === 'asc' 
        ? <ArrowUp size={12} strokeWidth={2.5} />
        : <ArrowDown size={12} strokeWidth={2.5} />
    )}
  </button>
);

// ============================================================================
// PROSPECT ROW
// ============================================================================

const ProspectRow: React.FC<{
  prospect: Prospect;
  onCopy: (text: string, type: string, id: number) => void;
  copied: { type: string; id: number } | null;
  onEmail: (prospect: Prospect) => void;
  onPackage: (prospect: Prospect) => void;
  emailLoading: boolean;
}> = ({ prospect, onCopy, copied, onEmail, onPackage, emailLoading }) => {
  const [hover, setHover] = useState(false);
  const isLocal = prospect.candidate_homestate === prospect.job_state;
  const noteDateTime = formatDateTime(prospect.last_note_date);

  return (
    <article
      className="p-4 border-b border-slate-200 hover:bg-slate-50 transition-colors group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-x-6">
        {/* Candidate Info - Left Column */}
        <div className="w-5/12 min-w-0">
          <div className="mb-4">
            <button
              onClick={() => onCopy(prospect.candidate_name, 'name', prospect.id)}
              className="group flex items-center gap-1.5 min-w-0"
              aria-label="Copy name"
            >
              <span 
                className="text-slate-900 truncate"
                style={{ fontSize: DESIGN.text.base, fontWeight: DESIGN.weight.semibold }}
                title={prospect.candidate_name}
              >
                {prospect.candidate_name}
              </span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {copied?.type === 'name' && copied?.id === prospect.id
                  ? <Check size={12} className="text-green-600" strokeWidth={2.5} />
                  : <Copy size={12} className="text-slate-400" strokeWidth={2} />
                }
              </span>
            </button>

            <button
              onClick={() => onCopy(prospect.candidate_email, 'email', prospect.id)}
              className="text-slate-500 mt-0.5 truncate flex items-center gap-1.5 min-w-0 transition-colors hover:text-slate-700"
              style={{ fontSize: DESIGN.text.sm }}
              aria-label="Copy email"
              title={prospect.candidate_email}
            >
              <span className="truncate">{prospect.candidate_email}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {copied?.type === 'email' && copied?.id === prospect.id
                  ? <Check size={10} className="text-green-600" strokeWidth={2.5} />
                  : <Copy size={10} className="text-slate-400" strokeWidth={2} />
                }
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3" style={{ fontSize: DESIGN.text.sm }}>
            <span className="text-slate-700 font-medium">{prospect.specialty}</span>
            <a
              href={`https://nova.ayahealthcare.com/#/recruiting/jobs/${prospect.job_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
            >
              Job #{prospect.job_id}
            </a>
          </div>
        </div>

        {/* Location Grid - Middle Column */}
        <div className="w-40 flex-shrink-0">
          <div className="space-y-3">
            <div>
              <p 
                className="text-slate-500 mb-1"
                style={{ fontSize: DESIGN.text.xs }}
              >
                Home Location
              </p>
              <p 
                className={cn(
                  'font-medium truncate',
                  isLocal ? 'text-green-600' : 'text-slate-800'
                )}
                style={{ fontSize: DESIGN.text.sm }}
              >
                {prospect.candidate_homestate}
              </p>
            </div>
            <div>
              <p 
                className="text-slate-500 mb-1"
                style={{ fontSize: DESIGN.text.xs }}
              >
                Facility Location
              </p>
              <p 
                className={cn(
                  'font-medium truncate',
                  isLocal ? 'text-green-600' : 'text-slate-800'
                )}
                style={{ fontSize: DESIGN.text.sm }}
              >
                {prospect.job_state}
              </p>
            </div>
          </div>
        </div>

        {/* Recruiter Grid - Middle Column */}
        <div className="w-40 flex-shrink-0">
          <div className="space-y-3">
            <div>
              <p 
                className="text-slate-500 mb-1"
                style={{ fontSize: DESIGN.text.xs }}
              >
                Recruiter
              </p>
              <p 
                className="text-slate-900 font-medium truncate"
                style={{ fontSize: DESIGN.text.sm }}
              >
                {prospect.recruiter_name}
              </p>
            </div>
            <div>
              <p 
                className="text-slate-500 mb-1"
                style={{ fontSize: DESIGN.text.xs }}
              >
                Last Note By
              </p>
              <p 
                className="text-slate-800 truncate"
                style={{ fontSize: DESIGN.text.sm }}
              >
                {prospect.last_note_by || '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Dates Grid - Right Column */}
        <div className="w-28 flex-shrink-0 text-right">
          <div className="space-y-3">
            <div>
              <p 
                className="text-slate-500 mb-1"
                style={{ fontSize: DESIGN.text.xs }}
              >
                Applied
              </p>
              <p 
                className="text-slate-900 font-medium"
                style={{ fontSize: DESIGN.text.sm }}
              >
                {formatDate(prospect.application_date)}
              </p>
            </div>
            <div>
              <p 
                className="text-slate-500 mb-1"
                style={{ fontSize: DESIGN.text.xs }}
              >
                Last Note
              </p>
              {noteDateTime.date !== '—' ? (
                <>
                  <p 
                    className="text-slate-900 font-medium"
                    style={{ fontSize: DESIGN.text.sm }}
                  >
                    {noteDateTime.date}
                  </p>
                  {noteDateTime.time && (
                    <p 
                      className="text-slate-500"
                      style={{ fontSize: DESIGN.text.xs }}
                    >
                      {noteDateTime.time}
                    </p>
                  )}
                </>
              ) : (
                <p 
                  className="text-slate-800"
                  style={{ fontSize: DESIGN.text.sm }}
                >
                  —
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="w-20 flex-shrink-0 flex items-center justify-end gap-1">
          <button
            onClick={() => onEmail(prospect)}
            disabled={emailLoading}
            className={cn(
              'p-2 rounded-lg transition-all',
              emailLoading ? 'cursor-wait opacity-50 bg-slate-100' : 'hover:bg-blue-50'
            )}
            aria-label="Send email"
            title="Email via Outlook"
          >
            <Mail 
              size={16} 
              strokeWidth={2}
              className={emailLoading ? 'text-slate-400' : 'text-blue-600'}
            />
          </button>
          <button
            onClick={() => onPackage(prospect)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="View pay package"
            title="View Pay Package"
          >
            <DollarSign size={16} strokeWidth={2} className="text-slate-600" />
          </button>
        </div>
      </div>
    </article>
  );
};

// ============================================================================
// PAY PACKAGE MODAL
// ============================================================================

const PackageModal: React.FC<{
  prospect: Prospect | null;
  onClose: () => void;
}> = ({ prospect, onClose }) => {
  const [pkg, setPkg] = useState<PayPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!prospect) return;

    const load = async () => {
      setLoading(true);
      let data = await dataService.fetchPayPackage(prospect.job_id);
      if (!data) {
        data = await dataService.generatePayPackage(prospect);
      }
      setPkg(data);
      setLoading(false);
    };

    load();
  }, [prospect]);

  if (!prospect) return null;

  const email = useMemo(() => 
    dataService.generateEmail(prospect, pkg),
    [prospect, pkg]
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(email.body);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_DURATION);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <header className="p-6 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 
              className="text-slate-900 mb-1"
              style={{ fontSize: DESIGN.text.lg, fontWeight: DESIGN.weight.semibold }}
            >
              Email for {prospect.candidate_name}
            </h2>
            <p 
              className="text-slate-500"
              style={{ fontSize: DESIGN.text.sm }}
            >
              Job #{prospect.job_id} · {prospect.specialty}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} className="text-slate-500" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : (
            <textarea
              readOnly
              value={email.body}
              className="w-full h-96 p-4 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none font-mono"
              style={{ fontSize: DESIGN.text.sm }}
            />
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <footer className="p-4 border-t border-slate-200 flex justify-end">
            <button
              onClick={handleCopy}
              className={cn(
                'px-4 py-2 rounded-lg transition-all flex items-center gap-2',
                copied ? DESIGN.color.success : DESIGN.color.primary
              )}
              style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.semibold }}
            >
              {copied ? (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={16} strokeWidth={2.5} />
                  Copy
                </>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// JOB FILTER MODAL
// ============================================================================

const JobFilterModal: React.FC<{
  onClose: () => void;
  onLoad: (ids: string[]) => void;
}> = ({ onClose, onLoad }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLoad = () => {
    const ids = input
      .split(/[\n,\s]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);
    onLoad(ids);
  };

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      alert('Please upload an Excel file');
      return;
    }

    setLoading(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

        const ids: string[] = [];
        json.forEach((row: any) => {
          if (Array.isArray(row) && row.length > 0) {
            const value = String(row[0]).trim();
            if (value && !isNaN(Number(value))) {
              ids.push(value);
            }
          }
        });

        if (ids.length === 0) {
          alert('No Job IDs found');
          return;
        }

        onLoad(ids);
      } catch (error: any) {
        alert(`Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <header className="p-6 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 
              className="text-slate-900 mb-1"
              style={{ fontSize: DESIGN.text.lg, fontWeight: DESIGN.weight.semibold }}
            >
              Filter by Job IDs
            </h2>
            <a
              href="https://ssrsreports-ayahealthcare.msappproxy.net/reports/report/Recruiting/MyAya%20Interested%20Clicks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
              style={{ fontSize: DESIGN.text.sm }}
            >
              Generate Report
              <ExternalLink size={14} strokeWidth={2} />
            </a>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} className="text-slate-500" />
          </button>
        </header>

        {/* Content */}
        <div className="p-6 space-y-4">
          <label className="flex items-center justify-center">
            <div className={cn(
              'px-4 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center gap-2',
              loading ? 'bg-slate-300 cursor-wait' : DESIGN.color.primary
            )}
              style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.semibold }}
            >
              <FileUp size={18} strokeWidth={2} />
              {loading ? 'Processing...' : 'Upload Excel'}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
                disabled={loading}
                className="hidden"
              />
            </div>
          </label>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span 
                className="px-2 bg-white text-slate-500"
                style={{ fontSize: DESIGN.text.xs }}
              >
                OR
              </span>
            </div>
          </div>

          <div>
            <label 
              className="block text-slate-700 mb-2"
              style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
            >
              Paste Job IDs
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="123456&#10;789012&#10;345678"
              className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              style={{ fontSize: DESIGN.text.sm }}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="p-6 bg-slate-50 border-t border-slate-200 rounded-b-2xl flex justify-end gap-3">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-lg transition-colors',
              DESIGN.color.secondary
            )}
            style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            disabled={!input.trim()}
            className={cn(
              'px-4 py-2 rounded-lg transition-colors disabled:bg-slate-300',
              DESIGN.color.primary
            )}
            style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.semibold }}
          >
            Load
          </button>
        </footer>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProspectDashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    search: '',
    specialty: 'all',
    recruiter: 'all',
    localOnly: false
  });

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDirection }>({
    key: 'last_note_date',
    dir: 'desc'
  });

  const [modalProspect, setModalProspect] = useState<Prospect | null>(null);
  const [showSync, setShowSync] = useState(false);
  const [showPackageUpload, setShowPackageUpload] = useState(false);
  const [uploadingPackages, setUploadingPackages] = useState(false);
  const [packageUploadStatus, setPackageUploadStatus] = useState<string>('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [jobIds, setJobIds] = useState<Set<string>>(new Set());
  const [showJobFilter, setShowJobFilter] = useState(false);

  const { copied, copy } = useCopy();
  const debouncedFilters = useDebounce(filters, DEBOUNCE_DELAY);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
  }, []);

  const handlePackageUpload = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      alert('Please upload an Excel file');
      return;
    }

    setUploadingPackages(true);
    setPackageUploadStatus('Reading file...');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);

      setPackageUploadStatus(`Processing ${rows.length} jobs...`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        try {
          const jobId = String(row['Job ID'] || '').trim();
          if (!jobId) continue;

          // Parse pay range (e.g., "$2409.60" -> 2409.60)
          const payRangeStr = String(row['Pay Range'] || '').replace(/[$,]/g, '');
          const grossWeekly = parseFloat(payRangeStr) || 2000;

          // Parse shift type from "Facility Bonus" column (e.g., "5x8 D" -> "5x8")
          const shiftType = String(row['Facility Bonus'] || '').split(' ')[0] || '5x8';
          
          const facility = String(row['Facility'] || '').trim();
          const city = String(row['Location'] || '').trim();
          const state = String(row['State'] || '').trim();
          const specialty = String(row['Specialty'] || '').trim();
          const profession = String(row['Prof.'] || '').trim();
          const startDate = String(row['Start'] || '').trim();
          const duration = parseInt(String(row['Duration'] || '13')) || 13;

          // Calculate hours per week from shift type
          let hoursPerWeek = 40;
          const shiftMatch = shiftType.match(/(\d+)x(\d+)/);
          if (shiftMatch) {
            const daysPerWeek = parseInt(shiftMatch[1]);
            const hoursPerDay = parseInt(shiftMatch[2]);
            hoursPerWeek = daysPerWeek * hoursPerDay;
          }

          // Calculate end date (start + duration weeks)
          let endDate = '';
          if (startDate) {
            const start = new Date(startDate);
            if (!isNaN(start.getTime())) {
              const end = new Date(start);
              end.setDate(end.getDate() + (duration * 7));
              endDate = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
          }

          // Use payPackageService to calculate full package
          const calculated = await payPackageService.calculatePackage(
            jobId,
            state,
            city,
            profession,
            specialty,
            grossWeekly,
            hoursPerWeek
          );

          // Save the package
          const clickData = {
            job_id: jobId,
            facility_name: facility,
            job_city: city,
            job_state: state,
            specialty: specialty,
            start_date: startDate,
            shift_type: shiftType,
          };

          await payPackageService.savePackage(calculated, clickData);
          successCount++;
          
          if ((i + 1) % 10 === 0) {
            setPackageUploadStatus(`Processed ${i + 1}/${rows.length} jobs...`);
          }
        } catch (error) {
          console.error(`Error processing row ${i + 1}:`, error);
          errorCount++;
        }
      }

      setPackageUploadStatus(`Complete! ${successCount} packages created, ${errorCount} errors`);
      showToast(`Uploaded ${successCount} pay packages successfully`, 'success');
      
      setTimeout(() => {
        setShowPackageUpload(false);
        setPackageUploadStatus('');
      }, 3000);

    } catch (error: any) {
      console.error('Upload error:', error);
      setPackageUploadStatus(`Error: ${error.message}`);
      showToast('Failed to upload pay packages', 'error');
    } finally {
      setUploadingPackages(false);
    }
  }, [showToast]);

  // Load data
  const loadData = useCallback(async (loadMore: boolean = false) => {
    if (!loadMore) {
      setLoading(true);
      setProspects([]);
    } else {
      setLoadingMore(true);
    }

    const offset = loadMore ? prospects.length : 0;
    const result = await dataService.fetchProspects(
      debouncedFilters,
      sort.key,
      sort.dir,
      offset
    );

    if (loadMore) {
      setProspects(prev => [...prev, ...result.data]);
    } else {
      setProspects(result.data);
    }

    setTotal(result.total);
    setHasMore(result.hasMore);
    setLoading(false);
    setLoadingMore(false);
  }, [debouncedFilters, sort, prospects.length]);

  useEffect(() => {
    loadData(false);
  }, [debouncedFilters, sort]);

  // Filter prospects
  const displayedProspects = useMemo(() => {
    let filtered = prospects;

    if (jobIds.size > 0) {
      filtered = filtered.filter(p => jobIds.has(p.job_id));
    }

    if (filters.localOnly) {
      filtered = filtered.filter(p => p.candidate_homestate === p.job_state);
    }

    return filtered;
  }, [prospects, jobIds, filters.localOnly]);

  // Unique values
  const specialties = useMemo(() => 
    [...new Set(prospects.map(p => p.specialty))].filter(Boolean).sort(),
    [prospects]
  );

  const recruiters = useMemo(() =>
    [...new Set(prospects.map(p => p.recruiter_name))].filter(Boolean).sort(),
    [prospects]
  );

  const localCount = useMemo(() =>
    prospects.filter(p => p.candidate_homestate === p.job_state).length,
    [prospects]
  );

  // Handlers
  const handleSort = (key: SortKey) => {
    setSort(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleEmail = async (prospect: Prospect) => {
    setEmailLoading(true);
    try {
      // Try to fetch existing pay package
      let pkg = await dataService.fetchPayPackage(prospect.job_id);
      
      // If no package exists, try to generate one
      if (!pkg) {
        console.log('No existing pay package found, generating new one...');
        const profession = prospect.specialty?.includes('SPT') || prospect.specialty?.includes('Sterile') ? 'SURG' :
                         prospect.specialty?.includes('RRT') || prospect.specialty?.includes('RT') ? 'RESP' :
                         prospect.specialty?.includes('MA') ? 'MA' : 'SURG';

        const grossWeekly = 2000;

        const calculated = await payPackageService.calculatePackage(
          prospect.job_id,
          prospect.job_state,
          prospect.job_city,
          profession,
          prospect.specialty,
          grossWeekly,
          40
        );

        console.log('Calculated pay package:', calculated);

        const clickData = {
          job_id: prospect.job_id,
          facility_name: prospect.facility_name || `${prospect.job_city} Medical Center`,
          job_city: prospect.job_city,
          job_state: prospect.job_state,
          specialty: prospect.specialty,
        };

        await payPackageService.savePackage(calculated, clickData);
        pkg = await dataService.fetchPayPackage(prospect.job_id);
        console.log('Saved and fetched pay package:', pkg);
      }

      if (!pkg) {
        throw new Error('Failed to create or fetch pay package');
      }

      const email = dataService.generateEmail(prospect, pkg);
      const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(prospect.candidate_email)}&subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
      
      const win = window.open(url, '_blank');
      if (!win) {
        alert('Pop-up blocked! Please allow pop-ups.');
      }
    } catch (error) {
      console.error('Email error:', error);
      showToast(`Failed to generate email: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleJobLoad = (ids: string[]) => {
    setJobIds(new Set(ids));
    setShowJobFilter(false);
    showToast(`Loaded ${ids.length} Job IDs`, 'success');
  };

  if (showSync) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowSync(false)}
          className="absolute top-4 right-4 z-50 p-2 bg-white rounded-full shadow-lg hover:bg-slate-100"
          aria-label="Close sync"
        >
          <X size={20} strokeWidth={2} />
        </button>
        <InterestedClicksSync />
      </div>
    );
  }

  if (loading && prospects.length === 0) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50">
      {/* Modals */}
      {modalProspect && (
        <PackageModal prospect={modalProspect} onClose={() => setModalProspect(null)} />
      )}
      {showJobFilter && (
        <JobFilterModal onClose={() => setShowJobFilter(false)} onLoad={handleJobLoad} />
      )}
      {showPackageUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <header className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h2 
                  className="text-slate-900 mb-1"
                  style={{ fontSize: DESIGN.text.lg, fontWeight: DESIGN.weight.semibold }}
                >
                  Upload Pay Packages
                </h2>
                <p 
                  className="text-slate-500"
                  style={{ fontSize: DESIGN.text.sm }}
                >
                  Bulk create pay packages from Excel
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPackageUpload(false);
                  setPackageUploadStatus('');
                }}
                disabled={uploadingPackages}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X size={20} strokeWidth={2} className="text-slate-500" />
              </button>
            </header>

            <div className="p-6">
              {uploadingPackages ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
                  <p 
                    className="text-slate-700"
                    style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
                  >
                    {packageUploadStatus}
                  </p>
                </div>
              ) : packageUploadStatus ? (
                <div className="text-center py-8">
                  <Check className="w-12 h-12 text-green-600 mx-auto mb-4" strokeWidth={2} />
                  <p 
                    className="text-slate-700"
                    style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
                  >
                    {packageUploadStatus}
                  </p>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all">
                  <FileUp size={32} strokeWidth={2} className="text-slate-400 mb-3" />
                  <span 
                    className="text-slate-700 mb-1"
                    style={{ fontSize: DESIGN.text.base, fontWeight: DESIGN.weight.semibold }}
                  >
                    Choose Excel File
                  </span>
                  <span 
                    className="text-slate-500 text-center"
                    style={{ fontSize: DESIGN.text.sm }}
                  >
                    Upload job list with pay ranges
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePackageUpload(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {!uploadingPackages && !packageUploadStatus && (
              <footer className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl">
                <p 
                  className="text-slate-600 text-center"
                  style={{ fontSize: DESIGN.text.xs }}
                >
                  Expected columns: Job ID, Pay Range, Facility, Location, State, Specialty, Start Date
                </p>
              </footer>
            )}
          </div>
        </div>
      )}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 
                className="text-slate-900 mb-1"
                style={{ fontSize: DESIGN.text.lg, fontWeight: DESIGN.weight.semibold }}
              >
                Prospects
              </h1>
              <p 
                className="text-slate-500"
                style={{ fontSize: DESIGN.text.xs }}
              >
                {jobIds.size > 0
                  ? `${displayedProspects.length} of ${jobIds.size} filtered jobs`
                  : `${prospects.length} of ${total} total`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPackageUpload(true)}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
                aria-label="Upload pay packages"
                title="Upload Pay Packages from Excel"
              >
                <FileUp size={16} strokeWidth={2} />
                <span className="hidden sm:inline">Pay Packages</span>
              </button>

              <button
                onClick={() => setShowSync(true)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                aria-label="Sync data"
                title="Sync CSV"
              >
                <Upload size={16} strokeWidth={2} />
              </button>

              <button
                onClick={() => setShowJobFilter(true)}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.medium }}
                aria-label="Filter jobs"
                title="Filter by Job IDs"
              >
                <Filter size={16} strokeWidth={2} />
                {jobIds.size > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full" style={{ fontSize: DESIGN.text.xs }}>
                    {jobIds.size}
                  </span>
                )}
              </button>

              <button
                onClick={() => loadData(false)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw size={16} strokeWidth={2} />
              </button>

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="w-56 pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-slate-300"
                  style={{ fontSize: DESIGN.text.sm }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <div>
            <p className="text-slate-500" style={{ fontSize: DESIGN.text.sm }}>Total</p>
            <p className="text-slate-900" style={{ fontSize: DESIGN.text['2xl'], fontWeight: DESIGN.weight.semibold }}>{total}</p>
          </div>
          <div className="flex gap-8">
            <div>
              <p className="text-slate-500" style={{ fontSize: DESIGN.text.sm }}>Loaded</p>
              <p className="text-slate-900" style={{ fontSize: DESIGN.text.xl, fontWeight: DESIGN.weight.semibold }}>{prospects.length}</p>
            </div>
            <div>
              <p className="text-slate-500" style={{ fontSize: DESIGN.text.sm }}>Shown</p>
              <p className="text-slate-900" style={{ fontSize: DESIGN.text.xl, fontWeight: DESIGN.weight.semibold }}>{displayedProspects.length}</p>
            </div>
            <div>
              <p className="text-slate-500" style={{ fontSize: DESIGN.text.sm }}>Local</p>
              <p className="text-green-600" style={{ fontSize: DESIGN.text.xl, fontWeight: DESIGN.weight.semibold }}>{localCount}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filters & Sort */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <SortButton
                  label="Last Note"
                  active={sort.key === 'last_note_date'}
                  direction={sort.dir}
                  onClick={() => handleSort('last_note_date')}
                />
                <SortButton
                  label="Applied"
                  active={sort.key === 'application_date'}
                  direction={sort.dir}
                  onClick={() => handleSort('application_date')}
                />
                <SortButton
                  label="Name"
                  active={sort.key === 'candidate_name'}
                  direction={sort.dir}
                  onClick={() => handleSort('candidate_name')}
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filters.specialty}
                  onChange={(e) => setFilters(prev => ({ ...prev, specialty: e.target.value }))}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                  style={{ fontSize: DESIGN.text.sm }}
                >
                  <option value="all">All Specialties</option>
                  {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <select
                  value={filters.recruiter}
                  onChange={(e) => setFilters(prev => ({ ...prev, recruiter: e.target.value }))}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                  style={{ fontSize: DESIGN.text.sm }}
                >
                  <option value="all">All Recruiters</option>
                  {recruiters.map(r => <option key={r} value={r}>{r}</option>)}
                </select>

                <button
                  onClick={() => setFilters(prev => ({ ...prev, localOnly: !prev.localOnly }))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg transition-colors',
                    filters.localOnly ? 'bg-slate-900 text-white' : 'border border-slate-200 hover:bg-slate-50'
                  )}
                  style={{ fontSize: DESIGN.text.xs, fontWeight: DESIGN.weight.semibold }}
                  aria-pressed={filters.localOnly}
                >
                  Local Only
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setFilters({ search: '', specialty: 'all', recruiter: 'all', localOnly: false });
                setSort({ key: 'last_note_date', dir: 'desc' });
              }}
              className="text-slate-500 hover:text-slate-700 transition-colors"
              style={{ fontSize: DESIGN.text.xs, fontWeight: DESIGN.weight.medium }}
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* List */}
      <main className="max-w-7xl mx-auto px-6 py-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {displayedProspects.length > 0 ? (
            <>
              {displayedProspects.map((prospect) => (
                <ProspectRow
                  key={prospect.id}
                  prospect={prospect}
                  onCopy={copy}
                  copied={copied}
                  onEmail={handleEmail}
                  onPackage={setModalProspect}
                  emailLoading={emailLoading}
                />
              ))}

              {hasMore && (
                <div className="p-4 border-t border-slate-200 text-center">
                  <button
                    onClick={() => loadData(true)}
                    disabled={loadingMore}
                    className={cn(
                      'px-6 py-2 rounded-lg transition-colors disabled:bg-slate-300',
                      DESIGN.color.primary
                    )}
                    style={{ fontSize: DESIGN.text.sm, fontWeight: DESIGN.weight.semibold }}
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      `Load More (${total - prospects.length})`
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <p className="text-slate-500" style={{ fontSize: DESIGN.text.sm }}>
                No prospects found
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Animations */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp {
          animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}