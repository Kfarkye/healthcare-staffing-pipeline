// ============================================================================
// src/components/prospects/EditProspectModal.tsx
// JONY IVE CLARITY: Every element serves a clear purpose
// ============================================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, CheckCircle, Circle, Edit2, Loader2, Save, Plus, Trash2, Upload, Rocket } from 'lucide-react';
import { supabase as supabaseClient } from '../../lib/supabase';

// ============================================================================
// DESIGN SYSTEM - Purposeful and minimal
// ============================================================================

const DESIGN = {
  space: {
    xs: '0.5rem',
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
  },
  text: {
    label: 'text-[10px] font-semibold uppercase tracking-wider text-slate-500',
    value: 'text-[13px] font-medium text-slate-900',
    input: 'text-[13px] text-slate-900',
    body: 'text-[12px] text-slate-600',
    caption: 'text-[11px] text-slate-500',
    heading: 'text-[16px] font-semibold tracking-tight text-slate-900',
  },
  colors: {
    primary: 'purple-600',
    primaryHover: 'purple-700',
    primaryLight: 'purple-50',
    primaryBorder: 'purple-200',
    success: 'emerald-600',
    successLight: 'emerald-50',
    successBorder: 'emerald-200',
    danger: 'red-500',
    dangerLight: 'red-50',
    border: 'slate-200',
    borderHover: 'slate-300',
    bgCard: 'white',
    bgSubtle: 'slate-50',
    bgHover: 'slate-100',
  },
  elevation: {
    card: 'shadow-sm border',
    float: 'shadow-md border',
    modal: 'shadow-2xl border border-slate-200/50',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
    full: 'rounded-full',
  },
  transition: 'transition-all duration-150 ease-out',
};

// Import Prospect from shared types
import type { Prospect } from '../../shared/types/database';

// ============================================================================
// TYPES
// ============================================================================

interface EditProspectModalProps {
  prospect: Prospect;
  onClose: () => void;
  onUpdate: () => void;
  showToastNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  supabase?: any;
}

interface ChecklistItemProps {
  label: string;
  statusText: string;
  isComplete: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}

type CredentialType = 'state_licenses' | 'certifications' | 'both';

interface CredentialConfig {
  type: CredentialType;
  label: string;
  items: string[];
  uploadLabel?: string;
  description?: string;
}

// ============================================================================
// CREDENTIAL CONFIGURATION
// ============================================================================

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const CREDENTIALS_BY_PROFESSION: Record<string, CredentialConfig> = {
  'RN': {
    type: 'state_licenses',
    label: 'Nursing Licenses',
    items: US_STATES,
    uploadLabel: 'Scan License',
    description: 'State RN licenses'
  },
  'Registered Nurse': {
    type: 'state_licenses',
    label: 'Nursing Licenses',
    items: US_STATES,
    uploadLabel: 'Scan License',
    description: 'State RN licenses'
  },
  'LPN': {
    type: 'state_licenses',
    label: 'Nursing Licenses',
    items: US_STATES,
    uploadLabel: 'Scan License',
    description: 'State LPN licenses'
  },
  'Medical Assistant': {
    type: 'certifications',
    label: 'MA Certifications',
    items: ['CCMA (NHA)', 'CMA (AAMA)', 'RMA (AMT)', 'NCMA', 'CMAC'],
    description: 'National certifications'
  },
  'CNA': {
    type: 'state_licenses',
    label: 'CNA Certifications',
    items: US_STATES,
    uploadLabel: 'Scan Certificate',
    description: 'State certifications'
  },
  'default': {
    type: 'state_licenses',
    label: 'Credentials',
    items: US_STATES,
    uploadLabel: 'Scan Document',
    description: 'Professional credentials'
  }
};

const STATE_FULL_TO_ABBR: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY'
};

// ============================================================================
// UTILITIES - Clear purpose for each function
// ============================================================================

const getCredentialConfig = (profession: string | undefined): CredentialConfig => {
  if (!profession) return CREDENTIALS_BY_PROFESSION['default'];

  const key = Object.keys(CREDENTIALS_BY_PROFESSION).find(
    k => k.toLowerCase() === profession.toLowerCase()
  );

  return key ? CREDENTIALS_BY_PROFESSION[key] : CREDENTIALS_BY_PROFESSION['default'];
};

