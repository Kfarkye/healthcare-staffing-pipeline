import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Send, Copy, Download, ChevronRight, Check, Upload, Trash2, Link,
  FileText, Loader2 as Loader, Phone, ExternalLink, Eye
} from 'lucide-react';
import { EmailModalShell } from '../shared/EmailModalShell';
import { supabase } from '../../lib/supabase';
import type { Prospect } from '../../shared/types/database';
import { ExtractionService } from '../../services/extractionService';
import type { ExtractedData } from '../../types/prospects';
import {
  OUTREACH_EMAIL_TEMPLATES,
  RESPONSE_EMAIL_TEMPLATES,
  OPS_EMAIL_TEMPLATES,
  getTemplateById,
  type TemplateCategory,
  type ExtractedOfferData,
} from '../../outreach/templates';
import { trackEvent } from '../../utils/telemetry';

// ============================================================================
// TYPES
// ============================================================================

interface EmailTemplateModalProps {
  isOpen: boolean;
  prospect: Prospect;
  extractedData: ExtractedData | null;
  onClose: () => void;
  onSend: () => void;
  showToastNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: UploadStatus;
  progress: number;
  url?: string;
  error?: string;
  fileObject: File;
  previewUrl?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];

const EXTRACTABLE_FILE_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_FILE_SIZE_MB = 25;
const STORAGE_BUCKET = 'screenshots';
const CC_EMAIL = 'Tiffany.Chavez@ayahealthcare.com';
const NOVAL_URL = 'https://noval.ai';

// ============================================================================
// UTILITIES
// ============================================================================

const formatCurrency = (amount?: number | null): string => {
  if (amount == null || Number.isNaN(Number(amount)) || Number(amount) === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount));
};

