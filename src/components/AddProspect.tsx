// ============================================================================
// src/components/prospects/AddProspectModal.tsx
// PRODUCTION READY - Clean, organized, and fully functional
// Design: Apple × Stripe × Vercel
// ============================================================================

import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, Loader2, Check, UserPlus, Link } from 'lucide-react';
import { ExtractionService } from '../../services/extractionService';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AddProspectModalProps {
  onClose: () => void;
  onSave: (prospect: ProspectPayload) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface ProspectPayload {
  candidate_id: number;
  name: string; // ✅ Matches database column
  email: string;
  profession: string;
  nova_url: string;
  status: string;
  priority: string;
  metadata: Record<string, string>;
  phone?: string;
  specialty?: string;
  home_state?: string;
  notes?: string;
}

interface FormData {
  candidate_id?: number;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  profession: string;
  home_state: string;
  nova_url: string;
}

interface PersonalFields {
  shift_preference: string;
  certifications: string;
  years_experience: string;
  preferred_units: string;
  general_notes: string;
}

type EntryMode = 'screenshot' | 'manual';
type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

// ============================================================================
// CONSTANTS
// ============================================================================

const SHIFT_OPTIONS = ['Days', 'Nights', 'Rotating', 'Flexible', 'Per Diem'];
const EXPERIENCE_LEVELS = ['< 1 year', '1-2 years', '2-5 years', '5-10 years', '10+ years'];

const EXPERIENCE_MAP: Record<string, string> = {
  '< 1 year': '< 1',
  '1-2 years': '1-2',
  '2-5 years': '2-5',
  '5-10 years': '5-10',
  '10+ years': '10+'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const parseCandidateIdFromUrl = (url: string): number | null => {
  if (!url) return null;
  const match = url.match(/\/candidates?\/(\d+)/i);
  return match ? parseInt(match[1]) : null;
};

const generateNovaUrl = (candidateId: number): string => {
  return `https://nova.ayahealthcare.com/#/recruiting/candidates/${candidateId}/new-profile/about`;
};

const mapYearsExperience = (years: number): string => {
  if (years < 1) return '< 1 year';
  if (years <= 2) return '1-2 years';
  if (years <= 5) return '2-5 years';
  if (years <= 10) return '5-10 years';
  return '10+ years';
};

// ============================================================================
// INPUT COMPONENT
// ============================================================================

interface InputGroupProps {
  label: string;
  placeholder: string;
  value: string | undefined;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'number';
  required?: boolean;
  maxLength?: number;
  options?: string[];
  readOnly?: boolean;
  hint?: string;
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
  hint
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const isError = required && (!value || value.trim() === '');

  const baseInputClasses = 'w-full px-4 py-3 text-[13px] border rounded-xl transition-all duration-300 ease-out';
  
  const inputClasses = `${baseInputClasses} ${
    readOnly
      ? 'bg-gradient-to-br from-slate-50 to-slate-100/50 text-slate-700 cursor-default font-medium border-slate-200/80'
      : `bg-white ${
          isError
            ? 'border-red-300 focus:border-red-400 focus:ring-4 focus:ring-red-50'
            : isFocused
            ? 'border-blue-400 ring-4 ring-blue-50 shadow-sm'
            : 'border-slate-200 hover:border-slate-300'
        }`
  }`;

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderInput = () => {
    // Nova URL with copy/open functionality
    if (readOnly && label === 'Nova URL' && value) {
      return (
        <div className={`${inputClasses} !py-2.5 !px-3 flex items-center gap-2`} title={value}>
          <code className="flex-1 text-[12px] font-medium text-slate-700 whitespace-nowrap overflow-x-auto no-scrollbar">
            {value}
          </code>
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            Open
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(value);
            }}
            className={`shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-200 transform ${
              copied
                ? 'bg-green-100 text-green-700 scale-95'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 active:scale-95'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      );
    }

    // Read-only fields
    if (readOnly) {
      return (
        <div className={inputClasses}>
          {value || <span className="text-slate-400">{placeholder}</span>}
        </div>
      );
    }

    // Textarea
    if (type === 'textarea') {
      return (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          rows={label === 'General Notes' ? 3 : 2}
          className={`${inputClasses} resize-none`}
          placeholder={placeholder}
        />
      );
    }

    // Select dropdown
    if (type === 'select' && options) {
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={inputClasses}
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    // Number input
    if (type === 'number') {
      return (
        <input
          type="text"
          value={value || ''}
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
        />
      );
    }

    // Standard input
    return (
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={inputClasses}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    );
  };

  return (
    <div className="group">
      <label className={`block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5 transition-colors duration-200 ${
        isFocused ? 'text-blue-600' : ''
      }`}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {renderInput()}
      {hint && (
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
  formData: FormData;
  personalFields: PersonalFields;
  updateFormData: (field: keyof FormData, value: any) => void;
  updatePersonalFields: (field: keyof PersonalFields, value: string) => void;
  mode: EntryMode;
  onNovaUrlChange?: (url: string) => void;
}

const FormSection: React.FC<FormSectionProps> = ({
  formData,
  personalFields,
  updateFormData,
  updatePersonalFields,
  mode,
  onNovaUrlChange
}) => {
  const handleCandidateIdChange = (value: string) => {
    const parsed = value ? parseInt(value) : undefined;
    updateFormData('candidate_id', parsed);
    
    if (parsed && mode === 'screenshot') {
      const generatedUrl = generateNovaUrl(parsed);
      updateFormData('nova_url', generatedUrl);
    }
  };

  const isManualUrlEntry = mode === 'manual';
  const hasExtractedId = !!formData.candidate_id;

  return (
    <div className="space-y-8">
      {/* Core Information Section */}
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Core Information
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        </div>
        
        <div className="grid grid-cols-2 gap-5">
          {/* Nova URL - First in manual mode */}
          {isManualUrlEntry && (
            <div className="col-span-2">
              <InputGroup
                label="Nova URL"
                placeholder="https://nova.ayahealthcare.com/#/recruiting/candidates/4328863/..."
                value={formData.nova_url}
                onChange={onNovaUrlChange || (() => {})}
                hint="Paste Nova URL to automatically extract Candidate ID"
              />
            </div>
          )}

          {/* Candidate ID */}
          <InputGroup
            label="Candidate ID"
            placeholder={isManualUrlEntry ? "Auto-extracted from URL" : "Extracted from screenshot"}
            value={formData.candidate_id?.toString()}
            onChange={handleCandidateIdChange}
            type="number"
            required={true}
            readOnly={isManualUrlEntry && hasExtractedId}
            hint={
              isManualUrlEntry
                ? (hasExtractedId ? "Automatically parsed from Nova URL" : "Will be extracted from URL")
                : (hasExtractedId ? "Verify ID is correct" : "Manually enter if missing")
            }
          />

          {/* Nova URL - After ID in screenshot mode */}
          {!isManualUrlEntry && (
            <InputGroup
              label="Nova URL"
              placeholder="Auto-generated from ID"
              value={formData.nova_url}
              onChange={() => {}}
              readOnly={true}
              hint="Generated from Candidate ID"
            />
          )}
          
          {/* Name */}
          <InputGroup
            label="Full Name"
            placeholder="Sarah Johnson"
            value={formData.name}
            onChange={(v) => updateFormData('name', v)}
            required={true}
          />

          {/* Email */}
          <InputGroup
            label="Email"
            placeholder="sarah@example.com"
            value={formData.email}
            onChange={(v) => updateFormData('email', v)}
            type="email"
            required={true}
          />

          {/* Phone */}
          <InputGroup
            label="Phone"
            placeholder="(555) 123-4567"
            value={formData.phone}
            onChange={(v) => updateFormData('phone', v)}
            type="tel"
          />

          {/* Profession */}
          <InputGroup
            label="Profession"
            placeholder="RN, LPN, CNA"
            value={formData.profession}
            onChange={(v) => updateFormData('profession', v)}
            required={true}
          />

          {/* Specialty */}
          <InputGroup
            label="Specialty"
            placeholder="ICU, ER, Med-Surg"
            value={formData.specialty}
            onChange={(v) => updateFormData('specialty', v)}
          />

          {/* Home State */}
          <InputGroup
            label="Home State"
            placeholder="CA"
            value={formData.home_state}
            onChange={(v) => updateFormData('home_state', v.toUpperCase())}
            maxLength={2}
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
          {/* Shift Preference */}
          <InputGroup
            label="Shift Preference"
            placeholder="Select preference"
            value={personalFields.shift_preference}
            onChange={(v) => updatePersonalFields('shift_preference', v)}
            type="select"
            options={SHIFT_OPTIONS}
          />

          {/* Years Experience */}
          <InputGroup
            label="Years Experience"
            placeholder="Select experience"
            value={personalFields.years_experience}
            onChange={(v) => updatePersonalFields('years_experience', v)}
            type="select"
            options={EXPERIENCE_LEVELS}
          />

          {/* Certifications */}
          <div className="col-span-2">
            <InputGroup
              label="Certifications"
              placeholder="CCRN, PCCN, BLS, ACLS"
              value={personalFields.certifications}
              onChange={(v) => updatePersonalFields('certifications', v)}
            />
          </div>

          {/* Preferred Unit Types */}
          <div className="col-span-2">
            <InputGroup
              label="Preferred Unit Types"
              placeholder="ICU, Cardiac ICU, Trauma"
              value={personalFields.preferred_units}
              onChange={(v) => updatePersonalFields('preferred_units', v)}
            />
          </div>

          {/* General Notes */}
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
// UPLOAD ZONE COMPONENT
// ============================================================================

interface UploadZoneProps {
  uploadStatus: UploadStatus;
  isDragging: boolean;
  candidateId?: number;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({
  uploadStatus,
  isDragging,
  candidateId,
  onDragEnter,
  onDragLeave,
  onDrop,
  onClick
}) => {
  const getContent = () => {
    switch (uploadStatus) {
      case 'uploading':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin" strokeWidth={2.5} />
              <div className="absolute inset-0 bg-blue-400 rounded-full blur-xl opacity-20" />
            </div>
            <p className="text-[13px] font-medium text-slate-600">Uploading...</p>
          </div>
        );

      case 'processing':
        return (
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
        );

      case 'done':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="p-4 bg-gradient-to-br from-green-100 to-green-50 rounded-2xl shadow-lg animate-bounce">
                <Check className="w-7 h-7 text-green-600" strokeWidth={3} />
              </div>
              <div className="absolute inset-0 bg-green-400 rounded-full blur-xl opacity-30" />
            </div>
            <p className="text-[13px] text-green-700 font-semibold">
              {candidateId 
                ? `Extracted - Candidate ID: ${candidateId}`
                : 'Data extracted - verify fields below'
              }
            </p>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-red-100 to-red-50 rounded-2xl shadow-inner">
              <X className="w-7 h-7 text-red-600" strokeWidth={3} />
            </div>
            <p className="text-[13px] text-red-600 font-medium">
              Extraction failed - use manual entry
            </p>
          </div>
        );

      default: // idle
        return (
          <>
            <div className={`p-4 bg-gradient-to-br from-slate-100 to-slate-50 rounded-2xl shadow-inner transition-all duration-300 ${
              isDragging ? 'scale-110 rotate-3' : ''
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
        );
    }
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl p-16 cursor-pointer transition-all duration-300 overflow-hidden ${
        isDragging
          ? 'border-blue-400 bg-blue-50/50 scale-105 shadow-lg'
          : uploadStatus === 'idle'
          ? 'border-slate-200 hover:border-slate-400 hover:bg-slate-50/30 hover:scale-[1.02]'
          : 'border-slate-200'
      }`}
    >
      {getContent()}
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
  // State Management
  const [mode, setMode] = useState<EntryMode>('screenshot');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    candidate_id: undefined,
    name: '',
    email: '',
    phone: '',
    specialty: '',
    profession: '',
    home_state: '',
    nova_url: '',
  });

  const [personalFields, setPersonalFields] = useState<PersonalFields>({
    shift_preference: '',
    certifications: '',
    years_experience: '',
    preferred_units: '',
    general_notes: '',
  });

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadStatus('error');
      showToast('Please upload an image file', 'error');
      return;
    }

    const fileToProcess = new File([file], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });

    console.log('[FileSelect] Processing:', fileToProcess.name);
    setUploadStatus('uploading');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      setUploadStatus('processing');

      const extractedData = await ExtractionService.extractDataFromImage(fileToProcess);
      console.log('[FileSelect] Extracted:', extractedData);

      // Update form data
      setFormData(prev => ({
        ...prev,
        candidate_id: extractedData.candidate_id,
        nova_url: extractedData.nova_url,
        name: extractedData.name || '',
        email: extractedData.email || '',
        phone: extractedData.phone || '',
        specialty: extractedData.specialty || '',
        profession: extractedData.profession || '',
        home_state: extractedData.state || '',
      }));

      // Map years experience
      if (extractedData.years_experience !== null) {
        setPersonalFields(prev => ({
          ...prev,
          years_experience: mapYearsExperience(extractedData.years_experience),
        }));
      }

      setUploadStatus('done');
      showToast('Data extracted successfully', 'success');
      
    } catch (error: any) {
      console.error('[FileSelect] Failed:', error);
      setUploadStatus('error');
      showToast(error?.message || 'Failed to extract data from screenshot', 'error');
    }
  };

  const handleNovaUrlChange = (url: string) => {
    setFormData(prev => ({ ...prev, nova_url: url }));
    
    if (url) {
      const candidateId = parseCandidateIdFromUrl(url);
      if (candidateId) {
        setFormData(prev => ({ ...prev, candidate_id: candidateId }));
      } else if (url.length > 10) {
        setFormData(prev => ({ ...prev, candidate_id: undefined }));
      }
    } else {
      setFormData(prev => ({ ...prev, candidate_id: undefined }));
    }
  };

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

  const handleSave = async () => {
    console.log('[Save] Initiated');
    
    // Validate required fields
    const name = formData.name?.trim();
    const email = formData.email?.trim();
    const profession = formData.profession?.trim();
    const candidate_id = formData.candidate_id;

    if (!candidate_id) {
      showToast('Candidate ID is required', 'error');
      return;
    }
    if (!name) {
      showToast('Name is required', 'error');
      return;
    }
    if (!email) {
      showToast('Email is required', 'error');
      return;
    }
    if (!profession) {
      showToast('Profession is required', 'error');
      return;
    }

    console.log('[Save] Validation passed');
    setSaving(true);

    try {
      const nova_url = formData.nova_url?.trim() || generateNovaUrl(candidate_id);
      
      // Build metadata
      const metadata: Record<string, string> = {};
      if (personalFields.shift_preference) {
        metadata.shift_preference = personalFields.shift_preference;
      }
      if (personalFields.certifications) {
        metadata.certifications = personalFields.certifications;
      }
      if (personalFields.years_experience) {
        metadata.years_experience = EXPERIENCE_MAP[personalFields.years_experience] || personalFields.years_experience;
      }
      if (personalFields.preferred_units) {
        metadata.preferred_units = personalFields.preferred_units;
      }

      // Build payload with correct field names
      const payload: ProspectPayload = {
        candidate_id,
        name, // ✅ Database column is 'name'
        email,
        profession,
        nova_url,
        status: 'New',
        priority: 'Medium',
        metadata,
      };

      // Add optional fields
      if (formData.phone?.trim()) payload.phone = formData.phone.trim();
      if (formData.specialty?.trim()) payload.specialty = formData.specialty.trim();
      if (formData.home_state?.trim()) payload.home_state = formData.home_state.trim().toUpperCase();
      if (personalFields.general_notes?.trim()) payload.notes = personalFields.general_notes.trim();

      console.log('[Save] Payload:', payload);

      await onSave(payload);

      console.log('[Save] Success');
      showToast('Prospect added successfully', 'success');
      onClose();

    } catch (error: any) {
      console.error('[Save] Failed:', error);
      showToast(error?.message || 'Failed to add prospect', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updatePersonalFields = (field: keyof PersonalFields, value: string) => {
    setPersonalFields(prev => ({ ...prev, [field]: value }));
  };
  
  const isFormValid = 
    !!formData.candidate_id && 
    !!formData.name?.trim() && 
    !!formData.email?.trim() && 
    !!formData.profession?.trim();
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fadeIn">
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
      />
      
      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-slideUp">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg transition-all duration-300 hover:scale-110 hover:rotate-3 hover:shadow-xl">
              <UserPlus size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Add Prospect
              </h2>
              <p className="text-[11px] text-slate-500 tracking-wide mt-1">
                Nova URL auto-extracted from screenshot or manual entry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl hover:bg-slate-100 transition-all duration-300 group hover:rotate-90 hover:scale-110"
          >
            <X size={18} className="text-slate-400 group-hover:text-slate-700 transition-colors" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="px-8 py-5 bg-gradient-to-b from-slate-50/80 to-white border-b border-slate-100">
          <div className="flex p-1.5 bg-slate-100/80 rounded-2xl shadow-inner backdrop-blur-sm w-fit">
            <button
              onClick={() => setMode('screenshot')}
              className={`px-5 py-2.5 text-[11px] font-bold tracking-wider uppercase rounded-xl transition-all duration-300 flex items-center gap-2 ${
                mode === 'screenshot'
                  ? 'bg-white text-slate-900 shadow-lg scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50 hover:scale-105'
              }`}
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
            >
              <Link size={13} strokeWidth={2.5} />
              Paste URL
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-8 max-h-[60vh] overflow-y-auto">
          {mode === 'screenshot' && (
            <div className="space-y-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              
              <UploadZone
                uploadStatus={uploadStatus}
                isDragging={isDragging}
                candidateId={formData.candidate_id}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => uploadStatus === 'idle' && fileInputRef.current?.click()}
              />
              
              {uploadStatus !== 'idle' && (
                <FormSection
                  formData={formData}
                  personalFields={personalFields}
                  updateFormData={updateFormData}
                  updatePersonalFields={updatePersonalFields}
                  mode={mode}
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
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3 bg-gradient-to-t from-slate-50/30 to-white">
          <button
            onClick={onClose}
            className="px-6 py-3 text-[11px] font-bold tracking-wider uppercase rounded-xl border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-300 hover:shadow-md hover:scale-105 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isFormValid}
            className={`px-6 py-3 text-[11px] font-bold tracking-wider uppercase rounded-xl text-white transition-all duration-300 flex items-center gap-2.5 ${
              saving || !isFormValid
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
  );
};

export default AddProspectModal;