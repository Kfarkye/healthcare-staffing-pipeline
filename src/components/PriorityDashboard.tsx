// ============================================================================
// Prospect Dashboard
// Connect candidates with opportunities. Every interaction matters.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Mail, DollarSign, Copy, Check,
  RefreshCw, Upload, Filter, X, FileUp, ExternalLink, Loader2,
  Image, FileText
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { payPackageService } from '../services/payPackageService';
import { AIService } from '../services/aiService';
import InterestedClicksSync from './InterestedClicksSync';
import { DashboardShell } from './shared/DashboardShell';
import { PrecisionTable } from './shared/PrecisionTable';


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


interface MappedPayPackage {
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

  async fetchPayPackage(jobId: string): Promise<MappedPayPackage | null> {
    try {
      const pkg = await payPackageService.getPackage(jobId);
      if (!pkg) return null;

      return {
        jobId: pkg.job_id,
        facilityName: pkg.facility_name,
        city: pkg.city,
        state: pkg.state,
        startDate: null, // Dynamic per prospect
        endDate: null,   // Dynamic per prospect
        shiftType: null, // Dynamic per prospect
        hoursPerWeek: pkg.hours_per_week,
        completionBonus: 0,
        taxableHourlyRate: pkg.taxable_hourly_rate,
        stipend: pkg.total_stipend,
        grossWeeklyPay: pkg.gross_weekly_pay,
        meals_weekly: pkg.meals_weekly,
        housing_weekly: pkg.housing_weekly,
      } as MappedPayPackage;
    } catch (error) {
      console.error('Pay package error:', error);
      return null;
    }
  },