const formatDate = (dateString?: string | null): string => {
  if (!dateString) return 'ASAP';
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? 'ASAP'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const sanitizeFilename = (filename: string): string =>
  filename.replace(/[^\w.\-]+/g, '_');

const encodeParam = (s: string): string =>
  encodeURIComponent(s ?? '');

const buildOutlookLink = (to: string, cc: string | undefined, subject: string, body: string): string =>
  `https://outlook.office.com/mail/deeplink/compose?to=${encodeParam(to)}${cc ? `&cc=${encodeParam(cc)}` : ''
  }&subject=${encodeParam(subject)}&body=${encodeParam(body)}`;

const buildRingCentralLink = (phoneNumber: string | null): string =>
  `rcapp://call?number=${phoneNumber?.replace(/[\s\-\(\)]/g, '')}`;

const toExtractedOfferData = (p: Prospect, e: ExtractedData | null): ExtractedOfferData => ({
  name: p.name || '',
  email: p.email || '',
  facility: e?.facility || (p as any).facility || '',
  city: e?.city || (p as any).city || '',
  state: e?.state || p.home_state || '',
  shiftType: e?.shiftType || (p as any).shift || '',
  weeklyHours: e?.weeklyHours ?? ((p as any).hours_per_week ?? 40),
  startDate: e?.startDate || (p.available_start_date as string) || null,
  endDate: e?.endDate || null,
  taxableRate: e?.taxableRate ?? ((p as any).taxable_rate ?? 0),
  weeklyStipend: e?.weeklyStipend ?? ((p as any).weekly_stipend ?? 0),
  grossWeeklyPay: e?.grossWeeklyPay ?? ((p as any).gross_weekly ?? 0),
  specialty: e?.specialty || p.specialty || p.profession || '',
  jobId: (e as any)?.jobId ? Number((e as any).jobId) : null,
  candidateId: p.candidate_id ? Number(p.candidate_id) : ((e as any)?.candidateId ? Number((e as any).candidateId) : null),
  actualMargin: (e as any)?.actualMargin ?? (e as any)?.actual_margin ?? null,
});

const createFilePreview = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    if (!EXTRACTABLE_FILE_TYPES.includes(file.type)) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EmailTemplateModal({
  isOpen,
  prospect,
  extractedData,
  onClose,
  onSend,
  showToastNotification,
}: EmailTemplateModalProps) {
  // State
  const [extractedDataLocal, setExtractedDataLocal] = useState<ExtractedData | null>(
    extractedData || prospect.template_extracted_data || null
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const baseData = useMemo(() => toExtractedOfferData(prospect, extractedDataLocal), [prospect, extractedDataLocal]);

  // Template State
  const [category, setCategory] = useState<TemplateCategory>('outreach');

  const pool = useMemo(() => {
    switch (category) {
      case 'response': return RESPONSE_EMAIL_TEMPLATES;
      case 'ops': return OPS_EMAIL_TEMPLATES;
      case 'outreach':
      default:
        return OUTREACH_EMAIL_TEMPLATES;
    }
  }, [category]);

  const initialTemplateId = useMemo(() => {
    const template = pool.find(t => t.id === 'hourly_rate_outreach');
    return template ? template.id : pool[0]?.id || '';
  }, [pool]);

  const [templateId, setTemplateId] = useState<string>(initialTemplateId);
  const selectedTemplate = useMemo(() => getTemplateById(templateId, category), [templateId, category]);

  // Email State
  const [recipient, setRecipient] = useState(prospect.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // File State
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const phoneNumber = prospect.phone;

  // Update email when template/data changes
  useEffect(() => {
    if (selectedTemplate) {
      const content = selectedTemplate.generateContent(baseData);
      setRecipient(content.to || baseData.email || '');
      setSubject(content.subject);
      setBody(content.body);
    }
  }, [selectedTemplate, baseData]);

  const hasMinimalJobData = useMemo(() => {
    return baseData.grossWeeklyPay > 0 || baseData.facility || (baseData.startDate && baseData.startDate !== 'ASAP');
  }, [baseData]);

  // Persist template data to database
  const persistTemplateData = async (data: ExtractedOfferData, filePath?: string) => {
    try {
      const { error } = await supabase
        .from('prospects')
        .update({
          template_file_path: filePath || prospect.template_file_path,
          template_extracted_data: data,
          template_uploaded_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);

      if (error) throw error;

      trackEvent('email_extraction_used', {
        kind: 'prospect',
        extraction_type: 'pay_package',
        success: true,
      });
    } catch (error) {
      console.error('[Persistence] Save error:', error);
      showToastNotification('Failed to save template data', 'error');
    }
  };

  // File upload handlers
  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      return `Unsupported file type: ${file.type || 'unknown'}`;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File too large (max ${MAX_FILE_SIZE_MB}MB)`;
    }
    return null;
  };

  const createUploadFile = async (file: File): Promise<UploadedFile> => {
    const previewUrl = await createFilePreview(file);
    return {
      id: `${file.name}-${file.size}-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'idle',
      progress: 0,
      fileObject: file,
      previewUrl,
    };
  };

  const handleFileSelect = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(fileList)) {
      const error = validateFile(file);
      const uploadFile = await createUploadFile(file);

      if (error) {
        uploadFile.status = 'error';
        uploadFile.error = error;
        newFiles.push(uploadFile);
        continue;
      }

      uploadFile.status = 'uploading';
      uploadFile.progress = 15;
      newFiles.push(uploadFile);
      uploadSingleFile(file, uploadFile.id).catch(() => { });
    }

    setFiles(prev => [...newFiles, ...prev]);
  };

  const uploadSingleFile = async (file: File, fileId: string) => {
    try {
      updateFileProgress(fileId, 40);

      const path = `${prospect?.candidate_id || 'anonymous'}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: true, cacheControl: '3600' });

      if (error) {
        markFileError(fileId, error.message || 'Upload failed');
        return;
      }

      updateFileProgress(fileId, 85);

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(data.path);

      markFileComplete(fileId, publicUrlData.publicUrl);

      // Extract if extractable type
      if (EXTRACTABLE_FILE_TYPES.includes(file.type)) {
        await handleExtractData(file, path);
      }
    } catch (error: any) {
      markFileError(fileId, error?.message || 'Upload error');
    }
  };

  const handleExtractData = async (file: File, storagePath?: string) => {
    if (isExtracting) return;
    setIsExtracting(true);

    try {
      const extracted = await ExtractionService.extractDataFromAssignmentFile(file);

      // Normalize to match templates ExtractedOfferData (number types for IDs)
      const parsedData: ExtractedOfferData = {
        name: prospect.name || extracted.name || '',
        email: prospect.email || extracted.email || '',
        facility: extracted.facility || '',
        city: extracted.city || '',
        state: extracted.state || '',
        shiftType: extracted.shiftType || '',
        weeklyHours: extracted.weeklyHours || 40,
        startDate: extracted.startDate || null,
        endDate: extracted.endDate || null,
        taxableRate: extracted.taxableRate || 0,
        weeklyStipend: extracted.weeklyStipend || 0,
        grossWeeklyPay: extracted.grossWeeklyPay || 0,
        specialty: extracted.specialty || '',
        jobId: extracted.jobId ? Number(extracted.jobId) : null,
        candidateId: extracted.candidateId ? Number(extracted.candidateId) : null,
        actualMargin: extracted.actual_margin ?? null,
      };

      if (parsedData) {
        setExtractedDataLocal({ ...(extractedDataLocal ?? {}), ...parsedData } as unknown as ExtractedData);
        await persistTemplateData(parsedData, storagePath);
      }
    } catch (error: any) {
      console.error('[Extraction] Error:', error);
      showToastNotification(error.message || 'Extraction failed', 'error');

      trackEvent('email_extraction_used', {
        kind: 'prospect',
        extraction_type: 'pay_package',
        success: false,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const updateFileProgress = (fileId: string, progress: number) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId && f.status === 'uploading'
        ? { ...f, progress: Math.max(f.progress, progress) }
        : f
    ));
  };

  const markFileComplete = (fileId: string, url: string) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'done' as const, progress: 100, url } : f
    ));
  };

  const markFileError = (fileId: string, error: string) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error } : f
    ));
  };

  const removeFile = async (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const addLinksToEmail = () => {
    const uploadedFiles = files.filter(f => f.status === 'done' && f.url);
    if (uploadedFiles.length === 0) return;

    const links = [
      '',
      'Attachments:',
      ...uploadedFiles.map(f => `• ${f.name} — ${f.url}`),
      ''
    ];

    setBody(currentBody => `${currentBody.trimEnd()}\n${links.join('\n')}`);
  };

  // Actions
  const handleCopy = useCallback(async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch {
      showToastNotification('Failed to copy', 'error');
    }
  }, [showToastNotification]);

  const copyAll = () => {
    const fullEmail = `To: ${recipient}\nSubject: ${subject}\n\n${body}`;
    handleCopy(fullEmail, 'Email');
  };

  const copyKeyDetails = () => {
    const details = [
      baseData.facility && `Facility: ${baseData.facility}`,
      `Location: ${baseData.city || '—'}, ${baseData.state || '—'}`,
      `Dates: ${formatDate(baseData.startDate)} – ${formatDate(baseData.endDate)}`,
      `Schedule: ${baseData.shiftType || 'Standard'} • ${baseData.weeklyHours}hrs/week`,
      `Pay: ${formatCurrency(baseData.grossWeeklyPay)}/week`,
    ].filter(Boolean).join('\n');
    handleCopy(details, 'Details');
  };

  const copyPhoneNumber = () => {
    if (phoneNumber) {
      handleCopy(phoneNumber, 'Phone');
    }
  };

  const openOutlookWeb = useCallback(() => {
    if (!recipient) return;
    const url = buildOutlookLink(recipient, CC_EMAIL, subject, body);
    window.open(url, '_blank');

    trackEvent('email_modal_sent', {
      kind: 'prospect',
      with_attachments: files.some(f => f.status === 'done'),
    });

    onSend();
    onClose();
  }, [recipient, subject, body, files, onSend, onClose]);

  const openRingCentral = useCallback(() => {
    if (!phoneNumber) return;
    const url = buildRingCentralLink(phoneNumber);
    window.open(url, '_blank');
  }, [phoneNumber]);

  const downloadTxt = useCallback(() => {
    const content = `To: ${recipient}\nSubject: ${subject}\n\n${body}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `outreach-${(prospect.name || 'candidate').replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [recipient, subject, body, prospect.name]);

  // Render Details Panel
  const renderDetailsContent = () => {
    if (!hasMinimalJobData) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-white rounded-xl border-2 border-dashed border-slate-200 h-full text-center">
          <div className="p-4 bg-slate-100 rounded-2xl mb-4">
            <FileText size={28} className="text-slate-400" />
          </div>
          <h4 className="text-[13px] font-semibold tracking-tight text-slate-800 mb-1.5">
            Missing Assignment Details
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed tracking-wide max-w-[240px]">
            Upload a VMS screenshot or pay package to instantly populate all fields
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Location</div>
          <div className="font-semibold text-[13px] tracking-tight text-slate-900 mb-1">
            {baseData.facility || 'Not specified'}
          </div>
          <div className="text-[12px] text-slate-600 tracking-wide">
            {baseData.city || '—'}, {baseData.state || '—'}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Duration</div>
          <div className="font-semibold text-[13px] tracking-tight text-slate-900 mb-1">
            {formatDate(baseData.startDate)} – {formatDate(baseData.endDate)}
          </div>
          <div className="text-[12px] text-slate-600 tracking-wide">
            {baseData.shiftType || 'Standard'} · {baseData.weeklyHours} hrs/week
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Compensation</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-slate-600">Taxable Rate</span>
              <span className="text-[12px] font-semibold text-slate-900 tabular-nums">
                {formatCurrency(baseData.taxableRate)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-slate-600">Weekly Stipend</span>
              <span className="text-[12px] font-semibold text-slate-900 tabular-nums">
                {formatCurrency(baseData.weeklyStipend)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-[12px] font-semibold text-slate-900">Gross Weekly Pay</span>
              <span className="text-[15px] font-bold text-slate-900 tabular-nums">
                {formatCurrency(baseData.grossWeeklyPay)}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={copyKeyDetails}
          className="w-full py-2.5 text-[11px] font-semibold tracking-wider uppercase text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
        >
          {copiedSection === 'Details' ? (
            <>
              <Check size={14} className="text-green-600" />
              <span className="text-green-600">Details Copied</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy Key Details
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <EmailModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Draft Offer Email"
      subtitle={`${prospect.name} • Auto-extract enabled`}
      maxWidth="6xl"
      busy={isExtracting}
      headerActions={
        <a
          href={NOVAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-all text-[11px] font-semibold text-slate-700 flex items-center gap-1.5"
        >
          <ExternalLink size={14} />
          Noval
        </a>
      }
      rightPanel={
        <>
          {/* Assignment Details */}
          <div className={`p-6 overflow-y-auto border-b border-slate-100 ${!hasMinimalJobData ? 'flex-1' : ''}`}>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">
              Assignment Details
            </h3>
            {renderDetailsContent()}
          </div>

          {/* Attachments */}
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Attachments</h3>
              {isExtracting && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700 font-semibold">
                  <Loader size={11} className="animate-spin" />
                  Processing...
                </div>
              )}
            </div>

            <label
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all duration-200 ${dragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                }`}
            >
              <div className="p-2.5 bg-slate-100 rounded-xl">
                <Upload size={16} className="text-slate-600" />
              </div>
              <div className="text-center">
                <span className="text-[12px] font-semibold text-slate-700 block mb-1">Drag & drop files</span>
                <span className="text-[10px] text-slate-500">
                  PDF, DOCX, PNG, JPG · max {MAX_FILE_SIZE_MB}MB
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES.join(',')}
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </label>

            {files.length > 0 && (
              <div className="mt-4 space-y-2.5">
                {files.map((file) => (
                  <div key={file.id} className="bg-white border border-slate-100 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      {file.previewUrl && (
                        <button
                          onClick={() => setPreviewFile(file)}
                          className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-200 hover:border-slate-300"
                        >
                          <img src={file.previewUrl} alt={file.name} className="w-full h-full object-cover" />
                        </button>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold text-slate-900 truncate">{file.name}</div>
                            <div className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB
                            </div>
                          </div>

                          <button
                            onClick={() => removeFile(file.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 group"
                          >
                            <Trash2 size={14} className="text-slate-400 group-hover:text-red-600" />
                          </button>
                        </div>

                        {file.status === 'uploading' && (
                          <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-slate-900 to-slate-700 rounded-full transition-all"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        )}

                        {file.status === 'done' && (
                          <div className="mt-2 text-[10px] text-green-600 flex items-center gap-1 font-semibold">
                            <Check size={11} />
                            {EXTRACTABLE_FILE_TYPES.includes(file.type) ? 'Uploaded & Analyzed' : 'Uploaded'}
                          </div>
                        )}

                        {file.status === 'error' && (
                          <div className="mt-2 text-[10px] text-red-600 font-medium">Error: {file.error}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={addLinksToEmail}
              disabled={!files.some(f => f.status === 'done')}
              className={`mt-3 w-full py-2.5 text-[11px] font-semibold tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${files.some(f => f.status === 'done')
                ? 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'
                : 'text-slate-400 bg-slate-100 cursor-not-allowed opacity-50'
                }`}
            >
              <Link size={13} />
              Add Links to Email
            </button>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={copyAll}
              className="px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-2"
            >
              {copiedSection === 'Email' ? (
                <>
                  <Check size={13} className="text-green-600" />
                  <span className="text-green-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copy Email
                </>
              )}
            </button>

            {phoneNumber && (
              <button
                onClick={copyPhoneNumber}
                className="px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-2"
              >
                {copiedSection === 'Phone' ? (
                  <>
                    <Check size={13} className="text-green-600" />
                    <span className="text-green-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copy Phone
                  </>
                )}
              </button>
            )}

            <button
              onClick={downloadTxt}
              className="px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-2"
            >
              <Download size={13} />
              Download
            </button>
          </div>

          <button
            onClick={openOutlookWeb}
            className="px-8 py-3.5 text-[12px] font-bold tracking-wider uppercase rounded-xl bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-2.5 shadow-sm"
          >
            <Send size={16} />
            Open in Outlook
          </button>
        </div>
      }
    >
      {/* Main Content: Template Picker + Email Composer */}
      <div className="flex-1 flex flex-col">
        {/* Template Selection */}
        <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="flex p-1 bg-slate-100 rounded-xl shadow-sm">
              <button
                onClick={() => {
                  setCategory('outreach');
                  setTemplateId(OUTREACH_EMAIL_TEMPLATES[0].id);
                }}
                className={`px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg transition-all ${category === 'outreach'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                Outreach
              </button>
              <button
                onClick={() => {
                  setCategory('response');
                  setTemplateId(RESPONSE_EMAIL_TEMPLATES[0].id);
                }}
                className={`px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg transition-all ${category === 'response'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                Response
              </button>
              <button
                onClick={() => {
                  setCategory('ops');
                  setTemplateId(OPS_EMAIL_TEMPLATES[0].id);
                }}
                className={`px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg transition-all ${category === 'ops'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                Ops
              </button>
            </div>
            <ChevronRight size={16} className="text-slate-300" />
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex-1 px-4 py-2.5 text-[12px] font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer shadow-sm"
            >
              {pool.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Email Form */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-[12px] items-center">
              <div className="flex items-center gap-2">
                <label htmlFor="recipient" className="font-semibold text-slate-900">To:</label>
                <input
                  id="recipient"
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full font-mono text-[11px] text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5 border-0 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">CC:</span>
                <span className="font-mono text-[11px] text-slate-600">{CC_EMAIL}</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                Subject Line
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-4 py-3 text-[13px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                Message Body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full min-h-[400px] px-4 py-3 text-[13px] leading-relaxed bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white resize-none shadow-sm"
              />
              <p className="text-[10px] text-slate-500 mt-2.5 flex items-center gap-1.5">
                <Check size={11} className="text-green-600" />
                Auto-fills Outlook with CC to Tiffany Chavez
              </p>
            </div>
          </div>
        </div>
      </div>
    </EmailModalShell>
  );
}

export { EmailTemplateModal };