const normalizeProspect = (p: Prospect): Prospect => ({
  ...p,
  available_start_date: p.available_start_date
    ? typeof p.available_start_date === 'string'
      ? p.available_start_date.slice(0, 10)
      : new Date(p.available_start_date).toISOString().slice(0, 10)
    : null,
  licenses: Array.isArray(p.licenses) ? p.licenses : [],
  metadata: {
    references_verified: Number(p.metadata?.references_verified || 0),
    profile_complete: !!p.metadata?.profile_complete,
    ...p.metadata,
  },
  rto_notes: p.rto_notes ?? '',
});

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'Not set';
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// ============================================================================
// CHECKLIST ITEM - Single purpose: show requirement status
// ============================================================================

const ChecklistItem: React.FC<ChecklistItemProps> = ({
  label,
  statusText,
  isComplete,
  onToggle,
  children
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const IconComponent = isComplete ? CheckCircle : Circle;

  return (
    <div className={`
      group ${DESIGN.elevation.card} border-${DESIGN.colors.border} ${DESIGN.radius.md} 
      p-4 bg-${DESIGN.colors.bgCard} ${DESIGN.transition}
      hover:${DESIGN.elevation.float} hover:border-${DESIGN.colors.borderHover} hover:-translate-y-0.5
      ${isExpanded ? 'ring-2 ring-purple-500/20' : ''}
    `}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Status Indicator */}
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className={`flex-shrink-0 ${DESIGN.transition} hover:scale-110`}
              title={isComplete ? 'Mark incomplete' : 'Mark complete'}
              aria-label={isComplete ? 'Mark incomplete' : 'Mark complete'}
            >
              <IconComponent
                className={`w-5 h-5 ${DESIGN.transition} ${isComplete ? `text-${DESIGN.colors.success}` : 'text-slate-300 group-hover:text-slate-400'
                  }`}
                strokeWidth={2.5}
              />
            </button>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={DESIGN.text.value}>{label}</p>
            <p className={DESIGN.text.caption}>{statusText}</p>
          </div>

          {/* Status Badge */}
          {isComplete && (
            <div className={`flex-shrink-0 px-2.5 py-1 bg-${DESIGN.colors.successLight} text-${DESIGN.colors.success} ${DESIGN.text.label} ${DESIGN.radius.sm}`}>
              Done
            </div>
          )}

          {/* Manage Button */}
          {children && (
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className={`flex-shrink-0 px-3 py-1.5 ${DESIGN.text.label} ${DESIGN.radius.sm} border border-${DESIGN.colors.border} text-slate-600 hover:bg-${DESIGN.colors.bgHover} ${DESIGN.transition}`}
              aria-expanded={isExpanded}
              aria-label="Manage requirement"
            >
              Manage
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && children && (
        <div className={`mt-4 pt-4 border-t border-${DESIGN.colors.border} animate-slideDown`}>
          {children}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const EditProspectModal: React.FC<EditProspectModalProps> = ({
  prospect,
  onClose,
  onUpdate,
  showToastNotification,
  supabase
}) => {
  const sb = supabase ?? supabaseClient;

  const [editedProspect, setEditedProspect] = useState<Prospect>(() => normalizeProspect(prospect));
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const credentialConfig = useMemo(
    () => getCredentialConfig(editedProspect.profession),
    [editedProspect.profession]
  );

  // ============================================================================
  // KEYBOARD NAVIGATION
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAnalyzing && !isSaving) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isAnalyzing, isSaving]);

  // ============================================================================
  // DOCUMENT ANALYSIS - Extract credentials from uploaded documents
  // ============================================================================

  const analyzeDocument = useCallback(async (file: File) => {
    setIsAnalyzing(true);
    const blobUrl = URL.createObjectURL(file);
    setUploadedImage(blobUrl);

    try {
      if (!sb) throw new Error('Supabase client unavailable');

      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error('Authentication required');

      const formData = new FormData();
      formData.append('file', file);

      const functionsUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/llm-ocr-gemini`;

      const resp = await fetch(functionsUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Analysis failed: ${errorText}`);
      }

      const { licenses = [] } = await resp.json();

      if (!Array.isArray(licenses) || licenses.length === 0) {
        showToastNotification('No credentials found in document', 'info');
        return;
      }

      if (credentialConfig.type === 'state_licenses') {
        const foundAbbrs = licenses
          .map((r: { state?: string }) => r?.state && STATE_FULL_TO_ABBR[r.state])
          .filter(Boolean) as string[];

        const currentLicenses = editedProspect.licenses || [];
        const newToAdd = foundAbbrs.filter(abbr => !currentLicenses.includes(abbr));

        if (newToAdd.length === 0) {
          showToastNotification('All credentials already added', 'info');
          return;
        }

        setEditedProspect(p => ({
          ...p,
          licenses: [...(p.licenses || []), ...newToAdd].sort()
        }));

        showToastNotification(
          `Added ${newToAdd.length} credential${newToAdd.length > 1 ? 's' : ''}: ${newToAdd.join(', ')}`,
          'success'
        );
      } else {
        showToastNotification('Add certifications manually from dropdown', 'info');
      }

    } catch (error: any) {
      console.error('[Document Analysis]', error);
      showToastNotification(error.message || 'Analysis failed', 'error');
      setUploadedImage(null);
    } finally {
      URL.revokeObjectURL(blobUrl);
      setIsAnalyzing(false);
    }
  }, [credentialConfig.type, editedProspect.licenses, sb, showToastNotification]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        showToastNotification('Upload image or PDF only', 'error');
        return;
      }
      analyzeDocument(file);
    }
  }, [analyzeDocument, showToastNotification]);

  // ============================================================================
  // CREDENTIAL MANAGEMENT
  // ============================================================================

  const addCredential = useCallback(() => {
    if (!selectedCredential) return;

    const currentLicenses = editedProspect.licenses || [];
    if (currentLicenses.includes(selectedCredential)) {
      showToastNotification(`${selectedCredential} already added`, 'info');
      return;
    }

    setEditedProspect(p => ({ ...p, licenses: [...currentLicenses, selectedCredential].sort() }));
    setSelectedCredential('');
    showToastNotification(`Added ${selectedCredential}`, 'success');
  }, [selectedCredential, editedProspect.licenses, showToastNotification]);

  const removeCredential = useCallback((credential: string) => {
    setEditedProspect(p => ({ ...p, licenses: p.licenses?.filter(s => s !== credential) }));
    showToastNotification(`Removed ${credential}`, 'info');
  }, [showToastNotification]);

  // ============================================================================
  // REQUIREMENT TOGGLES
  // ============================================================================

  const toggleReferencesVerified = useCallback(() =>
    setEditedProspect(p => ({
      ...p,
      metadata: {
        ...p.metadata,
        references_verified: (p.metadata?.references_verified || 0) >= 2 ? 0 : 2
      }
    })), []
  );

  const toggleProfileComplete = useCallback(() =>
    setEditedProspect(p => ({
      ...p,
      metadata: {
        ...p.metadata,
        profile_complete: !p.metadata?.profile_complete
      }
    })), []
  );

  const toggleStartDate = useCallback(() =>
    setEditedProspect(p => ({
      ...p,
      available_start_date: p.available_start_date ? null : new Date().toISOString().slice(0, 10)
    })), []
  );

  const toggleRtoConfirmed = useCallback(() =>
    setEditedProspect(p => ({ ...p, rto_notes: p.rto_notes ? '' : 'Confirmed' })), []
  );

  // ============================================================================
  // SAVE ACTIONS
  // ============================================================================

  const handleSaveProgress = useCallback(async () => {
    setIsSaving(true);

    try {
      if (!sb) throw new Error('Supabase client unavailable');

      const prospectId = typeof editedProspect.id === 'string'
        ? parseInt(editedProspect.id)
        : editedProspect.id;

      const payload = {
        licenses: editedProspect.licenses || [],
        available_start_date: editedProspect.available_start_date || null,
        rto_notes: editedProspect.rto_notes || null,
        metadata: {
          ...editedProspect.metadata,
          profile_complete: editedProspect.metadata?.profile_complete ?? false,
          references_verified: editedProspect.metadata?.references_verified ?? 0,
        },
        updated_at: new Date().toISOString(),
      };

      const { error } = await sb
        .from('prospects')
        .update(payload)
        .eq('id', prospectId);

      if (error) throw error;

      showToastNotification('Progress saved', 'success');
      onUpdate();
      onClose();
    } catch (err: any) {
      console.error('[Save]', err);
      showToastNotification(err.message || 'Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [editedProspect, sb, onUpdate, onClose, showToastNotification]);

  const handleSaveAndMarkReady = useCallback(async () => {
    setIsSaving(true);

    try {
      if (!sb) throw new Error('Supabase client unavailable');

      const prospectId = typeof editedProspect.id === 'string'
        ? parseInt(editedProspect.id)
        : editedProspect.id;

      const payload = {
        licenses: editedProspect.licenses || [],
        available_start_date: editedProspect.available_start_date || null,
        rto_notes: editedProspect.rto_notes || null,
        metadata: {
          ...editedProspect.metadata,
          profile_complete: editedProspect.metadata?.profile_complete ?? false,
          references_verified: editedProspect.metadata?.references_verified ?? 0,
        },
        status: 'Submittal Ready',
        updated_at: new Date().toISOString(),
      };

      const { error } = await sb
        .from('prospects')
        .update(payload)
        .eq('id', prospectId);

      if (error) throw error;

      showToastNotification('Marked as Submittal Ready', 'success');
      onUpdate();
      onClose();
    } catch (err: any) {
      console.error('[Mark Ready]', err);
      showToastNotification(err.message || 'Failed to mark ready', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [editedProspect, sb, onUpdate, onClose, showToastNotification]);

  // ============================================================================
  // READINESS CALCULATION
  // ============================================================================

  const { readinessPercentage, completedCount, totalRequirements } = useMemo(() => {
    const requirements = [
      (editedProspect.metadata?.references_verified || 0) >= 2,
      editedProspect.metadata?.profile_complete === true,
      !!editedProspect.licenses?.length,
      !!editedProspect.available_start_date,
      !!editedProspect.rto_notes,
    ];
    const completed = requirements.filter(Boolean).length;
    const total = requirements.length;
    return {
      readinessPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      completedCount: completed,
      totalRequirements: total,
    };
  }, [editedProspect]);

  const availableCredentials = useMemo(() => {
    const currentLicenses = editedProspect.licenses || [];
    return credentialConfig.items.filter(item => !currentLicenses.includes(item));
  }, [editedProspect.licenses, credentialConfig.items]);

  const isReady = readinessPercentage === 100;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.15s ease-out; }
        .animate-slideDown { animation: slideDown 0.15s ease-out; }
        .animate-slideUp { animation: slideUp 0.2s ease-out; }
      `}</style>

      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`relative w-full max-w-2xl bg-${DESIGN.colors.bgSubtle} ${DESIGN.radius.lg} ${DESIGN.elevation.modal} flex flex-col max-h-[90vh] animate-slideUp`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >

        {/* Header - Context for what you're editing */}
        <header className={`px-6 py-5 border-b border-${DESIGN.colors.border} bg-gradient-to-b from-${DESIGN.colors.bgSubtle} to-white backdrop-blur-sm sticky top-0 z-10 ${DESIGN.radius.lg} ${DESIGN.radius.lg.replace('rounded', 'rounded-t')}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Icon Badge */}
              <div className={`p-2.5 bg-${DESIGN.colors.primaryLight} border border-${DESIGN.colors.primaryBorder} ${DESIGN.radius.md} ${DESIGN.elevation.card}`}>
                <Edit2 className={`w-5 h-5 text-${DESIGN.colors.primary}`} strokeWidth={2.5} />
              </div>

              {/* Title & Context */}
              <div>
                <h2 id="modal-title" className={DESIGN.text.heading}>
                  Submittal Readiness
                </h2>
                <p className={DESIGN.text.caption}>
                  {prospect.name} · {prospect.profession || prospect.specialty || 'Healthcare Professional'}
                </p>
              </div>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className={`p-2 ${DESIGN.radius.md} hover:bg-${DESIGN.colors.bgHover} ${DESIGN.transition}`}
              aria-label="Close modal"
            >
              <X size={18} className="text-slate-400" strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* Requirements Checklist */}
        <main className="flex-1 p-6 space-y-3 overflow-y-auto">

          {/* References */}
          <ChecklistItem
            label="References Verified"
            isComplete={(editedProspect.metadata?.references_verified || 0) >= 2}
            statusText={`${editedProspect.metadata?.references_verified || 0} of 2 verified`}
            onToggle={toggleReferencesVerified}
          >
            <div className="space-y-2">
              <button
                onClick={() => setEditedProspect(p => ({ ...p, metadata: { ...p.metadata, references_verified: 2 } }))}
                className={`w-full text-left px-4 py-2.5 ${DESIGN.text.input} hover:bg-${DESIGN.colors.bgHover} ${DESIGN.radius.sm} ${DESIGN.transition}`}
              >
                Mark 2 verified
              </button>
              <button
                onClick={() => setEditedProspect(p => ({ ...p, metadata: { ...p.metadata, references_verified: 1 } }))}
                className={`w-full text-left px-4 py-2.5 ${DESIGN.text.input} hover:bg-${DESIGN.colors.bgHover} ${DESIGN.radius.sm} ${DESIGN.transition}`}
              >
                Mark 1 verified
              </button>
              <button
                onClick={() => setEditedProspect(p => ({ ...p, metadata: { ...p.metadata, references_verified: 0 } }))}
                className={`w-full text-left px-4 py-2.5 ${DESIGN.text.input} hover:bg-${DESIGN.colors.bgHover} ${DESIGN.radius.sm} ${DESIGN.transition}`}
              >
                Reset to 0
              </button>
            </div>
          </ChecklistItem>

          {/* Profile */}
          <ChecklistItem
            label="Profile Complete"
            isComplete={!!editedProspect.metadata?.profile_complete}
            statusText={editedProspect.metadata?.profile_complete ? 'Completed in Nova' : 'Incomplete'}
            onToggle={toggleProfileComplete}
          />

          {/* Credentials */}
          <ChecklistItem
            label={credentialConfig.label}
            isComplete={!!(editedProspect.licenses && editedProspect.licenses.length > 0)}
            statusText={
              editedProspect.licenses?.length
                ? `${editedProspect.licenses.length} on file: ${editedProspect.licenses.join(', ')}`
                : 'None added'
            }
          >
            <div className="space-y-4">
              {/* Document Scanner */}
              {credentialConfig.type !== 'certifications' && (
                <div className={`p-4 bg-${DESIGN.colors.primaryLight} border border-${DESIGN.colors.primaryBorder} ${DESIGN.radius.md}`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    aria-label="Upload credential document"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className={`w-full flex items-center justify-center gap-2.5 px-4 py-3 text-[13px] font-semibold bg-${DESIGN.colors.primary} text-white ${DESIGN.radius.md} hover:bg-${DESIGN.colors.primaryHover} disabled:opacity-50 disabled:cursor-not-allowed ${DESIGN.transition}`}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing document...
                      </>
                    ) : (
                      <>
                        <Upload size={16} strokeWidth={2.5} />
                        {credentialConfig.uploadLabel}
                      </>
                    )}
                  </button>
                  <p className={`${DESIGN.text.caption} text-purple-700 mt-2 text-center`}>
                    {credentialConfig.description}
                  </p>
                </div>
              )}

              {/* Preview */}
              {uploadedImage && (
                <div className="relative">
                  <img src={uploadedImage} alt="Uploaded credential" className={`w-full h-32 object-cover ${DESIGN.radius.md} border border-${DESIGN.colors.border}`} />
                  <button
                    onClick={() => setUploadedImage(null)}
                    className={`absolute top-2 right-2 p-1.5 bg-white ${DESIGN.radius.full} ${DESIGN.elevation.card}`}
                    aria-label="Remove preview"
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Manual Add */}
              <div className="flex gap-2">
                <select
                  value={selectedCredential}
                  onChange={(e) => setSelectedCredential(e.target.value)}
                  disabled={isAnalyzing}
                  className={`flex-1 px-3 py-2.5 ${DESIGN.text.input} border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.primary} ${DESIGN.transition} disabled:opacity-50`}
                  aria-label="Select credential to add"
                >
                  <option value="">Select...</option>
                  {availableCredentials.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <button
                  onClick={addCredential}
                  disabled={!selectedCredential || isAnalyzing}
                  className={`flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold bg-slate-900 text-white ${DESIGN.radius.sm} hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${DESIGN.transition}`}
                  aria-label="Add selected credential"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Add
                </button>
              </div>

              {/* Credential List */}
              {editedProspect.licenses?.length === 0 && (
                <p className={`${DESIGN.text.body} text-center py-4 text-slate-400`}>
                  No credentials added
                </p>
              )}

              {editedProspect.licenses && editedProspect.licenses.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {editedProspect.licenses.map((credential) => (
                    <div
                      key={credential}
                      className={`flex items-center justify-between p-3 bg-${DESIGN.colors.bgSubtle} ${DESIGN.radius.sm} border border-${DESIGN.colors.border}`}
                    >
                      <span className={DESIGN.text.value}>{credential}</span>
                      <button
                        onClick={() => removeCredential(credential)}
                        disabled={isAnalyzing}
                        className={`p-1.5 text-${DESIGN.colors.danger} hover:bg-${DESIGN.colors.dangerLight} ${DESIGN.radius.sm} disabled:opacity-50 ${DESIGN.transition}`}
                        aria-label={`Remove ${credential}`}
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ChecklistItem>

          {/* Start Date */}
          <ChecklistItem
            label="Start Date"
            isComplete={!!editedProspect.available_start_date}
            statusText={formatDate(editedProspect.available_start_date as string)}
            onToggle={toggleStartDate}
          >
            <div>
              <label className={`block ${DESIGN.text.label} mb-2`}>
                Available to start
              </label>
              <input
                type="date"
                value={(editedProspect.available_start_date as string) || ''}
                onChange={(e) => setEditedProspect(p => ({ ...p, available_start_date: e.target.value || null }))}
                className={`w-full px-3 py-2.5 ${DESIGN.text.input} border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.primary} ${DESIGN.transition}`}
                aria-label="Select start date"
              />
            </div>
          </ChecklistItem>

          {/* RTO */}
          <ChecklistItem
            label="Time Off Confirmed"
            isComplete={!!editedProspect.rto_notes}
            statusText={editedProspect.rto_notes ? 'Documented' : 'Not confirmed'}
            onToggle={toggleRtoConfirmed}
          >
            <div>
              <label className={`block ${DESIGN.text.label} mb-2`}>
                Requested time off (RTO)
              </label>
              <textarea
                value={editedProspect.rto_notes || ''}
                onChange={(e) => setEditedProspect(p => ({ ...p, rto_notes: e.target.value }))}
                rows={3}
                placeholder="e.g., Needs Thanksgiving week"
                className={`w-full px-3 py-2.5 ${DESIGN.text.input} border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.primary} ${DESIGN.transition} resize-none`}
                aria-label="Time off notes"
              />
            </div>
          </ChecklistItem>
        </main>

        {/* Footer - Progress and actions */}
        <footer className={`px-6 py-5 border-t border-${DESIGN.colors.border} bg-gradient-to-t from-white to-${DESIGN.colors.bgSubtle} backdrop-blur-sm sticky bottom-0 z-10 ${DESIGN.radius.lg} ${DESIGN.radius.lg.replace('rounded', 'rounded-b')}`}>
          <div className="flex items-center justify-between gap-6">
            {/* Progress Indicator */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-2">
                <p className={`text-[15px] font-bold text-slate-900`}>
                  {readinessPercentage}% Ready
                </p>
                <p className={DESIGN.text.caption}>
                  {completedCount} of {totalRequirements} done
                </p>
              </div>
              <div className={`relative h-2 w-full bg-slate-200 ${DESIGN.radius.full} overflow-hidden`}>
                <div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r from-${DESIGN.colors.success} to-emerald-500 ${DESIGN.radius.full} ${DESIGN.transition}`}
                  style={{ width: `${readinessPercentage}%` }}
                />
              </div>
              {isReady && (
                <p className={`${DESIGN.text.caption} text-${DESIGN.colors.success} font-semibold mt-1.5`}>
                  ✓ Ready for submittal
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveProgress}
                disabled={isSaving}
                className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold ${DESIGN.radius.md} border-2 border-${DESIGN.colors.border} text-slate-700 hover:bg-${DESIGN.colors.bgHover} disabled:opacity-50 disabled:cursor-not-allowed ${DESIGN.transition}`}
                aria-label="Save progress"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" strokeWidth={2.5} />
                )}
                Save
              </button>

              <button
                onClick={handleSaveAndMarkReady}
                disabled={isSaving || !isReady}
                className={`flex items-center gap-2.5 px-5 py-3 text-[12px] font-semibold ${DESIGN.radius.md} ${DESIGN.transition} ${isSaving || !isReady
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : `bg-slate-900 text-white hover:bg-slate-800 ${DESIGN.elevation.card}`
                  }`}
                title={!isReady ? 'Complete all requirements first' : 'Mark as ready for submittal'}
                aria-label="Mark as ready for submittal"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" strokeWidth={2.5} />
                )}
                Mark Ready
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default EditProspectModal;