  async generatePayPackage(prospect: Prospect): Promise<MappedPayPackage | null> {
    try {
      const clickData = {
        job_id: prospect.job_id,
        facility_name: prospect.facility_name || `Facility in ${prospect.job_city}`,
        job_city: prospect.job_city,
        job_state: prospect.job_state,
        specialty: prospect.specialty,
        profession: prospect.profession || 'RN',
        pay_range: prospect.pay_range || '',
        shift_type: prospect.shift_type || '3x12',
        start_date: prospect.start_date || 'ASAP',
      };

      const generated = await payPackageService.generateFromClick(clickData);

      return {
        jobId: generated.job_id,
        facilityName: generated.facility_name,
        city: generated.city,
        state: generated.state,
        startDate: prospect.start_date || 'ASAP',
        endDate: prospect.end_date || '13 weeks',
        shiftType: generated.shift_type || prospect.shift_type || '3x12',
        hoursPerWeek: generated.hours_per_week,
        completionBonus: 0,
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

  generateEmail(prospect: Prospect, pkg: MappedPayPackage | null) {
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
      shift_type: pkg.shiftType || undefined,
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
        meals_weekly: pkg.meals_weekly || 0,
        housing_weekly: pkg.housing_weekly || 0,
        total_stipend: pkg.stipend || 0,
        gross_weekly_pay: pkg.grossWeeklyPay || 0,
        source: 'calculated',
      } as any // Cast to any to bypass strict PayPackage check if needed, or align exactly
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

// Obsolete components removed. Using PrecisionTable and DashboardShell.

// ============================================================================
// PAY PACKAGE MODAL
// ============================================================================

const PackageModal: React.FC<{
  prospect: Prospect | null;
  onClose: () => void;
}> = ({ prospect, onClose }) => {
  const [pkg, setPkg] = useState<MappedPayPackage | null>(null);
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
  const [uploadedJobIds, setUploadedJobIds] = useState<string[]>([]);
  const [processingQueue, setProcessingQueue] = useState<{ id: string; name: string; status: 'pending' | 'processing' | 'success' | 'error'; type: 'excel' | 'image' }[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [jobIds, setJobIds] = useState<Set<string>>(new Set());
  const [showJobFilter, setShowJobFilter] = useState(false);

  const { copied, copy } = useCopy();
  const debouncedFilters = useDebounce(filters, DEBOUNCE_DELAY);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
  }, []);

  const processImageWithAI = useCallback(async (file: File) => {
    const queueId = Math.random().toString(36).substring(7);
    setProcessingQueue(prev => [...prev, { id: queueId, name: file.name || 'Pasted Image', status: 'processing', type: 'image' }]);

    try {
      // Convert image to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Remove data:image/png;base64,
        };
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const extracted = await AIService.extractPayPackageFromImage(base64, file.type);

      if (!extracted || !extracted.job_id) {
        throw new Error('Could not identify Job ID from image');
      }

      // Calculate package based on extracted gross weekly
      const grossWeekly = payPackageService.parseGrossWeekly(extracted.pay_range);
      const profession = payPackageService.determineProfession(extracted.specialty);
      const hoursPerWeek = payPackageService.parseHoursPerWeek(extracted.shift_type);

      const calculated = await payPackageService.calculatePackage(
        extracted.job_id,
        extracted.job_state || 'CA',
        extracted.job_city || 'San Diego',
        profession,
        extracted.specialty || 'RN',
        grossWeekly || 2500,
        hoursPerWeek
      );

      await payPackageService.savePackage(calculated, {
        job_id: extracted.job_id,
        facility_name: extracted.facility_name,
        job_city: extracted.job_city,
        job_state: extracted.job_state,
        specialty: extracted.specialty,
        shift_type: extracted.shift_type,
        start_date: extracted.start_date,
      });

      setProcessingQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'success' } : item));
      setUploadedJobIds(prev => [...prev, extracted.job_id]);
      showToast(`Extracted Job #${extracted.job_id} successfully`, 'success');

    } catch (error: any) {
      console.error('AI Extraction Error:', error);
      setProcessingQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'error' } : item));
      showToast(error.message || 'Failed to extract data from image', 'error');
    }
  }, [showToast]);

  const handleFileUploads = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadingPackages(true);

    for (const file of fileArray) {
      // Handle Images (Vision)
      if (file.type.startsWith('image/')) {
        await processImageWithAI(file);
        continue;
      }

      // Handle Excel
      if (!file.name.match(/\.(xlsx|xls)$/)) {
        showToast(`Skipping ${file.name}: Only Excel or Images supported`, 'info');
        continue;
      }

      const queueId = Math.random().toString(36).substring(7);
      setProcessingQueue(prev => [...prev, { id: queueId, name: file.name, status: 'processing', type: 'excel' }]);

      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);

        let successCount = 0;
        for (const row of rows) {
          try {
            const jobId = String(row['Job ID'] || '').trim();
            if (!jobId) continue;

            const payRangeStr = String(row['Pay Range'] || '').replace(/[$,]/g, '');
            const grossWeekly = parseFloat(payRangeStr) || 2000;
            const shiftType = String(row['Facility Bonus'] || '').split(' ')[0] || '5x8';
            const facility = String(row['Facility'] || '').trim();
            const city = String(row['Location'] || '').trim();
            const state = String(row['State'] || '').trim();
            const specialty = String(row['Specialty'] || '').trim();
            const profession = String(row['Prof.'] || '').trim();
            const startDate = String(row['Start'] || '').trim();

            let hoursPerWeek = 40;
            const shiftMatch = shiftType.match(/(\d+)x(\d+)/);
            if (shiftMatch) {
              const daysPerWeek = parseInt(shiftMatch[1]);
              const hoursPerDay = parseInt(shiftMatch[2]);
              hoursPerWeek = daysPerWeek * hoursPerDay;
            }

            const calculated = await payPackageService.calculatePackage(jobId, state, city, profession, specialty, grossWeekly, hoursPerWeek);
            await payPackageService.savePackage(calculated, { job_id: jobId, facility_name: facility, job_city: city, job_state: state, specialty, shift_type: shiftType, start_date: startDate });

            setUploadedJobIds(prev => [...prev, jobId]);
            successCount++;
          } catch (e) {
            console.error('Row error:', e);
          }
        }

        setProcessingQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: successCount > 0 ? 'success' : 'error' } : item));
        showToast(`Processed ${file.name}: ${successCount} packages created`, 'success');
      } catch (error: any) {
        setProcessingQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'error' } : item));
        showToast(`Failed to process ${file.name}`, 'error');
      }
    }

    setUploadingPackages(false);
  }, [processImageWithAI, showToast]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles = items
      .filter(item => item.type.indexOf('image') !== -1)
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length > 0) {
      if (!showPackageUpload) setShowPackageUpload(true);
      handleFileUploads(imageFiles);
    }
  }, [showPackageUpload, handleFileUploads]);

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
  // Unique values for filters
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
      let pkg = await dataService.fetchPayPackage(prospect.job_id);

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

        const clickData = {
          job_id: prospect.job_id,
          facility_name: prospect.facility_name || `${prospect.job_city} Medical Center`,
          job_city: prospect.job_city,
          job_state: prospect.job_state,
          specialty: prospect.specialty,
        };

        await payPackageService.savePackage(calculated, clickData);
        pkg = await dataService.fetchPayPackage(prospect.job_id);
      }

      if (!pkg) throw new Error('Failed to create pay package');

      const email = dataService.generateEmail(prospect, pkg);
      const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(prospect.candidate_email)}&subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
      window.open(url, '_blank');
    } catch (error) {
      console.error('Email error:', error);
      showToast('Error generating outreach email', 'error');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleJobLoad = (ids: string[]) => {
    setJobIds(new Set(ids));
    setShowJobFilter(false);
    showToast(`Loaded ${ids.length} Job IDs`, 'success');
  };

  // ============================================================================
  // Table Configuration
  // ============================================================================

  const columns = [
    {
      header: 'Candidate',
      sortKey: 'candidate_name',
      accessor: (p: Prospect) => (
        <div className="flex flex-col min-w-[200px]">
          <button
            onClick={(e) => { e.stopPropagation(); copy(p.candidate_name, 'name', p.id); }}
            className="text-[14px] font-semibold text-slate-900 hover:text-blue-600 transition-colors text-left flex items-center gap-1.5 group"
          >
            {p.candidate_name}
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              {copied?.type === 'name' && copied?.id === p.id
                ? <Check size={12} className="text-green-600" />
                : <Copy size={12} className="text-slate-300" />
              }
            </span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); copy(p.candidate_email, 'email', p.id); }}
            className="text-[12px] text-slate-400 hover:text-slate-600 transition-colors text-left flex items-center gap-1.25 group"
          >
            {p.candidate_email}
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              {copied?.type === 'email' && copied?.id === p.id
                ? <Check size={10} className="text-green-600" />
                : <Copy size={10} className="text-slate-300" />
              }
            </span>
          </button>
        </div>
      )
    },
    {
      header: 'Specialty',
      sortKey: 'specialty',
      accessor: (p: Prospect) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-700">{p.specialty}</span>
          <span className="text-[11px] text-slate-400">{p.profession}</span>
        </div>
      )
    },
    {
      header: 'Location',
      accessor: (p: Prospect) => {
        const isLocal = p.candidate_homestate === p.job_state;
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className={cn("font-medium", isLocal ? "text-green-600" : "text-slate-700")}>
                {p.job_city}, {p.job_state}
              </span>
              {isLocal && (
                <span className="px-1.5 py-0.25 bg-green-50 text-green-700 text-[9px] font-bold uppercase tracking-wider rounded-full border border-green-100">
                  Local
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">Home: {p.candidate_homestate}</span>
          </div>
        );
      }
    },
    {
      header: 'Job ID',
      accessor: (p: Prospect) => (
        <a
          href={`https://nova.ayahealthcare.com/#/recruiting/jobs/${p.job_id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium group"
        >
          #{p.job_id}
          <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      )
    },
    {
      header: 'Applied',
      sortKey: 'application_date',
      accessor: (p: Prospect) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-700 whitespace-nowrap">{formatDate(p.application_date)}</span>
          <span className="text-[11px] text-slate-400 whitespace-nowrap">{p.days_since_application} days ago</span>
        </div>
      )
    },
    {
      header: 'Last Note',
      sortKey: 'last_note_date',
      accessor: (p: Prospect) => {
        const dt = formatDateTime(p.last_note_date);
        return (
          <div className="flex flex-col max-w-[200px]">
            <span className="font-medium text-slate-900 line-clamp-1" title={p.last_note}>
              {p.last_note || '—'}
            </span>
            <span className="text-[11px] text-slate-400">
              {dt.date} {dt.time} {p.last_note_by && `by ${p.last_note_by}`}
            </span>
          </div>
        );
      }
    },
    {
      header: 'Actions',
      className: 'text-right',
      accessor: (p: Prospect) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleEmail(p); }}
            disabled={emailLoading}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            title="Email via Outlook"
          >
            {emailLoading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} strokeWidth={2.5} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setModalProspect(p); }}
            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all active:scale-95"
            title="View Pay Package"
          >
            <DollarSign size={16} strokeWidth={2.5} />
          </button>
        </div>
      )
    }
  ];

  const HeaderActions = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowPackageUpload(true)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all shadow-sm font-semibold text-[13px]"
      >
        <FileUp size={16} />
        <span>Pay Packages</span>
      </button>
      <button
        onClick={() => setShowSync(true)}
        className="p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 rounded-xl transition-all active:scale-95"
        title="Sync CSV"
      >
        <Upload size={18} strokeWidth={2.5} />
      </button>
      <button
        onClick={() => loadData(false)}
        className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all active:scale-95"
        title="Refresh"
      >
        <RefreshCw size={18} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );

  const StatCards = (
    <div className="flex items-center gap-4 py-2">
      {[
        { label: 'Total Leads', value: total, color: 'text-slate-900' },
        { label: 'Loaded', value: prospects.length, color: 'text-slate-600' },
        { label: 'Shown', value: displayedProspects.length, color: 'text-blue-600' },
        { label: 'Local Only', value: localCount, color: 'text-green-600' }
      ].map((stat, i) => (
        <div key={i} className="bg-white/50 border border-slate-200/60 rounded-2xl px-5 py-3 shadow-sm min-w-[140px]">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</div>
          <div className={cn("text-[20px] font-bold tabular-nums", stat.color)}>{stat.value}</div>
        </div>
      ))}
    </div>
  );

  if (loading && prospects.length === 0) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <DashboardShell
      title="Strategic Pipeline"
      subtitle="Connect high-priority candidates with market-leading opportunities."
      eyebrow="Precision Intel"
      actions={HeaderActions}
      stats={StatCards}
    >
      <div className="space-y-6">
        {/* Advanced Filter Bar */}
        <div className="bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-[24px] p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative group">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Search leads..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-[300px] min-w-0 pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-[14px]"
              />
            </div>

            <select
              value={filters.specialty}
              onChange={(e) => setFilters(prev => ({ ...prev, specialty: e.target.value }))}
              className="pl-3 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-[13px] font-medium appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '14px' }}
            >
              <option value="all">Specialty: All</option>
              {specialties.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select
              value={filters.recruiter}
              onChange={(e) => setFilters(prev => ({ ...prev, recruiter: e.target.value }))}
              className="pl-3 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-[13px] font-medium appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '14px' }}
            >
              <option value="all">Recruiter: All</option>
              {recruiters.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <button
              onClick={() => setFilters(prev => ({ ...prev, localOnly: !prev.localOnly }))}
              className={cn(
                "px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all border",
                filters.localOnly
                  ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/20"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              Local Only
            </button>

            <button
              onClick={() => setShowJobFilter(true)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all border flex items-center gap-2",
                jobIds.size > 0
                  ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <Filter size={14} />
              Job Filter {jobIds.size > 0 && `(${jobIds.size})`}
            </button>
          </div>

          <button
            onClick={() => {
              setFilters({ search: '', specialty: 'all', recruiter: 'all', localOnly: false });
              setSort({ key: 'last_note_date', dir: 'desc' });
              setJobIds(new Set());
            }}
            className="text-[12px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest px-2"
          >
            Clear Filters
          </button>
        </div>

        <PrecisionTable
          data={displayedProspects}
          columns={columns}
          isLoading={loading}
          onRowClick={(p) => setModalProspect(p)}
          onSort={(key) => handleSort(key as SortKey)}
          sortKey={sort.key}
          sortDir={sort.dir}
        />

        {hasMore && (
          <div className="flex justify-center pt-8 pb-12">
            <button
              onClick={() => loadData(true)}
              disabled={loadingMore}
              className="group relative px-8 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold text-[14px] shadow-sm hover:shadow-md hover:border-slate-300 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin text-blue-600" />
                  <span>Syncing records...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Load More Records</span>
                  <span className="text-slate-300 group-hover:text-slate-500 font-medium tracking-tight">
                    ({total - prospects.length} remaining)
                  </span>
                </div>
              )}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalProspect && (
          <PackageModal
            prospect={modalProspect}
            onClose={() => setModalProspect(null)}
          />
        )}
        {showJobFilter && (
          <JobFilterModal onClose={() => setShowJobFilter(false)} onLoad={handleJobLoad} />
        )}
        {showSync && (
          <InterestedClicksSync onClose={() => { setShowSync(false); loadData(false); }} />
        )}
        {showPackageUpload && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
            onPaste={handlePaste}
          >
            <div className="bg-white rounded-[32px] max-w-md w-full shadow-2xl overflow-hidden border border-white/20">
              <header className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h2 className="text-slate-900 mb-1 text-[20px] font-bold leading-tight tracking-tight flex items-center gap-2">
                    <RefreshCw className={cn("text-blue-600", uploadingPackages && "animate-spin")} size={20} />
                    Ingest Manifests
                  </h2>
                  <p className="text-slate-500 text-[13px] font-medium">
                    Excel, screenshots, or paste (Cmd+V)
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPackageUpload(false);
                    setUploadedJobIds([]);
                    setProcessingQueue([]);
                  }}
                  disabled={uploadingPackages}
                  className="p-2.5 rounded-2xl hover:bg-white hover:shadow-sm border border-transparent hover:border-200 transition-all disabled:opacity-50 text-slate-400 hover:text-slate-900"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              </header>

              <div className="p-8">
                {processingQueue.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {processingQueue.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group transition-all">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm",
                            item.type === 'excel' ? "bg-green-50 border-green-100 text-green-600" : "bg-purple-50 border-purple-100 text-purple-600"
                          )}>
                            {item.type === 'excel' ? <FileText size={18} /> : <Image size={18} />}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-slate-900 line-clamp-1">{item.name}</span>
                            <span className={cn(
                              "text-[10px] uppercase tracking-wider font-bold",
                              item.status === 'processing' ? "text-blue-500" :
                                item.status === 'success' ? "text-green-600" : "text-red-500"
                            )}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                        {item.status === 'processing' && <Loader2 size={16} className="animate-spin text-blue-500" />}
                        {item.status === 'success' && <Check size={16} className="text-green-600" />}
                        {item.status === 'error' && <X size={16} className="text-red-500" />}
                      </div>
                    ))}

                    {!uploadingPackages && (
                      <button
                        onClick={() => setShowPackageUpload(false)}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-[14px] hover:bg-slate-800 transition-all active:scale-[0.98] shadow-lg shadow-slate-900/10 mt-4"
                      >
                        Done Processing
                      </button>
                    )}
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-[32px] cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all group relative overflow-hidden">
                    <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-[24px] flex items-center justify-center mb-6 group-hover:bg-white group-hover:border-blue-200 group-hover:shadow-md transition-all">
                      <FileUp size={36} strokeWidth={2} className="text-slate-400 group-hover:text-blue-600" />
                    </div>
                    <span className="text-slate-900 mb-2 font-bold text-[18px] tracking-tight">
                      Drop manifests
                    </span>
                    <span className="text-slate-500 text-center text-[13px] font-medium leading-relaxed max-w-[200px]">
                      Excel files, screenshots, or just paste directly
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".xlsx,.xls,image/*"
                      onChange={(e) => {
                        if (e.target.files) handleFileUploads(e.target.files);
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {uploadedJobIds.length > 0 && !uploadingPackages && (
                <div className="px-8 pb-8 border-t border-slate-100 pt-6 bg-slate-50/30">
                  <button
                    onClick={() => {
                      const jobIdsText = uploadedJobIds.join('\n');
                      navigator.clipboard.writeText(jobIdsText);
                      showToast(`Copied ${uploadedJobIds.length} job IDs to clipboard`, 'success');
                    }}
                    className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all active:scale-[0.98] shadow-sm font-bold text-[14px]"
                  >
                    <Copy size={18} strokeWidth={2.5} />
                    Copy {uploadedJobIds.length} Job IDs
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>


      {toast && (
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      )}
    </DashboardShell>
  );
}