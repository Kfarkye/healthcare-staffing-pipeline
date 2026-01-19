// ============================================================================
// AddProspectModal.tsx - Enhanced Production Version
// Design: Apple × Stripe × Vercel
// Improvements: Better validation, accessibility, error recovery, UX polish
// ============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Sparkles, Loader2, Check, UserPlus, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { ExtractionService, generateNovaUrl } from '../../services/extractionService';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface AddProspectModalProps {
  onClose: () => void;
  onSave: (prospect: any) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type EntryMode = 'screenshot' | 'manual';
type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

// ============================================================================
// CONSTANTS
// ============================================================================
const SHIFT_OPTIONS = ['Days', 'Nights', 'Rotating', 'Flexible', 'Per Diem'];
const EXPERIENCE_LEVELS = ['< 1 year', '1-2 years', '2-5 years', '5-10 years', '10+ years'];
const DEBOUNCE_DELAY = 300;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const parseCandidateIdFromUrl = (url: string): number | null => {
  if (!url) return null;
  const match = url.match(/\/candidates?\/(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

const likelyNovaId = (n?: number | null) =>
  typeof n === 'number' && n > 100_000 && n < 99_999_999;

const validateEmail = (email: string): boolean => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validateState = (state: string): boolean => {
  if (!state) return true; // Optional field
  return /^[A-Z]{2}$/.test(state);
};

// ============================================================================
// ENHANCED INPUT COMPONENT
// ============================================================================
interface InputGroupProps {
  label: string;
  placeholder: string;
  value: string | string[] | undefined;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'number';
  required?: boolean;
  maxLength?: number;
  options?: string[];
  readOnly?: boolean;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
}

const InputGroup: React.FC<InputGroupProps> = ({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  options,
  readOnly = false,
  hint,
  error,
  autoFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const isEmpty = required && (!value || (typeof value === 'string' && value.trim() === ''));
  const hasError = error || isEmpty;

  const inputClasses = `w-full px-4 py-3 text-[13px] border rounded-xl transition-all duration-300 ease-out ${
    readOnly
      ? 'bg-gradient-to-br from-slate-50 to-slate-100/50 text-slate-700 cursor-default font-medium border-slate-200/80'
      : `bg-white ${
          hasError
            ? 'border-red-300 focus:border-red-400 focus:ring-4 focus:ring-red-50'
            : isFocused
              ? 'border-blue-400 ring-4 ring-blue-50 shadow-sm'
              : 'border-slate-200 hover:border-slate-300'
        }`
  }`;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const renderInput = () => {
    if (readOnly) {
      if (label === 'Nova URL' && value) {
        const urlString = value as string;

        return (
          <div
            className={`${inputClasses} !py-2.5 !px-3 flex items-center gap-2`}
            title={urlString}
          >
            <code className="flex-1 text-[12px] font-medium text-slate-700 whitespace-nowrap overflow-x-auto no-scrollbar">
              {urlString}
            </code>

            <a
              href={urlString}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label="Open Nova URL in new tab"
            >
              Open
            </a>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(urlString);
              }}
              className={`shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-200 transform ${
                copied
                  ? 'bg-green-100 text-green-700 scale-95'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 active:scale-95'
              }`}
              aria-label="Copy Nova URL to clipboard"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        );
      }

      return (
        <div className={inputClasses}>
          {value || <span className="text-slate-400">{placeholder}</span>}
        </div>
      );
    }

    if (type === 'textarea') {
      return (
        <textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          rows={label === 'General Notes' ? 3 : 2}
          className={`${inputClasses} resize-none`}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={label}
          aria-required={required}
          aria-invalid={hasError}
        />
      );
    }

    if (type === 'select' && options) {
      return (
        <select
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={inputClasses}
          autoFocus={autoFocus}
          aria-label={label}
          aria-required={required}
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (type === 'number') {
      return (
        <input
          type="text"
          value={value?.toString() || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d*$/.test(v) || v === '') {
              onChange(v);
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={inputClasses}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-label={label}
          aria-required={required}
          aria-invalid={hasError}
        />
      );
    }

    return (
      <input
        type={type}
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`${inputClasses} ${label === 'Nova URL' ? 'break-all' : ''}`}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-label={label}
        aria-required={required}
        aria-invalid={hasError}
      />
    );
  };

  return (
    <div className="group">
      <label className={`block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5 transition-colors duration-200 ${
        isFocused ? 'text-blue-600' : ''
      }`}>
        {label} {required && <span className="text-red-500" aria-label="required">*</span>}
      </label>
      {renderInput()}
      {error && (
        <p className="text-[10px] text-red-500 mt-2 flex items-center gap-1.5" role="alert">
          <AlertCircle size={10} />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-[10px] text-slate-400 mt-2 tracking-wide leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
};

// ============================================================================
// FORM SECTION COMPONENT
// ============================================================================
interface FormSectionProps {
  formData: any;
  personalFields: any;
  updateFormData: (field: string, value: any) => void;
  updatePersonalFields: (field: string, value: string) => void;
  mode: EntryMode;
  onNovaUrlChange?: (url: string) => void;
  errors: Record<string, string>;
}

const FormSection: React.FC<FormSectionProps> = ({
  formData,
  personalFields,
  updateFormData,
  updatePersonalFields,
  mode,
  onNovaUrlChange,
  errors,
}) => {
  const handleCandidateIdChange = (value: string) => {
    updateFormData('candidate_id', value ? parseInt(value, 10) : undefined);
  };

  const isManualUrlEntry = mode === 'manual';
  const hasExtractedId = !!formData.candidate_id;

  return (
    <div className="space-y-8">
      {/* Core Data Section */}
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Core Information
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        </div>

        <div className="grid grid-cols-2 gap-5">
          {isManualUrlEntry && (
            <div className="col-span-2">
              <InputGroup
                label="Nova URL"
                placeholder="https://nova.ayahealthcare.com/#/recruiting/candidates/4328863/..."
                value={formData.nova_url || ''}
                onChange={onNovaUrlChange || (() => {})}
                hint="Paste Nova URL to automatically extract Candidate ID"
                error={errors.nova_url}
                autoFocus={true}
              />
            </div>
          )}

          <InputGroup
            label="Candidate ID"
            placeholder={isManualUrlEntry ? "Auto-extracted from URL" : "Extracted from screenshot"}
            value={formData.candidate_id?.toString() || ''}
            onChange={handleCandidateIdChange}
            type="number"
            required={true}
            readOnly={isManualUrlEntry && hasExtractedId}
            hint={
              isManualUrlEntry
                ? (hasExtractedId ? "Automatically parsed from Nova URL" : "Will be extracted from URL")
                : (hasExtractedId ? "Verify ID is correct" : "Manually enter if missing")
            }
            error={errors.candidate_id}
          />

          {!isManualUrlEntry && (
            <InputGroup
              label="Nova URL"
              placeholder="Auto-generated from ID"
              value={formData.nova_url || ''}
              onChange={() => {}}
              readOnly={true}
              hint="Generated from Candidate ID"
            />
          )}

          <InputGroup
            label="Full Name"
            placeholder="Sarah Johnson"
            value={formData.name}
            onChange={(v) => updateFormData('name', v)}
            required={true}
            error={errors.name}
            autoFocus={!isManualUrlEntry}
          />
          <InputGroup
            label="Email"
            placeholder="sarah@example.com"
            value={formData.email}
            onChange={(v) => updateFormData('email', v)}
            type="email"
            required={true}
            error={errors.email}
          />
          <InputGroup
            label="Phone"
            placeholder="(555) 123-4567"
            value={formData.phone}
            onChange={(v) => updateFormData('phone', v)}
            type="tel"
          />
          <InputGroup
            label="Profession"
            placeholder="RN, LPN, CNA"
            value={formData.profession}
            onChange={(v) => updateFormData('profession', v)}
            required={true}
            error={errors.profession}
          />
          <InputGroup
            label="Specialty"
            placeholder="ICU, ER, Med-Surg"
            value={formData.specialty}
            onChange={(v) => updateFormData('specialty', v)}
          />
          <InputGroup
            label="Home State"
            placeholder="CA"
            value={formData.home_state}
            onChange={(v) => updateFormData('home_state', v.toUpperCase())}
            maxLength={2}
            error={errors.home_state}
            hint="Two-letter state code (e.g. CA, TX)"
          />
        </div>
      </div>

      {/* Personalization Section */}
      <div className="pt-6 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Personalization
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <InputGroup
            label="Shift Preference"
            placeholder="Select preference"
            value={personalFields.shift_preference}
            onChange={(v) => updatePersonalFields('shift_preference', v)}
            type="select"
            options={SHIFT_OPTIONS}
          />
          <InputGroup
            label="Years Experience"
            placeholder="Select experience"
            value={personalFields.years_experience}
            onChange={(v) => updatePersonalFields('years_experience', v)}
            type="select"
            options={EXPERIENCE_LEVELS}
          />
          <div className="col-span-2">
            <InputGroup
              label="Certifications"
              placeholder="CCRN, PCCN, BLS, ACLS"
              value={personalFields.certifications}
              onChange={(v) => updatePersonalFields('certifications', v)}
            />
          </div>
          <div className="col-span-2">
            <InputGroup
              label="Preferred Unit Types"
              placeholder="ICU, Cardiac ICU, Trauma"
              value={personalFields.preferred_units}
              onChange={(v) => updatePersonalFields('preferred_units', v)}
            />
          </div>
          <div className="col-span-2">
            <InputGroup
              label="General Notes"
              placeholder="Where you found them, what caught your eye..."
              value={personalFields.general_notes}
              onChange={(v) => updatePersonalFields('general_notes', v)}
              type="textarea"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN MODAL COMPONENT
// ============================================================================
const AddProspectModal: React.FC<AddProspectModalProps> = ({
  onClose,
  onSave,
  showToast
}) => {
  const [mode, setMode] = useState<EntryMode>('screenshot');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [formData, setFormData] = useState<any>({
    candidate_id: undefined,
    name: '',
    email: '',
    phone: '',
    specialty: '',
    profession: '',
    home_state: '',
    licenses: [],
    notes: '',
    nova_url: '',
    status: 'New',
  });

  const [personalFields, setPersonalFields] = useState({
    shift_preference: '',
    certifications: '',
    years_experience: '',
    preferred_units: '',
    general_notes: '',
  });

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.candidate_id) {
      newErrors.candidate_id = 'Candidate ID is required';
    } else if (!likelyNovaId(formData.candidate_id)) {
      newErrors.candidate_id = 'Invalid Candidate ID (must be 6-8 digits)';
    }

    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email?.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.profession?.trim()) {
      newErrors.profession = 'Profession is required';
    }

    if (formData.home_state && !validateState(formData.home_state)) {
      newErrors.home_state = 'Must be 2-letter state code (e.g. CA)';
    }

    if (mode === 'manual' && !formData.nova_url?.trim()) {
      newErrors.nova_url = 'Nova URL is required in manual mode';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, mode]);

  // Nova URL change handler with debounce
  const handleNovaUrlChange = useCallback((url: string) => {
    setFormData((prev: any) => ({ ...prev, nova_url: url }));
    setErrors((prev) => ({ ...prev, nova_url: '' }));

    if (urlDebounceRef.current) {
      clearTimeout(urlDebounceRef.current);
    }

    urlDebounceRef.current = setTimeout(() => {
      if (url) {
        const candidateId = parseCandidateIdFromUrl(url);
        if (candidateId) {
          setFormData((prev: any) => ({ ...prev, candidate_id: candidateId }));
          setErrors((prev) => ({ ...prev, candidate_id: '' }));
        } else if (url.length > 10) {
          setFormData((prev: any) => ({ ...prev, candidate_id: undefined }));
        }
      } else {
        setFormData((prev: any) => ({ ...prev, candidate_id: undefined }));
      }
    }, DEBOUNCE_DELAY);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (urlDebounceRef.current) {
        clearTimeout(urlDebounceRef.current);
      }
    };
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

  // File upload handler with file cloning to prevent invalid reference
  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadStatus('error');
      showToast('Please upload an image (PNG, JPG, or WebP).', 'error');
      return;
    }

    // CRITICAL: Clone the file immediately before ANY async operations
    // This prevents the file reference from becoming invalid
    const fileBlob = new Blob([file], { type: file.type });
    const fileToProcess = new File([fileBlob], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });

    console.log('[FileSelect] File cloned:', {
      name: fileToProcess.name,
      type: fileToProcess.type,
      size: `${(fileToProcess.size / 1024).toFixed(1)}KB`
    });

    setUploadStatus('uploading');
    setErrors({});

    try {
      await new Promise(resolve => setTimeout(resolve, 200));
      setUploadStatus('processing');

      console.log('[FileSelect] Starting extraction...');

      // Pass the cloned file (guaranteed to be valid)
      const data = await ExtractionService.extractDataFromImage(fileToProcess);

      console.log('[FileSelect] Extraction successful:', data);

      // Map snake_case response to camelCase form state
      setFormData((prev: any) => ({
        ...prev,
        candidate_id: data.candidate_id ?? prev.candidate_id,
        nova_url: data.candidate_id ? generateNovaUrl(data.candidate_id) : prev.nova_url,
        name: data.name ?? prev.name,
        email: data.email ?? prev.email,
        specialty: data.specialty ?? prev.specialty,
        profession: data.profession ?? prev.profession,
        home_state: data.state ?? prev.home_state,
        phone: data.phone ?? prev.phone,
        notes: data.notes ?? prev.notes,
      }));

      // Map extracted years_experience to dropdown range
      if (typeof data.years_experience === 'number') {
        const y = data.years_experience;
        let range = '10+ years';
        if (y < 1) range = '< 1 year';
        else if (y <= 2) range = '1-2 years';
        else if (y <= 5) range = '2-5 years';
        else if (y <= 10) range = '5-10 years';
        setPersonalFields(prev => ({ ...prev, years_experience: range }));
      }

      setUploadStatus('done');
      showToast('Screenshot processed successfully', 'success');
    } catch (error: any) {
      console.error('[FileSelect] Extraction failed:', error);
      setUploadStatus('error');
      showToast(error?.message || 'Extraction failed', 'error');
    }
  };

  // Save handler
  const handleSave = async () => {
    if (!validateForm()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    setSaving(true);

    try {
      const finalNovaUrl = formData.nova_url || generateNovaUrl(Number(formData.candidate_id));

      // Build metadata object only with non-empty values
      const metadata: Record<string, string> = {};
      if (personalFields.shift_preference?.trim()) {
        metadata.shift_preference = personalFields.shift_preference.trim();
      }
      if (personalFields.certifications?.trim()) {
        metadata.certifications = personalFields.certifications.trim();
      }
      if (personalFields.years_experience?.trim()) {
        metadata.years_experience = personalFields.years_experience.trim();
      }
      if (personalFields.preferred_units?.trim()) {
        metadata.preferred_units = personalFields.preferred_units.trim();
      }

      // Construct clean prospect data with correct database field names
      // This matches the candidates table schema expected by ProspectsDashboard
      const prospectData = {
        candidate_id: Number(formData.candidate_id),
        nova_url: finalNovaUrl,
        full_name: formData.name.trim(),
        email: formData.email.toLowerCase().trim(),
        phone: formData.phone?.trim() || null,
        profession: formData.profession.trim(),
        primary_specialty: formData.specialty?.trim() || null,
        home_state: formData.home_state?.toUpperCase().trim() || null,
        notes: personalFields.general_notes?.trim() || null,
        licenses: formData.licenses || [],
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      };

      await onSave(prospectData);
      showToast('Prospect added successfully', 'success');
      onClose();
    } catch (error: any) {
      console.error('Save failed:', error);
      showToast(error?.message || 'Failed to add prospect', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const updatePersonalFields = (field: string, value: string) => {
    setPersonalFields(prev => ({ ...prev, [field]: value }));
  };

  // Keyboard shortcut for save (Cmd/Ctrl+Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !saving) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, formData, personalFields]);

  return (
    <div 
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-slideUp {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .shimmer {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent
          );
          background-size: 1000px 100%;
          animation: shimmer 2s infinite;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-xl"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-slideUp">

        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg transition-all duration-300 hover:scale-110 hover:rotate-3 hover:shadow-xl">
              <UserPlus size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 id="modal-title" className="text-[17px] font-semibold tracking-tight text-slate-900">
                Add Prospect
              </h2>
              <p className="text-[11px] text-slate-500 tracking-wide mt-1">
                Extract from screenshot or paste Nova URL
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl hover:bg-slate-100 transition-all duration-300 group hover:rotate-90 hover:scale-110"
            aria-label="Close modal"
          >
            <X size={18} className="text-slate-400 group-hover:text-slate-700 transition-colors" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="px-8 py-5 bg-gradient-to-b from-slate-50/80 to-white border-b border-slate-100">
          <div className="flex p-1.5 bg-slate-100/80 rounded-2xl shadow-inner backdrop-blur-sm w-fit" role="tablist">
            <button
              onClick={() => setMode('screenshot')}
              className={`px-5 py-2.5 text-[11px] font-bold tracking-wider uppercase rounded-xl transition-all duration-300 flex items-center gap-2 ${
                mode === 'screenshot'
                  ? 'bg-white text-slate-900 shadow-lg scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50 hover:scale-105'
              }`}
              role="tab"
              aria-selected={mode === 'screenshot'}
            >
              <Upload size={13} strokeWidth={2.5} />
              Screenshot
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-5 py-2.5 text-[11px] font-bold tracking-wider uppercase rounded-xl transition-all duration-300 flex items-center gap-2 ${
                mode === 'manual'
                  ? 'bg-white text-slate-900 shadow-lg scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50 hover:scale-105'
              }`}
              role="tab"
              aria-selected={mode === 'manual'}
            >
              <LinkIcon size={13} strokeWidth={2.5} />
              Paste URL
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 max-h-[60vh] overflow-y-auto">
          {mode === 'screenshot' && (
            <div className="space-y-6">
              {/* Upload Zone */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => uploadStatus === 'idle' && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && uploadStatus === 'idle') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`relative flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl p-16 cursor-pointer transition-all duration-300 overflow-hidden ${
                  isDragging
                    ? 'border-blue-400 bg-blue-50/50 scale-105 shadow-lg'
                    : uploadStatus === 'idle'
                      ? 'border-slate-200 hover:border-slate-400 hover:bg-slate-50/30 hover:scale-[1.02]'
                      : 'border-slate-200'
                }`}
                role="button"
                tabIndex={0}
                aria-label="Upload screenshot area"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  aria-label="File input"
                />

                {uploadStatus === 'idle' && (
                  <>
                    <div className={`p-4 bg-gradient-to-br from-slate-100 to-slate-50 rounded-2xl shadow-inner transition-all duration-300 ${
                      isDragging ? 'scale-110 rotate-3' : 'group-hover:scale-110'
                    }`}>
                      <Upload size={28} className="text-slate-600" strokeWidth={2} />
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-semibold text-slate-700 mb-1.5">
                        {isDragging ? 'Drop to upload' : 'Drop screenshot or click to upload'}
                      </p>
                      <p className="text-[11px] text-slate-500 tracking-wide">
                        Nova URL will be auto-extracted
                      </p>
                    </div>
                  </>
                )}

                {uploadStatus === 'uploading' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <Loader2 className="w-10 h-10 text-blue-400 animate-spin" strokeWidth={2.5} />
                      <div className="absolute inset-0 bg-blue-400 rounded-full blur-xl opacity-20" />
                    </div>
                    <p className="text-[13px] font-medium text-slate-600">Uploading...</p>
                  </div>
                )}

                {uploadStatus === 'processing' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <Sparkles className="w-10 h-10 text-blue-500 animate-pulse" strokeWidth={2.5} />
                      <div className="absolute inset-0 bg-blue-400 rounded-full blur-xl opacity-30 animate-pulse" />
                    </div>
                    <p className="text-[13px] font-medium text-slate-600">Extracting data...</p>
                    <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 shimmer" />
                    </div>
                  </div>
                )}

                {uploadStatus === 'done' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="p-4 bg-gradient-to-br from-green-100 to-green-50 rounded-2xl shadow-lg animate-bounce">
                        <Check className="w-7 h-7 text-green-600" strokeWidth={3} />
                      </div>
                      <div className="absolute inset-0 bg-green-400 rounded-full blur-xl opacity-30" />
                    </div>
                    <p className="text-[13px] text-green-700 font-semibold">
                      {formData.candidate_id
                        ? `Extracted - Candidate ID: ${formData.candidate_id}`
                        : 'Data extracted - verify fields below'
                      }
                    </p>
                  </div>
                )}

                {uploadStatus === 'error' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-red-100 to-red-50 rounded-2xl shadow-inner">
                      <X className="w-7 h-7 text-red-600" strokeWidth={3} />
                    </div>
                    <p className="text-[13px] text-red-600 font-medium">
                      Extraction failed - use manual entry
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadStatus('idle');
                      }}
                      className="px-4 py-2 text-[11px] font-bold uppercase rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>

              {uploadStatus !== 'idle' && (
                <FormSection
                  formData={formData}
                  personalFields={personalFields}
                  updateFormData={updateFormData}
                  updatePersonalFields={updatePersonalFields}
                  mode={mode}
                  errors={errors}
                />
              )}
            </div>
          )}

          {mode === 'manual' && (
            <FormSection
              formData={formData}
              personalFields={personalFields}
              updateFormData={updateFormData}
              updatePersonalFields={updatePersonalFields}
              mode={mode}
              onNovaUrlChange={handleNovaUrlChange}
              errors={errors}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-100 flex justify-between items-center bg-gradient-to-t from-slate-50/30 to-white">
          <p className="text-[10px] text-slate-400 tracking-wide">
            Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">⌘/Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">Enter</kbd> to save
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 text-[11px] font-bold tracking-wider uppercase rounded-xl border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-300 hover:shadow-md hover:scale-105 active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-3 text-[11px] font-bold tracking-wider uppercase rounded-xl text-white transition-all duration-300 flex items-center gap-2.5 ${
                saving
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" strokeWidth={2.5} />
                  Add Prospect
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddProspectModal;