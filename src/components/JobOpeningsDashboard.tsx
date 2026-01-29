import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Loader2, Upload, FileText, Copy, Search, X,
    School, MapPin, ArrowUpRight, Filter, Download, TrendingUp,
    CheckCircle, AlertCircle, Zap, Sparkles, DollarSign, Users
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// CONSTANTS
// ============================================================================
const TOAST_DURATION = 4000;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const HIGH_DEMAND_THRESHOLD = 5;
const DEBOUNCE_DELAY = 150;

const US_STATES = [
    'All', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
    'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
    'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
    'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface JobOpeningCSV {
    'Job ID': string | number;
    'Facility'?: string;
    'Title'?: string;
    'Prof.'?: string;
    'Specialty'?: string;
    'Location'?: string; // For "City, ST" format
    'City'?: string;     // For separate City column
    'State'?: string;    // For separate State column
    'Start'?: string | number;
    'Updated'?: string | number;
    'Posted Date'?: string | number;
    'Shift'?: string;
    'Pay Range'?: string | number;
    'Gross Weekly Pay'?: string | number;
    'Weekly Pay'?: string | number;
    'Wkly Gross'?: string | number;
    'Gross Weekly'?: string | number;
    'Aya Interview'?: string;
    'Employment Type'?: string;
    'Open Positions (APN Access / Total)'?: string | number;
    'Aya / Partner Submittals'?: string | number;
    'Duration'?: string | number;
}

interface JobOpening {
    job_id: string;
    facility_name: string | null;
    job_title: string | null;
    profession: string | null;
    specialty: string | null;
    location_city: string | null;
    location_state: string | null;
    start_date: string | null;
    updated_date: string | null;
    posted_date: string | null;
    shift: string | null;
    gross_weekly: number | null;
    employment_type: string | null;
    open_positions: number | null;
    total_submittals: number | null;
    aya_interview: string | null;
    duration_weeks: number | null;
}

interface PayPackage {
    job_id: string;
    facility_name: string | null;
    location_city: string | null;
    location_state: string | null;
    taxable_hourly_rate: number | null;
    gross_weekly_pay: number | null;
    meals_weekly: number | null;
    housing_weekly: number | null;
    total_stipend: number | null;
    is_compliant: boolean | null;
    created_at: string | null;
}

interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface FilterState {
    searchTerm: string;
    stateFilter: string;
    showAyaOffersOnly: boolean;
    activeFilter: 'uc_system' | 'washington' | 'new_jobs' | 'high_demand' | null;
}

interface SortState {
    key: keyof JobOpening;
    direction: 'asc' | 'desc';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const parseDate = (dateValue: string | number | undefined): string | null => {
    if (!dateValue) return null;
    try {
        if (typeof dateValue === 'number' && dateValue > 0 && dateValue < 100000) {
            const excelEpoch = new Date(1899, 11, 30);
            const msPerDay = 86400 * 1000;
            const date = new Date(excelEpoch.getTime() + dateValue * msPerDay);
            return date.toISOString().split('T')[0];
        }
        const date = new Date(dateValue);
        return !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : null;
    } catch {
        return null;
    }
};

const parseCurrency = (value: string | number | undefined): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    const strValue = String(value).trim();
    if (strValue === '' || strValue === '-' || strValue.toLowerCase() === 'n/a') return null;

    const cleaned = strValue.replace(/[^0-9.]/g, '');
    if (cleaned === '') return null;

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
};

const parseOpenPositions = (value: string | number | undefined): number | null => {
    if (!value) return null;
    if (typeof value === 'number') return value;

    const strValue = String(value);
    const match = strValue.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
};

