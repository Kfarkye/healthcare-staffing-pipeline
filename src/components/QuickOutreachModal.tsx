// ============================================================================
// src/components/QuickOutreachModal.tsx
// Quick Pay Package Outreach - Extract data from screenshot and generate email
// Design: Apple × Stripe × Vercel
// ============================================================================

import React, { useState, useRef, useCallback } from 'react';
import {
    X,
    Upload,
    Loader2,
    Sparkles,
    Check,
    Mail,
    Copy,
    ExternalLink,
    ChevronDown,
    Building2,
    MapPin,
    Calendar,
    DollarSign,
    Clock,
    User,
    Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { OUTREACH_EMAIL_TEMPLATES, ExtractedOfferData } from '../outreach/templates';

// ============================================================================
// TYPES
// ============================================================================

interface QuickOutreachModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface ExtractedData {
    candidate_id: number | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    facility: string | null;
    city: string | null;
    state: string | null;
    specialty: string | null;
    profession: string | null;
    shiftType: string | null;
    weeklyHours: number | null;
    startDate: string | null;
    endDate: string | null;
    taxableRate: number | null;
    mealsStipend: number | null;
    housingStipend: number | null;
    weeklyStipend: number | null;
    grossWeeklyPay: number | null;
    jobId: string | null;
}

// ============================================================================
// UTILITIES
// ============================================================================

const currency = (n?: number | null) =>
    n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const shortDate = (ds?: string | null) => {
    if (!ds) return 'TBD';
    const d = new Date(`${ds}T00:00:00`);
    return Number.isNaN(d.getTime()) ? 'TBD' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const toOfferData = (data: ExtractedData): ExtractedOfferData => ({
    name: data.name || '',
    email: data.email || '',
    facility: data.facility || '',
    city: data.city || '',
    state: data.state || '',
    specialty: data.specialty || '',
    shiftType: data.shiftType || '',
    weeklyHours: data.weeklyHours || 36,
    startDate: data.startDate,
    endDate: data.endDate,
    taxableRate: data.taxableRate || 0,
    weeklyStipend: data.weeklyStipend || 0,
    grossWeeklyPay: data.grossWeeklyPay || 0,
    jobId: data.jobId ? Number(data.jobId) : null,
    candidateId: data.candidate_id,
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const QuickOutreachModal: React.FC<QuickOutreachModalProps> = ({ isOpen, onClose }) => {
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState('initial_outreach');
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get selected template
    const selectedTemplate = OUTREACH_EMAIL_TEMPLATES.find(t => t.id === selectedTemplateId) || OUTREACH_EMAIL_TEMPLATES[0];

    // Generate email content
    const emailContent = extractedData ? selectedTemplate.generateContent(toOfferData(extractedData)) : null;

    // Reset state
    const reset = useCallback(() => {
        setStatus('idle');
        setError(null);
        setExtractedData(null);
        setCopied(false);
    }, []);

    // Handle file selection
    const handleFileSelect = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file (PNG, JPG, or WebP)');
            return;
        }

        setStatus('uploading');
        setError(null);

        try {
            // Clone file to prevent reference issues
            const fileBlob = new Blob([file], { type: file.type });
            const fileToProcess = new File([fileBlob], file.name, {
                type: file.type,
                lastModified: file.lastModified,
            });

            await new Promise(resolve => setTimeout(resolve, 200));
            setStatus('processing');

            // Convert to base64
            const arrayBuffer = await fileToProcess.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce(
                    (data, byte) => data + String.fromCharCode(byte),
                    ''
                )
            );

            // Call edge function
            const { data, error: fnErr } = await supabase.functions.invoke('process-screenshot', {
                body: {
                    base64Data: base64,
                    mimeType: file.type,
                },
            });

            if (fnErr) {
                throw new Error(fnErr.message || 'Failed to process screenshot');
            }

            if (!data) {
                throw new Error('No data extracted from screenshot');
            }

            console.log('[QuickOutreach] Extracted data:', data);
            setExtractedData(data);
            setStatus('done');

        } catch (err: any) {
            console.error('[QuickOutreach] Error:', err);
            setError(err.message || 'Failed to extract data');
            setStatus('error');
        }
    }, []);

    // Drag and drop handlers
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    // Copy to clipboard
    const handleCopy = async () => {
        if (!emailContent) return;
        const text = `Subject: ${emailContent.subject}\n\n${emailContent.body}`;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Open in email client
    const openInEmail = () => {
        if (!emailContent || !extractedData?.email) return;
        const mailto = `mailto:${extractedData.email}?subject=${encodeURIComponent(emailContent.subject)}&body=${encodeURIComponent(emailContent.body)}`;
        window.open(mailto, '_blank');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-xl"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-slideUp">
                <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes shimmer {
            0% { background-position: -1000px 0; }
            100% { background-position: 1000px 0; }
          }
          .animate-slideUp { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
          .shimmer {
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            background-size: 1000px 100%;
            animation: shimmer 2s infinite;
          }
        `}</style>

                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50 to-white">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg">
                            <Zap size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                                Quick Outreach
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Upload margin calculator screenshot → Get ready-to-send email
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-2xl hover:bg-slate-100 transition-all"
                    >
                        <X size={18} className="text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8">
                    {status === 'idle' || status === 'error' ? (
                        /* Upload Zone */
                        <div
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl p-20 cursor-pointer transition-all ${isDragging
                                    ? 'border-blue-400 bg-blue-50/50 scale-[1.02]'
                                    : status === 'error'
                                        ? 'border-red-200 bg-red-50/30'
                                        : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50/30'
                                }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            />

                            <div className={`p-5 rounded-2xl shadow-inner ${status === 'error' ? 'bg-red-100' : 'bg-gradient-to-br from-slate-100 to-slate-50'
                                }`}>
                                {status === 'error' ? (
                                    <X size={32} className="text-red-500" />
                                ) : (
                                    <Upload size={32} className="text-slate-600" />
                                )}
                            </div>

                            <div className="text-center">
                                {status === 'error' ? (
                                    <>
                                        <p className="text-sm font-medium text-red-600 mb-1">{error}</p>
                                        <p className="text-xs text-slate-500">Click to try again</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm font-semibold text-slate-700 mb-1">
                                            {isDragging ? 'Drop to upload' : 'Drop margin calculator screenshot here'}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            or click to browse • PNG, JPG, WebP
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : status === 'uploading' || status === 'processing' ? (
                        /* Processing State */
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="relative mb-6">
                                {status === 'uploading' ? (
                                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin" strokeWidth={2} />
                                ) : (
                                    <Sparkles className="w-12 h-12 text-blue-500 animate-pulse" strokeWidth={2} />
                                )}
                                <div className="absolute inset-0 bg-blue-400 rounded-full blur-xl opacity-20" />
                            </div>
                            <p className="text-sm font-medium text-slate-600 mb-3">
                                {status === 'uploading' ? 'Uploading...' : 'Extracting data with AI...'}
                            </p>
                            <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 shimmer" />
                            </div>
                        </div>
                    ) : status === 'done' && extractedData && emailContent ? (
                        /* Results */
                        <div className="grid grid-cols-2 gap-6">
                            {/* Left: Extracted Data */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Check size={14} className="text-green-500" />
                                    Extracted Data
                                </h3>

                                {/* Candidate Info */}
                                <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <User size={14} className="text-slate-400" />
                                        <span className="font-medium text-slate-900">{extractedData.name || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Mail size={14} className="text-slate-400" />
                                        <span className="text-slate-600">{extractedData.email || '—'}</span>
                                    </div>
                                </div>

                                {/* Facility Info */}
                                <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Building2 size={14} className="text-slate-400" />
                                        <span className="font-medium text-slate-900">{extractedData.facility || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <MapPin size={14} className="text-slate-400" />
                                        <span className="text-slate-600">
                                            {extractedData.city && extractedData.state
                                                ? `${extractedData.city}, ${extractedData.state}`
                                                : '—'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar size={14} className="text-slate-400" />
                                        <span className="text-slate-600">
                                            {shortDate(extractedData.startDate)} – {shortDate(extractedData.endDate)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock size={14} className="text-slate-400" />
                                        <span className="text-slate-600">
                                            {extractedData.shiftType || '—'} ({extractedData.weeklyHours || 36} hrs/wk)
                                        </span>
                                    </div>
                                </div>

                                {/* Pay Package */}
                                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
                                    <div className="flex items-center gap-2 text-xs font-bold text-green-700 uppercase tracking-wider mb-3">
                                        <DollarSign size={12} />
                                        Pay Package
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-slate-500 text-xs">Taxable Rate</p>
                                            <p className="font-semibold text-slate-900">{currency(extractedData.taxableRate)}/hr</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-500 text-xs">Weekly Stipend</p>
                                            <p className="font-semibold text-slate-900">{currency(extractedData.weeklyStipend)}</p>
                                        </div>
                                        <div className="col-span-2 pt-2 border-t border-green-200">
                                            <p className="text-slate-500 text-xs">Gross Weekly</p>
                                            <p className="font-bold text-xl text-green-700">{currency(extractedData.grossWeeklyPay)}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Template Selector */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                                        Template
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedTemplateId}
                                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                                            className="w-full px-4 py-3 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-medium appearance-none cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            {OUTREACH_EMAIL_TEMPLATES.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Right: Email Preview */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Mail size={14} className="text-blue-500" />
                                    Email Preview
                                </h3>

                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 h-[360px] overflow-y-auto">
                                    <div className="mb-3 pb-3 border-b border-slate-200">
                                        <p className="text-xs text-slate-500 mb-1">To:</p>
                                        <p className="text-sm font-medium text-slate-900">{extractedData.email || '—'}</p>
                                    </div>
                                    <div className="mb-3 pb-3 border-b border-slate-200">
                                        <p className="text-xs text-slate-500 mb-1">Subject:</p>
                                        <p className="text-sm font-medium text-slate-900">{emailContent.subject}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-2">Body:</p>
                                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                                            {emailContent.body}
                                        </pre>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleCopy}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all"
                                    >
                                        {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={openInEmail}
                                        disabled={!extractedData.email}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${extractedData.email
                                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            }`}
                                    >
                                        <ExternalLink size={16} />
                                        Open in Email
                                    </button>
                                </div>

                                {/* Try Another */}
                                <button
                                    onClick={reset}
                                    className="w-full text-sm text-slate-500 hover:text-slate-700 py-2"
                                >
                                    Upload another screenshot
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default QuickOutreachModal;
