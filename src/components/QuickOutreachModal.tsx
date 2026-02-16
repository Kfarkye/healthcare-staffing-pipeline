// ============================================================================
// src/components/QuickOutreachModal.tsx
// Quick Pay Package Outreach - Extract data from screenshot and generate email
// Design: Apple × Stripe × Vercel (SOTA Polish)
// ============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    X,
    Upload,
    Loader2,
    Sparkles,
    Check,
    Mail,
    Copy,
    ChevronDown,
    Building2,
    MapPin,
    Calendar,
    DollarSign,
    Clock,
    User,
    Zap,
    ExternalLink as NovaIcon,
    AlertCircle,
    ArrowRight,
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
    actual_margin: number | null;
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

const generateNovaUrl = (id: number | null) =>
    id ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${id}/new-profile/about` : null;

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
    actualMargin: data.actual_margin,
});

// Helper functions for date formatting within templates

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const QuickOutreachModal: React.FC<QuickOutreachModalProps> = ({ isOpen, onClose }) => {
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState('initial_outreach');
    const [editableSubject, setEditableSubject] = useState('');
    const [editableBody, setEditableBody] = useState('');
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Combine all templates for the selector
    const ALL_TEMPLATES = [...OUTREACH_EMAIL_TEMPLATES];

    // Get selected template
    const selectedTemplate = ALL_TEMPLATES.find(t => t.id === selectedTemplateId) || ALL_TEMPLATES[0];

    // Generate email content
    const emailContent = extractedData ? selectedTemplate.generateContent(toOfferData(extractedData)) : null;

    // Sync editable state when template or data changes
    useEffect(() => {
        if (emailContent) {
            setEditableSubject(emailContent.subject);
            setEditableBody(emailContent.body);
        }
    }, [emailContent]);

    // Reset state when closing or starting over
    useEffect(() => {
        if (!isOpen) {
            setTimeout(reset, 400); // Wait for anim
        }
    }, [isOpen]);

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
            setStatus('error');
            return;
        }

        setStatus('uploading');
        setError(null);

        try {
            // Convert to base64
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce(
                    (data, byte) => data + String.fromCharCode(byte),
                    ''
                )
            );

            setStatus('processing');

            // Call edge function
            const { data, error: fnErr } = await supabase.functions.invoke('process-screenshot', {
                body: {
                    base64Data: base64,
                    mimeType: file.type,
                },
            });

            if (fnErr) throw new Error(fnErr.message || 'Failed to process screenshot');
            if (!data) throw new Error('No data extracted from screenshot');

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
        const text = `${editableSubject}\n\n${editableBody}`;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Outlook integration helper
    const buildOutlookLink = (to: string, cc: string | undefined, subject: string, body: string): string => {
        const encode = (s: string) => encodeURIComponent(s || '');
        return `https://outlook.office.com/mail/deeplink/compose?to=${encode(to)}${cc ? `&cc=${encode(cc)}` : ''}&subject=${encode(subject)}&body=${encode(body)}`;
    };

    // Open in email client
    const openInEmail = () => {
        const to = emailContent?.to || extractedData?.email;
        if (!to) return;

        const url = buildOutlookLink(to, emailContent?.cc, editableSubject, editableBody);
        window.open(url, '_blank');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <style>{`
                @keyframes modal-in {
                    from { transform: scale(0.97) translateY(24px); opacity: 0; }
                    to { transform: scale(1) translateY(0); opacity: 1; }
                }
                @keyframes shimmer-fast {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes scan-line {
                    0% { transform: translateY(-100%); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translateY(400%); opacity: 0; }
                }
                .animate-modal-in { animation: modal-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .glass-premium { 
                    background: rgba(255, 255, 255, 0.94);
                    backdrop-filter: blur(40px) saturate(180%);
                    -webkit-backdrop-filter: blur(40px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 
                        0 25px 50px -12px rgba(0, 0, 0, 0.08),
                        0 0 20px rgba(0, 0, 0, 0.02),
                        inset 0 1px 0 rgba(255, 255, 255, 0.5);
                }
                .shimmer-bg {
                    background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.05), transparent);
                    animation: shimmer-fast 2s infinite;
                }
                .scan-bar {
                    height: 2px;
                    background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.4), transparent);
                    box-shadow: 0 0 15px rgba(37, 99, 235, 0.3);
                    animation: scan-line 3s linear infinite;
                }
            `}</style>

            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl animate-fade-in"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative z-10 w-full max-w-5xl rounded-[32px] glass-premium overflow-hidden animate-modal-in">

                {/* Header - Precise & Clean */}
                <div className="px-10 py-7 border-b border-slate-200/60 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="relative">
                            <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse" />
                            <div className="relative w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg ring-4 ring-blue-50">
                                <Zap size={22} className="text-white fill-white/10" strokeWidth={2.5} />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-slate-900 leading-none">
                                Quick Outreach
                            </h2>
                            <p className="text-sm font-medium text-slate-500 mt-1.5 flex items-center gap-1.5">
                                AI-Powered Extraction
                                <span className="w-1 h-1 rounded-full bg-slate-300" />
                                Instant Templates
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3.5 rounded-2xl bg-slate-100/50 hover:bg-slate-200/70 text-slate-500 transition-all active:scale-95"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-10 min-h-[520px]">
                    {status === 'idle' || status === 'error' ? (
                        /* Upload Zone - High Fidelity Interaction */
                        <div
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => fileInputRef.current?.click()}
                            className={`group relative flex flex-col items-center justify-center gap-6 border-2 border-dashed rounded-[2.5rem] p-24 transition-all duration-500 ${isDragging
                                ? 'border-blue-500 bg-blue-50/40 scale-[1.01] shadow-2xl shadow-blue-500/10'
                                : status === 'error'
                                    ? 'border-red-300 bg-red-50/30'
                                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 hover:shadow-xl hover:shadow-slate-200/50'
                                }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            />

                            <div className={`p-7 rounded-[2rem] shadow-inner transition-transform group-hover:scale-110 duration-500 ${status === 'error' ? 'bg-red-100' : 'bg-gradient-to-br from-white to-slate-50 ring-1 ring-slate-100 shadow-xl shadow-slate-200/40'
                                }`}>
                                {status === 'error' ? (
                                    <AlertCircle size={40} className="text-red-500" />
                                ) : (
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-blue-500 blur-lg opacity-20 scale-150 animate-pulse" />
                                        <Upload size={40} className="relative text-blue-600" strokeWidth={2.2} />
                                    </div>
                                )}
                            </div>

                            <div className="text-center space-y-2">
                                {status === 'error' ? (
                                    <>
                                        <p className="text-base font-bold text-red-600">{error}</p>
                                        <p className="text-sm font-medium text-slate-400">Click anywhere to try another screenshot</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-lg font-bold text-slate-900 leading-tight">
                                            {isDragging ? 'Drop to start scanning' : 'Drop Nova screenshot here'}
                                        </p>
                                        <p className="text-sm font-medium text-slate-500/80">
                                            Accepts margin calculators, profile pages, or both.
                                        </p>
                                        <div className="flex items-center justify-center gap-2 pt-4">
                                            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">PNG</span>
                                            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">JPG</span>
                                            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">WebP</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : status === 'uploading' || status === 'processing' ? (
                        /* Processing - Sophisticated Scanning Visual */
                        <div className="flex flex-col items-center justify-center py-28 relative overflow-hidden">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] border-2 border-blue-100/30 rounded-[3rem] pointer-events-none">
                                <div className="scan-bar absolute left-0 w-full" />
                            </div>

                            <div className="relative mb-8">
                                <div className="absolute inset-0 bg-blue-400 blur-2xl opacity-20 animate-pulse scale-150" />
                                <div className="relative w-20 h-20 flex items-center justify-center bg-white rounded-3xl shadow-2xl ring-1 ring-slate-100">
                                    {status === 'uploading' ? (
                                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" strokeWidth={1.5} />
                                    ) : (
                                        <Sparkles className="w-10 h-10 text-blue-600 animate-bounce" strokeWidth={1.5} />
                                    )}
                                </div>
                            </div>
                            <div className="text-center space-y-3 relative z-10">
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                                    {status === 'uploading' ? 'Ingesting data...' : 'AI Extraction in progress'}
                                </h3>
                                <p className="text-sm font-medium text-slate-500">
                                    Analyzing layout, identifying traveler, and parsing pakage...
                                </p>
                            </div>

                            <div className="mt-10 w-64 h-2 bg-slate-100/80 rounded-full overflow-hidden relative ring-1 ring-slate-200/50">
                                <div className="absolute inset-0 shimmer-bg" />
                            </div>
                        </div>
                    ) : status === 'done' && extractedData && emailContent ? (
                        /* Results - High Information Density & Polish */
                        <div className="grid grid-cols-2 gap-10">

                            {/* Left Column: Intelligence Dashboard */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        Extracted Intelligence
                                    </h3>
                                    {extractedData.candidate_id && (
                                        <a
                                            href={generateNovaUrl(extractedData.candidate_id) || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-blue-100 transition-all border border-blue-100"
                                        >
                                            <NovaIcon size={12} strokeWidth={2.5} />
                                            View on Nova
                                        </a>
                                    )}
                                </div>

                                {/* Traveler Identity Card */}
                                <div className="relative group p-6 rounded-[2rem] bg-gradient-to-br from-white to-slate-50 border border-slate-100 shadow-xl shadow-slate-200/30 overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <User size={64} strokeWidth={1.5} />
                                    </div>
                                    <div className="space-y-4 relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-blue-200">
                                                {extractedData.name?.[0] || '?'}
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-slate-900 leading-none">{extractedData.name || 'Unknown Candidate'}</p>
                                                <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                                                    ID: {extractedData.candidate_id || 'PROSPECTING'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-2">
                                            <div className="bg-white/60 p-3 rounded-2xl border border-white shadow-sm">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Email</p>
                                                <p className="text-xs font-semibold text-slate-700 truncate">{extractedData.email || '—'}</p>
                                            </div>
                                            <div className="bg-white/60 p-3 rounded-2xl border border-white shadow-sm">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Phone</p>
                                                <p className="text-xs font-semibold text-slate-700 truncate">{extractedData.phone || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Assignment Details */}
                                <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 space-y-5">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                                            <Building2 size={18} strokeWidth={2.2} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 leading-tight">{extractedData.facility || 'TBD Facility'}</p>
                                            <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1">
                                                <MapPin size={10} />
                                                {extractedData.city && extractedData.state ? `${extractedData.city}, ${extractedData.state}` : 'Unknown Location'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 pt-2 border-t border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <Calendar size={16} className="text-slate-400" />
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Duration</p>
                                                <p className="text-xs font-bold text-slate-700">{shortDate(extractedData.startDate)} – {shortDate(extractedData.endDate)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Clock size={16} className="text-slate-400" />
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Schedule</p>
                                                <p className="text-xs font-bold text-slate-700">{extractedData.shiftType || 'Standard'} ({extractedData.weeklyHours || 36}h)</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Financial Package - Emerald Glow */}
                                <div className="relative group p-6 rounded-[2rem] bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100 shadow-xl shadow-emerald-500/5 transition-transform hover:scale-[1.02] duration-300">
                                    <div className="absolute top-0 right-0 p-5 text-emerald-100 group-hover:text-emerald-200 transition-colors">
                                        <DollarSign size={80} strokeWidth={1} />
                                    </div>
                                    <div className="relative z-10 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />
                                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mt-0.5">Verified Package</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <p className="text-[11px] font-bold text-emerald-700/60 uppercase mb-1">Hourly</p>
                                                <p className="text-xl font-black text-slate-900 leading-tight">
                                                    {currency(extractedData.taxableRate)}<span className="text-sm font-medium text-slate-400">/hr</span>
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-emerald-700/60 uppercase mb-1">Stipends</p>
                                                <p className="text-xl font-black text-slate-900 leading-tight">
                                                    {currency(extractedData.weeklyStipend)}<span className="text-sm font-medium text-slate-400">/wk</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="pt-4 border-t border-emerald-200/50 flex items-end justify-between">
                                            <div>
                                                <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Gross Weekly Total</p>
                                                <p className="text-3xl font-black text-emerald-700 tracking-tighter mt-1">{currency(extractedData.grossWeeklyPay)}</p>
                                            </div>
                                            <div className="bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-100 text-[10px] font-black text-emerald-600 uppercase tracking-wider">
                                                Net: {currency((extractedData.grossWeeklyPay || 0) * 0.82)} est.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Premium Composition Suite */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                        Composition Suite
                                    </h3>
                                    <div className="h-px flex-1 bg-gradient-to-r from-slate-100 to-transparent" />
                                </div>

                                {/* Template Selector - Stripe Style */}
                                <div className="space-y-3">
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
                                            <Sparkles size={16} />
                                        </div>
                                        <select
                                            value={selectedTemplateId}
                                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                                            className="w-full pl-12 pr-12 py-4 bg-slate-50/50 border border-slate-200 rounded-[1.25rem] text-[14px] font-bold text-slate-700 appearance-none cursor-pointer transition-all hover:bg-white hover:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100/50"
                                        >
                                            {ALL_TEMPLATES.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                            <ChevronDown size={18} strokeWidth={2.5} />
                                        </div>
                                    </div>
                                </div>


                                {/* Email Composer - Jony Ive x Stripe Aesthetic */}
                                <div className="relative flex flex-col h-[460px] bg-white rounded-[2.5rem] border border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden">
                                    {/* Composer Header */}
                                    <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Dispatch</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 opacity-40">
                                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                                        </div>
                                    </div>

                                    {/* Scrollable Composition Area */}
                                    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                                        {/* Recipient Row */}
                                        <div className="flex items-center gap-6 group">
                                            <label className="w-16 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Recipient</label>
                                            <div className="flex-1 text-sm font-bold text-slate-900 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 truncate">
                                                {emailContent?.to || extractedData.email || '—'}
                                            </div>
                                        </div>

                                        {emailContent?.cc && (
                                            <div className="flex items-center gap-6 group -mt-4">
                                                <label className="w-16 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">CC</label>
                                                <div className="flex-1 text-sm font-bold text-slate-900 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 truncate">
                                                    {emailContent.cc}
                                                </div>
                                            </div>
                                        )}

                                        {/* Editable Subject */}
                                        <div className="flex flex-col gap-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Subject_Line</label>
                                            <input
                                                type="text"
                                                value={editableSubject}
                                                onChange={(e) => setEditableSubject(e.target.value)}
                                                className="w-full text-base font-bold text-slate-900 bg-white px-2 py-1 border-b border-transparent focus:border-blue-500 transition-colors focus:outline-none"
                                                placeholder="Enter subject..."
                                            />
                                        </div>

                                        {/* Editable Message Body */}
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between pl-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Message_Body</label>
                                                <div className="px-2 py-0.5 rounded-md bg-blue-50 text-[9px] font-black text-blue-500 uppercase tracking-tighter">AI Optimized</div>
                                            </div>
                                            <textarea
                                                value={editableBody}
                                                onChange={(e) => setEditableBody(e.target.value)}
                                                className="w-full flex-1 min-h-[220px] text-[15px] font-medium text-slate-600 leading-relaxed bg-transparent resize-none focus:outline-none focus:ring-0 custom-scrollbar"
                                                placeholder="Write your message..."
                                            />
                                        </div>
                                    </div>

                                    {/* Optimized Action Bar */}
                                    <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                                        <button
                                            onClick={handleCopy}
                                            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all ${copied
                                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                                : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-white active:scale-95 shadow-sm'
                                                }`}
                                        >
                                            {copied ? <Check size={16} strokeWidth={3} /> : <Copy size={16} strokeWidth={2.5} />}
                                            {copied ? 'Copied' : 'Copy'}
                                        </button>
                                        <button
                                            onClick={openInEmail}
                                            disabled={!(emailContent?.to || extractedData.email)}
                                            className={`flex-[2] flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all ${(emailContent?.to || extractedData.email)
                                                ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl shadow-blue-600/20 active:scale-95'
                                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                }`}
                                        >
                                            <Mail size={16} strokeWidth={2.5} />
                                            Dispatch Now
                                            <ArrowRight size={14} className="ml-1 opacity-70" />
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={reset}
                                    className="w-full text-[11px] font-black text-slate-400 hover:text-blue-500 uppercase tracking-[0.3em] py-4 transition-colors"
                                >
                                    New_Extraction_Session
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