const processRow = (row: JobOpeningCSV): JobOpening => {
    const payRangeValue = row['Pay Range'] || row['Gross Weekly Pay'] || row['Weekly Pay'] || row['Wkly Gross'] || row['Gross Weekly'];
    const processedPayRange = parseCurrency(payRangeValue);

    let city: string | null = null;
    let state: string | null = row['State']?.trim() || null;

    if (row['Location']) {
        const parts = row['Location'].split(',');
        city = parts[0]?.trim() || null;
        if (parts.length > 1 && !state) {
            state = parts[1]?.trim() || null;
        }
    } else if (row['City']) {
        city = row['City'].trim();
    }

    return {
        job_id: String(row['Job ID'] || '').trim(),
        facility_name: row['Facility']?.trim() || null,
        job_title: row['Title']?.trim() || null,
        profession: row['Prof.']?.trim() || null,
        specialty: row['Specialty']?.trim() || null,
        location_city: city,
        location_state: state,
        start_date: parseDate(row['Start']),
        updated_date: parseDate(row['Updated']),
        posted_date: parseDate(row['Posted Date']),
        shift: row['Shift']?.trim() || null,
        gross_weekly: processedPayRange,
        employment_type: row['Employment Type']?.trim() || null,
        open_positions: parseOpenPositions(row['Open Positions (APN Access / Total)']),
        total_submittals: row['Aya / Partner Submittals']
            ? parseInt(String(row['Aya / Partner Submittals']), 10)
            : null,
        aya_interview: row['Aya Interview']?.trim() || null,
        duration_weeks: row['Duration']
            ? parseInt(String(row['Duration']), 10)
            : null,
    };
};


// ============================================================================
// DATA SERVICES
// ============================================================================
class DataService {
    static async fetchJobOpenings(): Promise<JobOpening[]> {
        const { data, error } = await supabase
            .from('job_openings')
            .select('*')
            .order('gross_weekly', { ascending: false, nullsFirst: false })
            .limit(1000);

        if (error) {
            console.error("Error fetching jobs:", error);
            throw error;
        }
        return data || [];
    }

    static async upsertJobOpenings(jobs: Partial<JobOpening>[]): Promise<void> {
        const { error } = await supabase
            .from('job_openings')
            .upsert(jobs, { onConflict: 'job_id' });

        if (error) {
            console.error("Error upserting jobs:", error);
            throw error;
        }
    }

    static async fetchPayPackage(jobId: string): Promise<PayPackage | null> {
        const { data, error } = await supabase
            .from('pay_packages')
            .select('*')
            .eq('job_id', jobId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching pay package for Job ID ${jobId}:`, error);
            return null;
        }
        return data;
    }

    static async fetchPayPackageCount(): Promise<number> {
        const { count, error } = await supabase
            .from('pay_packages')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error("Error fetching pay package count:", error);
            return 0;
        }
        return count || 0;
    }
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================
const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);

    return debouncedValue;
};

// ============================================================================
// COMPONENTS
// ============================================================================
const Toast: React.FC<ToastState & { onClose: () => void }> = ({
    show,
    message,
    type,
    onClose
}) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(onClose, TOAST_DURATION);
            return () => clearTimeout(timer);
        }
    }, [show, onClose]);

    if (!show) return null;

    const icons = {
        success: <CheckCircle size={16} />,
        error: <AlertCircle size={16} />,
        info: <Zap size={16} />
    };
    const colors = {
        success: 'text-emerald-600',
        error: 'text-red-600',
        info: 'text-blue-600'
    };

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="bg-white/95 backdrop-blur-xl px-4 py-3 rounded-full shadow-2xl border border-gray-100 flex items-center gap-3 min-w-[200px]">
                <span className={colors[type]}>{icons[type]}</span>
                <span className="text-sm font-medium text-gray-900">{message}</span>
            </div>
        </div>
    );
};

const MetricCard: React.FC<{
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    trend?: number;
    isActive?: boolean;
    onClick?: () => void;
}> = ({ title, value, subtitle, icon: Icon, trend, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`
                group relative w-full text-left p-6 rounded-2xl transition-all duration-300 
                ${isActive
                    ? 'bg-gray-900 text-white shadow-xl shadow-gray-900/10 scale-[1.02]'
                    : 'bg-white hover:shadow-lg hover:shadow-gray-200/50 border border-gray-100'
                } 
                ${onClick ? 'cursor-pointer' : 'cursor-default'}
            `}
        >
            <div className="flex items-start justify-between">
                <div className="space-y-4">
                    <div className={`inline-flex p-2.5 rounded-xl ${isActive ? 'bg-white/10' : 'bg-gray-50'}`}>
                        <Icon size={20} strokeWidth={2} className={isActive ? 'text-white' : 'text-gray-600'} />
                    </div>
                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wider ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                            {title}
                        </p>
                        <p className={`text-3xl font-bold mt-1 ${isActive ? 'text-white' : 'text-gray-900'}`}>
                            {value}
                        </p>
                        {subtitle && (
                            <p className={`text-xs mt-1 ${isActive ? 'text-gray-400' : 'text-gray-500'}`}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>
                {trend !== undefined && (
                    <div className={`flex items-center gap-1 text-xs font-semibold ${trend > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        <TrendingUp size={14} className={trend < 0 ? 'rotate-180' : ''} />
                        <span>{Math.abs(trend)}%</span>
                    </div>
                )}
            </div>
        </button>
    );
};

const PayPackageModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    jobId: string | null;
    jobDetails?: { facility_name?: string; location?: string };
}> = ({ isOpen, onClose, jobId, jobDetails }) => {
    const [payPackage, setPayPackage] = useState<PayPackage | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && jobId) {
            setIsLoading(true);
            DataService.fetchPayPackage(jobId).then(data => {
                setPayPackage(data);
                setIsLoading(false);
            });
        } else {
            setPayPackage(null);
        }
    }, [isOpen, jobId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Pay Package Details</h2>
                        <p className="text-sm text-gray-500 mt-1">Job ID: {jobId}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} strokeWidth={2} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                        </div>
                    ) : payPackage ? (
                        <div className="space-y-4">
                            {jobDetails?.facility_name && (
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Facility</p>
                                    <p className="text-sm text-gray-900 mt-1">{jobDetails.facility_name}</p>
                                </div>
                            )}

                            {jobDetails?.location && (
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Location</p>
                                    <p className="text-sm text-gray-900 mt-1">{jobDetails.location}</p>
                                </div>
                            )}

                            <div className="pt-4 space-y-3 border-t border-gray-100">
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Taxable Hourly Rate</span>
                                    <span className="text-sm font-semibold text-gray-900">
                                        ${payPackage.taxable_hourly_rate?.toFixed(2) || '—'}
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Gross Weekly Pay</span>
                                    <span className="text-sm font-semibold text-gray-900">
                                        ${payPackage.gross_weekly_pay?.toLocaleString() || '—'}
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Weekly Meals Stipend</span>
                                    <span className="text-sm font-semibold text-gray-900">
                                        ${payPackage.meals_weekly?.toFixed(2) || '—'}
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Weekly Housing Stipend</span>
                                    <span className="text-sm font-semibold text-gray-900">
                                        ${payPackage.housing_weekly?.toFixed(2) || '—'}
                                    </span>
                                </div>

                                <div className="flex justify-between pt-3 border-t border-gray-100">
                                    <span className="text-sm font-medium text-gray-900">Total Stipend</span>
                                    <span className="text-sm font-bold text-gray-900">
                                        ${payPackage.total_stipend?.toFixed(2) || '—'}
                                    </span>
                                </div>
                            </div>

                            {payPackage.is_compliant !== null && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-center gap-2">
                                        {payPackage.is_compliant ? (
                                            <>
                                                <CheckCircle size={16} className="text-emerald-500" />
                                                <span className="text-sm text-emerald-700 font-medium">Compliant</span>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle size={16} className="text-amber-500" />
                                                <span className="text-sm text-amber-700 font-medium">Review Required</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <div className="inline-flex p-3 bg-gray-50 rounded-full mb-3">
                                <DollarSign size={24} strokeWidth={1.5} className="text-gray-400" />
                            </div>
                            <p className="text-sm text-gray-500">No pay package data available</p>
                            <p className="text-xs text-gray-400 mt-1">It is calculated automatically after import.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
interface JobOpeningsDashboardProps {
    selectedJobId?: string | null;
    onViewApplicants?: (jobId: string) => void;
    hideHeader?: boolean;
}

export default function JobOpeningsDashboard({
    selectedJobId = null,
    onViewApplicants,
    hideHeader = false
}: JobOpeningsDashboardProps = {}): JSX.Element {
    const [jobOpenings, setJobOpenings] = useState<JobOpening[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [filters, setFilters] = useState<FilterState>({
        searchTerm: '',
        stateFilter: 'All',
        showAyaOffersOnly: false,
        activeFilter: null
    });
    const [sortBy, setSortBy] = useState<SortState>({
        key: 'gross_weekly',
        direction: 'desc'
    });
    const [toast, setToast] = useState<ToastState>({
        show: false,
        message: '',
        type: 'success'
    });
    const [newlyAddedJobIds, setNewlyAddedJobIds] = useState<Set<string>>(new Set());
    const [isDragging, setIsDragging] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [payPackageCount, setPayPackageCount] = useState<number>(0);
    const [payPackageModal, setPayPackageModal] = useState<{
        isOpen: boolean;
        jobId: string | null;
        jobDetails?: { facility_name?: string; location?: string };
    }>({ isOpen: false, jobId: null });

    const selectedRowRef = useRef<HTMLTableRowElement>(null);

    const debouncedSearchTerm = useDebounce(filters.searchTerm, DEBOUNCE_DELAY);

    const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
        setToast({ show: true, message, type });
    }, []);

    const loadDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            const jobsPromise = DataService.fetchJobOpenings();
            const countPromise = DataService.fetchPayPackageCount();

            const [jobsData, countData] = await Promise.all([jobsPromise, countPromise]);

            setJobOpenings(jobsData);
            setPayPackageCount(countData);
        } catch (error) {
            showToast('Connection error', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Scroll to selected job when selectedJobId changes
    useEffect(() => {
        if (selectedJobId && selectedRowRef.current) {
            setTimeout(() => {
                selectedRowRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 300);
        }
    }, [selectedJobId]);

    const handleSort = useCallback((key: keyof JobOpening) => {
        setSortBy(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    const openPayPackageModal = useCallback((job: JobOpening) => {
        setPayPackageModal({
            isOpen: true,
            jobId: job.job_id,
            jobDetails: {
                facility_name: job.facility_name || undefined,
                location: job.location_city && job.location_state
                    ? `${job.location_city}, ${job.location_state}`
                    : job.location_state || undefined
            }
        });
    }, []);

    const filteredAndSortedJobs = useMemo(() => {
        let filtered = [...jobOpenings];

        if (filters.activeFilter) {
            switch (filters.activeFilter) {
                case 'uc_system':
                    filtered = filtered.filter(j =>
                        (j.facility_name?.toLowerCase() || '').includes('uc') ||
                        (j.facility_name?.toLowerCase() || '').includes('university of california')
                    );
                    break;
                case 'washington':
                    filtered = filtered.filter(j => j.location_state === 'WA');
                    break;
                case 'new_jobs':
                    filtered = filtered.filter(j => newlyAddedJobIds.has(j.job_id));
                    break;
                case 'high_demand':
                    filtered = filtered.filter(j => (j.open_positions || 0) >= HIGH_DEMAND_THRESHOLD);
                    break;
            }
        }

        if (debouncedSearchTerm) {
            const searchLower = debouncedSearchTerm.toLowerCase();
            filtered = filtered.filter(j =>
                j.facility_name?.toLowerCase().includes(searchLower) ||
                j.specialty?.toLowerCase().includes(searchLower) ||
                j.job_id?.toLowerCase().includes(searchLower) ||
                j.job_title?.toLowerCase().includes(searchLower)
            );
        }

        if (filters.stateFilter !== 'All') {
            filtered = filtered.filter(j => j.location_state === filters.stateFilter);
        }

        if (filters.showAyaOffersOnly) {
            filtered = filtered.filter(j => j.aya_interview?.toLowerCase().includes('offer'));
        }

        filtered.sort((a, b) => {
            const aIsNew = newlyAddedJobIds.has(a.job_id);
            const bIsNew = newlyAddedJobIds.has(b.job_id);
            if (aIsNew && !bIsNew) return -1;
            if (!aIsNew && bIsNew) return 1;

            const aVal = a[sortBy.key];
            const bVal = b[sortBy.key];
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            if (aVal < bVal) return sortBy.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortBy.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [jobOpenings, debouncedSearchTerm, filters, sortBy, newlyAddedJobIds]);

    const copyJobIds = useCallback(async () => {
        try {
            const jobIds = filteredAndSortedJobs.map(job => job.job_id).join('\n');
            await navigator.clipboard.writeText(jobIds);
            showToast(`${filteredAndSortedJobs.length} IDs copied`, 'success');
        } catch (error) {
            showToast('Copy failed', 'error');
        }
    }, [filteredAndSortedJobs, showToast]);

    const handleFileUpload = useCallback(async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            showToast(`Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`, 'error');
            return;
        }

        setIsUploading(true);
        setNewlyAddedJobIds(new Set());
        const existingJobIds = new Set(jobOpenings.map(j => j.job_id));
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json<JobOpeningCSV>(worksheet);
                const processedJobs = jsonData.map(processRow).filter(job => job.job_id && job.job_id.trim() !== '');

                if (processedJobs.length === 0) {
                    throw new Error("No valid jobs found in file");
                }

                const newJobs = processedJobs.filter(job => !existingJobIds.has(job.job_id));
                await DataService.upsertJobOpenings(processedJobs);

                setNewlyAddedJobIds(new Set(newJobs.map(j => j.job_id)));
                await loadDashboardData(); // Reload all data including counts
                showToast(
                    newJobs.length > 0
                        ? `${newJobs.length} new, ${processedJobs.length - newJobs.length} updated`
                        : `${processedJobs.length} updated`,
                    'success'
                );
            } catch (error: any) {
                showToast(error.message || 'Processing error', 'error');
            } finally {
                setIsUploading(false);
            }
        };

        reader.onerror = () => {
            showToast('Read error', 'error');
            setIsUploading(false);
        };

        reader.readAsArrayBuffer(file);
    }, [jobOpenings, loadDashboardData, showToast]);

    const filterCounts = useMemo(() => ({
        ucSystem: jobOpenings.filter(j =>
            (j.facility_name?.toLowerCase() || '').includes('uc') ||
            (j.facility_name?.toLowerCase() || '').includes('university of california')
        ).length,
        washington: jobOpenings.filter(j => j.location_state === 'WA').length,
        highDemand: jobOpenings.filter(j => (j.open_positions || 0) >= HIGH_DEMAND_THRESHOLD).length
    }), [jobOpenings]);

    const dragDropHandlers = {
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(true);
        },
        onDragLeave: (e: React.DragEvent) => {
            if (e.currentTarget === e.target) {
                setIsDragging(false);
            }
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const excelFile = Array.from(e.dataTransfer.files).find(f =>
                f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
            );
            if (excelFile) {
                handleFileUpload(excelFile);
            } else {
                showToast('Excel files only', 'error');
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-50" {...dragDropHandlers}>
            <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, show: false }))} />
            <PayPackageModal
                isOpen={payPackageModal.isOpen}
                onClose={() => setPayPackageModal({ isOpen: false, jobId: null })}
                jobId={payPackageModal.jobId}
                jobDetails={payPackageModal.jobDetails}
            />

            {!hideHeader && (
                <header className="bg-white border-b border-gray-100">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                            <div className="flex items-center gap-3">
                                <h1 className="text-lg font-semibold text-gray-900">Job Openings</h1>
                                <span className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-full">
                                    {jobOpenings.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href="https://ssrsreports-ayahealthcare.msappproxy.net/reports/report/Recruiting/MyAya%20Interested%20Clicks"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all duration-200"
                                    aria-label="Interested Clicks"
                                >
                                    <ArrowUpRight size={18} strokeWidth={2} />
                                </a>
                                <label
                                    htmlFor="file-upload"
                                    className={`
                                    inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold 
                                    text-white bg-gray-900 rounded-full hover:bg-gray-800 
                                    transition-all duration-200 cursor-pointer 
                                    ${isUploading ? 'opacity-50 cursor-wait' : ''}
                                `}
                                >
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Uploading</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={16} strokeWidth={2} />
                                            <span>Import</span>
                                        </>
                                    )}
                                    <input
                                        id="file-upload"
                                        type="file"
                                        accept=".xlsx,.xls"
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
                    </div>
                </header>
            )}

            <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <MetricCard
                        title="Packages Ready"
                        value={payPackageCount}
                        subtitle={`${Math.round((payPackageCount / (jobOpenings.length || 1)) * 100)}% of jobs`}
                        icon={CheckCircle}
                    />
                    <MetricCard
                        title="UC System"
                        value={filterCounts.ucSystem}
                        subtitle="California positions"
                        icon={School}
                        isActive={filters.activeFilter === 'uc_system'}
                        onClick={() => setFilters(prev => ({ ...prev, activeFilter: prev.activeFilter === 'uc_system' ? null : 'uc_system' }))}
                    />
                    <MetricCard
                        title="Washington"
                        value={filterCounts.washington}
                        subtitle="Pacific Northwest"
                        icon={MapPin}
                        isActive={filters.activeFilter === 'washington'}
                        onClick={() => setFilters(prev => ({ ...prev, activeFilter: prev.activeFilter === 'washington' ? null : 'washington' }))}
                    />
                    <MetricCard
                        title="High Demand"
                        value={filterCounts.highDemand}
                        subtitle="5+ openings"
                        icon={TrendingUp}
                        isActive={filters.activeFilter === 'high_demand'}
                        onClick={() => setFilters(prev => ({ ...prev, activeFilter: prev.activeFilter === 'high_demand' ? null : 'high_demand' }))}
                    />
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-1.5 mb-8">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search size={18} strokeWidth={2} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search facilities, specialties, or IDs..."
                                value={filters.searchTerm}
                                onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                                className="w-full pl-11 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none"
                            />
                            {filters.searchTerm && (
                                <button
                                    onClick={() => setFilters(prev => ({ ...prev, searchTerm: '' }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X size={14} strokeWidth={2} className="text-gray-400" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`
                                    inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl 
                                    transition-all duration-200 
                                    ${showFilters ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}
                                `}
                            >
                                <Filter size={16} strokeWidth={2} />
                                Filters
                                {(filters.stateFilter !== 'All' || filters.showAyaOffersOnly) && (
                                    <span className="px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                                        {(filters.stateFilter !== 'All' ? 1 : 0) + (filters.showAyaOffersOnly ? 1 : 0)}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={copyJobIds}
                                disabled={filteredAndSortedJobs.length === 0}
                                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl transition-all duration-200 disabled:opacity-30"
                            >
                                <Copy size={16} strokeWidth={2} />
                                <span className="hidden sm:inline">Copy IDs</span>
                                <span className="px-1.5 py-0.5 text-xs bg-gray-100 rounded-full">
                                    {filteredAndSortedJobs.length}
                                </span>
                            </button>
                        </div>
                    </div>
                    {showFilters && (
                        <div className="flex items-center gap-2 px-2 pt-2 pb-1 border-t border-gray-100 mt-2">
                            <select
                                value={filters.stateFilter}
                                onChange={(e) => setFilters(prev => ({ ...prev, stateFilter: e.target.value }))}
                                className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-gray-400 focus:ring-0"
                            >
                                {US_STATES.map(state => (
                                    <option key={state} value={state}>
                                        {state === 'All' ? 'All States' : state}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => setFilters(prev => ({ ...prev, showAyaOffersOnly: !prev.showAyaOffersOnly }))}
                                className={`
                                    px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 
                                    ${filters.showAyaOffersOnly ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}
                                `}
                            >
                                Aya Offers
                            </button>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th onClick={() => handleSort('job_id')} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900">ID</th>
                                    <th onClick={() => handleSort('facility_name')} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900">Facility</th>
                                    <th onClick={() => handleSort('specialty')} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900">Specialty</th>
                                    <th onClick={() => handleSort('location_state')} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900">Location</th>
                                    <th onClick={() => handleSort('duration_weeks')} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900">Duration</th>
                                    <th onClick={() => handleSort('gross_weekly')} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900">Pay Range</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Package</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {isLoading && jobOpenings.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-24 text-center">
                                            <div className="inline-flex flex-col items-center gap-3">
                                                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                                                <p className="text-sm text-gray-500">Loading positions...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredAndSortedJobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-24 text-center">
                                            <div className="inline-flex flex-col items-center gap-2">
                                                <div className="p-3 bg-gray-50 rounded-full">
                                                    <FileText size={24} strokeWidth={1.5} className="text-gray-400" />
                                                </div>
                                                <p className="text-sm font-medium text-gray-900">No positions found</p>
                                                <p className="text-xs text-gray-500">
                                                    {filters.searchTerm || filters.activeFilter
                                                        ? 'Try adjusting filters'
                                                        : 'Import data to get started'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAndSortedJobs.map((job) => {
                                        const isSelected = selectedJobId === job.job_id;
                                        return (
                                            <tr
                                                key={job.job_id}
                                                ref={isSelected ? selectedRowRef : null}
                                                className={`transition-colors ${isSelected
                                                        ? 'bg-blue-50 hover:bg-blue-100'
                                                        : 'hover:bg-gray-50/50'
                                                    }`}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-mono text-gray-600">{job.job_id}</span>
                                                        {newlyAddedJobIds.has(job.job_id) && (
                                                            <span className="px-2 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-full">New</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-medium text-gray-900">{job.facility_name || '—'}</p>
                                                        {job.job_title && (<p className="text-xs text-gray-500 truncate max-w-xs">{job.job_title}</p>)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg">{job.specialty || '—'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-600">{job.location_city && job.location_state ? `${job.location_city}, ${job.location_state}` : (job.location_state || '—')}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm text-gray-600">{job.duration_weeks ? `${job.duration_weeks}w` : '—'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {job.gross_weekly ? (<span className="text-sm font-semibold text-gray-900">${job.gross_weekly.toLocaleString()}</span>) : (<span className="text-sm text-gray-400">—</span>)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => openPayPackageModal(job)}
                                                            className="p-2 hover:bg-emerald-50 rounded-lg transition-colors group"
                                                            title="View pay package details"
                                                        >
                                                            <DollarSign size={16} strokeWidth={2} className="text-gray-400 group-hover:text-emerald-600" />
                                                        </button>
                                                        {onViewApplicants && (
                                                            <button
                                                                onClick={() => onViewApplicants(job.job_id)}
                                                                className="p-2 hover:bg-blue-50 rounded-lg transition-colors group"
                                                                title="View candidates who clicked this job"
                                                            >
                                                                <Users size={16} strokeWidth={2} className="text-gray-400 group-hover:text-blue-600" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {isDragging && (
                <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-40 flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <div className="inline-flex p-6 bg-gray-100 rounded-3xl">
                            <Download size={32} strokeWidth={1.5} className="text-gray-600" />
                        </div>
                        <p className="text-lg font-medium text-gray-900">Drop Excel file</p>
                    </div>
                </div>
            )}
        </div>
    );
}