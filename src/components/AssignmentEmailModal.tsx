// ============================================================================
// src/components/AssignmentEmailModal.tsx
// PRODUCTION VERSION: Includes extension date saving functionality
// ============================================================================

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Send, Copy, Check, Upload, Loader2, Phone, ExternalLink,
  FileText, DollarSign, Mail, Clock, User,
  Heart, PiggyBank, Edit2, CheckCircle, AlertTriangle, Save
} from 'lucide-react';
import { EmailModalShell } from './shared/EmailModalShell';
import { supabase } from '../lib/supabase';
import { extractExtensionRequestFromImage } from '../services/extensionExtractionService';
import type { ExtensionRequestData } from '../services/extensionExtractionService';
import type { Contract, TemplateType } from '../types/email';
import { trackEvent } from '../utils/telemetry';

// ============================================================================
// DESIGN SYSTEM - Jony Ive Inspired: Every pixel serves a purpose
// ============================================================================

const DESIGN = {
  space: {
    xs: '0.5rem',    // Tight groupings
    sm: '1rem',      // Related elements
    md: '1.5rem',    // Section separation
    lg: '2rem',      // Major divisions
  },
  text: {
    label: 'text-[10px] font-semibold uppercase tracking-wider text-slate-500',
    value: 'text-[13px] font-medium text-slate-900',
    input: 'text-[13px] text-slate-900',
    body: 'text-[13px] leading-relaxed text-slate-800',
    caption: 'text-[11px] text-slate-500',
  },
  colors: {
    primary: 'slate-900',
    secondary: 'slate-600',
    tertiary: 'slate-400',
    warning: 'amber-500',
    success: 'emerald-600',
    border: 'slate-200',
    borderFocus: 'blue-500',
    bgCard: 'white',
    bgSubtle: 'slate-50',
    bgHover: 'slate-100',
  },
  elevation: {
    none: '',
    card: 'shadow-sm border border-slate-100',
    float: 'shadow-md border border-slate-200',
    modal: 'shadow-xl',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    full: 'rounded-full',
  },
  transition: 'transition-all duration-150 ease-out',
};

// ============================================================================
// TYPES
// ============================================================================

interface AssignmentEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract | null;
  initialTab?: TemplateType;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface ApprovalFormData {
  reason: string;
  placementType: 'Extension' | 'New Placement' | 'Change of Contract';
  premiumNeeded: 'Y' | 'N';
  premiumReason: string;
  sentToComp: 'Y' | 'N';
  compResponse: string;
  marginPercent: string;
}

interface ExtensionData {
  unit: string;
  currentBillRate: string;
  currentShiftHours: string;
  currentEndDate: string;
  localStatus: string;
  proposedDates: string;
  proposedStartDate?: Date | null;
  proposedEndDate?: Date | null;
  timeOffBetween: string;
  timeOffDuring: string;
  managerDiscussion: string;
  additionalDetails: string;
}

interface ExtractedDataWithConfidence extends ExtensionRequestData {
  _confidence?: {
    [field: string]: number;
  };
  _validated?: {
    accountManager?: boolean;
    accountCoordinator?: boolean;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIFFANY_EMAIL = 'Tiffany.Chavez@ayahealthcare.com';
const DEFAULT_SIGNATURE = `Thank you!`;

const TEMPLATE_TABS: { key: TemplateType; label: string; icon: any }[] = [
  { key: 'outreach', label: 'Outreach', icon: Mail },
  { key: 'interested', label: 'Interested', icon: User },
  { key: 'extension_request', label: 'Extension', icon: Clock },
  { key: 'margin_approval', label: 'Margin', icon: DollarSign },
  { key: 'reimbursement', label: 'Reimbursement', icon: FileText },
  { key: 'benefits', label: 'Benefits', icon: Heart },
  { key: '401k', label: '401(k)', icon: PiggyBank },
];

// ============================================================================
// UTILITIES
// ============================================================================

const getFirstName = (fullName: string | null | undefined): string => {
  if (!fullName) return '[First Name]';
  return fullName.split(' ')[0];
};

const formatEndDate = (endDate: string | null | undefined): string => {
  if (!endDate) return '[End Date]';
  const date = new Date(`${endDate}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? '[End Date]'
    : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const firstNonEmpty = (...vals: (string | null | undefined)[]): string =>
  vals.find(v => v && v.trim())?.trim() || '';

const isPlaceholder = (v?: string | null) =>
  !v ||
  /^\s*\[.*\]\s*$/.test(v) ||
  /^\s*(none|n\/a|na|null|undefined)\s*$/i.test(v);

const pick = (...vals: (string | null | undefined)[]): string =>
  vals.find(v => !isPlaceholder(v))?.trim() || '';

const nameToEmail = (name: string): string => {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, '.') + '@ayahealthcare.com';
};

const encodeParam = (s: string): string =>
  encodeURIComponent(s ?? '');

const buildOutlookLink = (to: string, cc: string | undefined, subject: string, body: string): string =>
  `https://outlook.office.com/mail/deeplink/compose?to=${encodeParam(to)}${cc ? `&cc=${encodeParam(cc)}` : ''}&subject=${encodeParam(subject)}&body=${encodeParam(body)}`;

const parseDateString = (dateStr: string): Date | null => {
  if (!dateStr || isPlaceholder(dateStr)) return null;

  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
};

// ============================================================================
// CLARITY COMPONENTS - Every element has clear purpose and meaning
// ============================================================================

const DateConfirmationBadge: React.FC<{
  startDate: Date | null;
  endDate: Date | null;
}> = ({ startDate, endDate }) => {
  if (!startDate || !endDate) return null;

  const weeks = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
  );

  return (
    <div className="col-span-2 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`${DESIGN.text.label} text-emerald-900 mb-2`}>
            Dates Confirmed
          </div>
          <div className="text-[14px] text-emerald-900 font-medium space-y-1">
            <div>
              Start: {startDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
            <div>
              End: {endDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
            <div className="text-emerald-700 text-[12px] mt-2">
              {weeks} week assignment
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConfidenceIndicator: React.FC<{ confidence: number }> = ({ confidence }) => {
  if (confidence >= 0.7) return null;

  return (
    <div
      className="inline-flex items-center gap-1 text-amber-600"
      title="Please verify - lower confidence extraction"
    >
      <AlertTriangle className="w-3.5 h-3.5" />
      <span className="text-[10px] font-medium">Verify</span>
    </div>
  );
};

// ============================================================================
// TEMPLATE GENERATOR
// ============================================================================

function generateTemplate(
  contract: Contract,
  templateType: TemplateType,
  formData: { approval: ApprovalFormData; extension: ExtensionData },
  extractedExtension?: ExtensionRequestData | null
): { subject: string; body: string; to: string; cc?: string } {
  const firstName = getFirstName(contract.candidate_name);
  const facility = contract.facility_name || '[FACILITY NAME]';
  const specialty = contract.specialty || '[SPECIALTY]';
  const endDate = formatEndDate(contract.end_date);

  let subject = '';
  let body = '';
  let to = '';
  let cc: string | undefined = TIFFANY_EMAIL;

  switch (templateType) {
    case 'extension_request': {
      const candidateName = pick(extractedExtension?.candidateName, contract.candidate_name, '[CANDIDATE NAME]');
      const facilityName = pick(extractedExtension?.facility, contract.facility_name, '[FACILITY NAME]');

      subject = `EXTENSION REQUEST – ${candidateName} – ${facilityName}`;

      let contractAM = '';
      let contractAC = '';

      if (contract.am_name && contract.ac_name) {
        contractAM = nameToEmail(contract.am_name);
        contractAC = nameToEmail(contract.ac_name);
      }
      else if (contract.am_ac) {
        const names = contract.am_ac.split(/[;,]/).map(s => s.trim()).filter(Boolean);
        if (names[0]) contractAM = nameToEmail(names[0]);
        if (names[1]) contractAC = nameToEmail(names[1]);
      }

      const amEmail = contractAM || (extractedExtension?.accountManager
        ? nameToEmail(extractedExtension.accountManager)
        : '');

      const acEmail = contractAC || (extractedExtension?.accountCoordinator
        ? nameToEmail(extractedExtension.accountCoordinator)
        : '');

      to = amEmail || '[AM EMAIL]';

      const ccList = [];
      if (acEmail) ccList.push(acEmail);
      ccList.push(TIFFANY_EMAIL);
      cc = ccList.join('; ');

      const unit = pick(formData.extension.unit, extractedExtension?.specialty, contract.specialty, '[UNIT]');
      const currentEndDate = pick(formData.extension.currentEndDate, formatEndDate(contract.end_date), '[END DATE]');
      const billRate = pick(
        formData.extension.currentBillRate,
        extractedExtension?.currentBillRate,
        extractedExtension?.billRate,
        extractedExtension?.rate,
        '[RATE]'
      );
      const shift = pick(
        formData.extension.currentShiftHours,
        extractedExtension?.currentShift,
        extractedExtension?.shift,
        '[SHIFT]'
      );
      const proposedDates = pick(
        formData.extension.proposedDates,
        extractedExtension?.proposedDates,
        extractedExtension?.proposedStartDate && extractedExtension?.proposedEndDate
          ? `${extractedExtension.proposedStartDate} - ${extractedExtension.proposedEndDate}`
          : '',
        '[PROPOSED DATES]'
      );

      body = [
        `Hi Team,`,
        '',
        `${candidateName} would like to extend.`,
        '',
        `Please see the details below:`,
        '',
        `Candidate: ${candidateName}`,
        `Local (Y/N): ${pick(formData.extension.localStatus, '[Y/N]')}`,
        `Facility: ${facilityName}`,
        `Unit: ${unit}`,
        `Current Bill Rate: ${billRate}`,
        `Current Shift/Hours: ${shift}`,
        `Current End Date: ${currentEndDate}`,
        `Proposed Extension Dates: ${proposedDates}`,
        `Requested Time Off Between Assignments: ${formData.extension.timeOffBetween || 'None'}`,
        `Requested Time Off During Assignment: ${formData.extension.timeOffDuring || 'None'}`,
        `Was this Extension Discussed with Manager (name)?: ${formData.extension.managerDiscussion === 'No' ? 'No' : (formData.extension.managerDiscussion === 'Yes' ? 'Yes' : formData.extension.managerDiscussion || 'Yes')}`,
        `Any other details we need to confirm?: ${formData.extension.additionalDetails || 'N/A'}`,
        '',
        'Thank you!',
      ].join('\n');
      break;
    }

    case 'margin_approval': {
      const margin = formData.approval.marginPercent || String(contract.actual_margin ?? '');
      subject = `Margin Approval – ${contract.candidate_name || '[CANDIDATE]'} – ${margin || '[XX]'}%`;
      to = 'Colton.Valdez@ayahealthcare.com';
      cc = undefined;
      body = [
        `Reason needed for approval? ${formData.approval.reason || '[REASON]'}`,
        ``,
        `Is this a New Placement, Extension, or Change of Contract? ${formData.approval.placementType}`,
        ``,
        `Is premium approval needed? ${formData.approval.premiumNeeded}`,
        formData.approval.premiumNeeded === 'Y'
          ? `Why? ${formData.approval.premiumReason || 'N/A'}`
          : '',
        ``,
        `Was this sent to Comp Info (Y/N)? ${formData.approval.sentToComp}`,
        formData.approval.sentToComp === 'Y'
          ? `Distro response: ${formData.approval.compResponse || 'N/A'}`
          : '',
        '',
        DEFAULT_SIGNATURE
      ].filter(Boolean).join('\n');
      break;
    }

    case 'reimbursement': {
      subject = `Reimbursement Form – ${contract.candidate_name || '[Candidate Name]'}`;
      to = 'ReimbursementForms@ayahealthcare.com';
      cc = undefined;
      const email = firstNonEmpty(contract.candidate_email, contract.email) || '[Candidate Email]';
      const novaLine = contract.nova_url ? `Nova link: ${contract.nova_url}\n` : '';
      body = `Hi Team,\n\nCan we please send ${contract.candidate_name} a reimbursement form for their relocation reimbursement?\n\n${novaLine}Email: ${email}\n\nThank you!`;
      break;
    }

    case 'interested': {
      subject = `Next Steps on your extension at ${facility}`;
      to = firstNonEmpty(contract.candidate_email, contract.email) || '[CANDIDATE EMAIL]';
      body = `Hi ${firstName},\n\nGreat to hear you're interested in extending at ${facility}. I'm working on getting an offer put together for you now.\n\nI'll be in touch with the details as soon as I have them.\n\n${DEFAULT_SIGNATURE}`;
      break;
    }

    case 'benefits': {
      const candidateName = contract.candidate_name || '[Candidate Name]';
      subject = `Benefits Assistance – ${candidateName}`;
      to = 'Benefits@ayahealthcare.com';
      cc = TIFFANY_EMAIL;
      const email = firstNonEmpty(contract.candidate_email, contract.email) || '[Candidate Email]';
      const novaLine = contract.nova_url ? `Nova Link: ${contract.nova_url}\n` : '';
      body = `Hi Team,\n\n${candidateName} needed help with their benefits. Can we please reach out to assist?\nThey want to make sure their dependents are added correctly.\n\n${novaLine}Email: ${email}\n\nThank you!`;
      break;
    }

    case '401k': {
      const candidateName = contract.candidate_name || '[Candidate Name]';
      subject = `401(k) Assistance – ${candidateName}`;
      to = 'Benefits@ayahealthcare.com';
      cc = TIFFANY_EMAIL;
      const email = firstNonEmpty(contract.candidate_email, contract.email) || '[Candidate Email]';
      const novaLine = contract.nova_url ? `Nova Link: ${contract.nova_url}\n` : '';
      body = `Hi Team,\n\n${candidateName} needs help with their 401(k). Can we please reach out to them to assist?\n\n${novaLine}Email: ${email}\n\nThank you!`;
      break;
    }

    case 'outreach':
    default: {
      subject = `Quick question about your assignment at ${facility}`;
      to = firstNonEmpty(contract.candidate_email, contract.email) || '[CANDIDATE EMAIL]';
      body = `Hi ${firstName},\n\nI hope your ${specialty} assignment at ${facility} is going well!\n\nI wanted to check in and see how things are going. Your contract is scheduled to end on ${endDate}.\n\nAre you interested in extending, or would you like to explore other opportunities?\n\nLet me know!\n\n${DEFAULT_SIGNATURE}`;
      break;
    }
  }

  return { subject, body, to, cc };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AssignmentEmailModal({
  isOpen,
  onClose,
  contract,
  initialTab = 'outreach',
  showToast,
}: AssignmentEmailModalProps) {
  const [templateType, setTemplateType] = useState<TemplateType>(initialTab);

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedTo, setEditedTo] = useState('');
  const [editedCc, setEditedCc] = useState('');

  const [isSavingExtensionDates, setIsSavingExtensionDates] = useState(false);
  const [extensionDatesSaved, setExtensionDatesSaved] = useState(false);

  const [approvalForm, setApprovalForm] = useState<ApprovalFormData>({
    reason: '',
    placementType: 'Extension',
    premiumNeeded: 'N',
    premiumReason: '',
    sentToComp: 'N',
    compResponse: '',
    marginPercent: '',
  });

  const [extensionForm, setExtensionForm] = useState<ExtensionData>({
    unit: '',
    currentBillRate: '',
    currentShiftHours: '',
    currentEndDate: '',
    localStatus: 'N',
    proposedDates: '',
    proposedStartDate: null,
    proposedEndDate: null,
    timeOffBetween: 'None',
    timeOffDuring: 'None',
    managerDiscussion: 'Yes',
    additionalDetails: 'N/A',
  });

  const [extensionExtract, setExtensionExtract] = useState<ExtractedDataWithConfidence | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [extractionConfidence, setExtractionConfidence] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    if (contract) {
      setExtensionForm(prev => ({
        ...prev,
        currentEndDate: formatEndDate(contract.end_date),
        unit: contract.specialty || '',
        localStatus: prev.localStatus || 'N',
        timeOffBetween: prev.timeOffBetween || 'None',
        timeOffDuring: prev.timeOffDuring || 'None',
        managerDiscussion: prev.managerDiscussion || 'Yes',
        additionalDetails: prev.additionalDetails || 'N/A',
      }));
      setApprovalForm(prev => ({
        ...prev,
        marginPercent: String(contract.actual_margin ?? ''),
      }));
    }
  }, [contract]);

  const email = useMemo(() => {
    if (!contract) return { subject: '', body: '', to: '', cc: '' };

    const generated = generateTemplate(contract, templateType, {
      approval: approvalForm,
      extension: extensionForm
    }, extensionExtract);

    return {
      ...generated,
      to: isEditingEmail && editedTo ? editedTo : generated.to,
      cc: isEditingEmail && editedCc !== undefined ? editedCc : generated.cc
    };
  }, [contract, templateType, approvalForm, extensionForm, extensionExtract, isEditingEmail, editedTo, editedCc]);

  useEffect(() => {
    if (!isEditingEmail && email) {
      setEditedTo(email.to);
      setEditedCc(email.cc || '');
    }
  }, [email, isEditingEmail, templateType]);

  const handleCopy = useCallback(async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
      showToast?.('Copied to clipboard', 'success');
    } catch {
      showToast?.('Failed to copy', 'error');
    }
  }, [showToast]);

  const openOutlookWeb = useCallback(() => {
    const finalTo = email.to;
    const finalCc = email.cc;

    if (!finalTo || finalTo.includes('[')) {
      showToast?.('Please complete all required fields', 'error');
      return;
    }

    const url = buildOutlookLink(finalTo, finalCc, email.subject, email.body);
    window.open(url, '_blank');

    trackEvent('email_modal_sent', {
      kind: 'assignment',
      template: templateType,
    });

    onClose();
  }, [email, templateType, showToast, onClose]);

  const handleSaveExtensionDates = async () => {
    if (!contract?.id) {
      showToast?.('No assignment found', 'error');
      return;
    }

    if (!extensionForm.proposedStartDate || !extensionForm.proposedEndDate) {
      showToast?.('Please ensure dates are extracted first', 'error');
      return;
    }

    setIsSavingExtensionDates(true);
    try {
      const { error } = await supabase.rpc('set_extension_dates', {
        assignment_id_param: contract.id,
        new_start_date: extensionForm.proposedStartDate.toISOString().split('T')[0],
        new_end_date: extensionForm.proposedEndDate.toISOString().split('T')[0]
      });

      if (error) {
        console.error('[Save Extension Dates] Error:', error);
        showToast?.('Failed to save extension dates: ' + error.message, 'error');
        return;
      }

      setExtensionDatesSaved(true);
      showToast?.('✅ Extension dates saved successfully', 'success');

      trackEvent('extension_dates_saved', {
        contract_id: contract.id,
        duration_weeks: Math.round(
          (extensionForm.proposedEndDate.getTime() - extensionForm.proposedStartDate.getTime())
          / (1000 * 60 * 60 * 24 * 7)
        )
      });
    } catch (error: any) {
      console.error('[Save Extension Dates] Exception:', error);
      showToast?.('Failed to save extension dates', 'error');
    } finally {
      setIsSavingExtensionDates(false);
    }
  };

  const validateExtractedPeople = async (extracted: ExtractedDataWithConfidence) => {
    const validated = { ...extracted };

    if (extracted.accountManager) {
      const { data: amData } = await supabase
        .from('people')
        .select('full_name, email')
        .ilike('full_name', `%${extracted.accountManager}%`)
        .single();

      if (!amData) {
        validated._confidence = { ...validated._confidence, accountManager: 0.3 };
        validated._validated = { ...validated._validated, accountManager: false };
      } else {
        validated._confidence = { ...validated._confidence, accountManager: 0.9 };
        validated._validated = { ...validated._validated, accountManager: true };
      }
    }

    if (extracted.accountCoordinator) {
      const { data: acData } = await supabase
        .from('people')
        .select('full_name, email')
        .ilike('full_name', `%${extracted.accountCoordinator}%`)
        .single();

      if (!acData) {
        validated._confidence = { ...validated._confidence, accountCoordinator: 0.3 };
        validated._validated = { ...validated._validated, accountCoordinator: false };
      } else {
        validated._confidence = { ...validated._confidence, accountCoordinator: 0.9 };
        validated._validated = { ...validated._validated, accountCoordinator: true };
      }
    }

    return validated;
  };

  const getSmartDefaults = async (facilityName: string) => {
    const { data: historicalData } = await supabase
      .from('active_assignments')
      .select('specialty, extension_stage')
      .eq('facility_name', facilityName)
      .eq('extension_stage', 'SIGNED')
      .limit(5);

    if (historicalData && historicalData.length > 0) {
      const shiftCounts = historicalData.reduce((acc: Record<string, number>, curr) => {
        const shift = curr.specialty || '';
        acc[shift] = (acc[shift] || 0) + 1;
        return acc;
      }, {});

      return {
        commonShift: Object.entries(shiftCounts)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || null
      };
    }

    return null;
  };

  const logExtractionAudit = async (
    contractId: string,
    extracted: ExtractedDataWithConfidence,
    final: ExtensionData
  ) => {
    try {
      await supabase.from('extraction_audit').insert({
        contract_id: contractId,
        extracted_json: extracted,
        final_json: final,
        corrections: Object.keys(final).filter(
          key => (extracted as any)[key] !== (final as any)[key]
        ),
        confidence_scores: extracted._confidence || {},
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Extraction Audit] Failed to log:', error);
    }
  };

  const handleExtensionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    try {
      const extracted = await extractExtensionRequestFromImage(file) as ExtractedDataWithConfidence;

      if (!extracted._confidence) {
        extracted._confidence = {
          currentBillRate: 0.7,
          proposedDates: 0.7,
          shift: 0.7,
          accountManager: 0.5,
          accountCoordinator: 0.5,
        };
      }

      const validated = await validateExtractedPeople(extracted);
      // const smartDefaults = await getSmartDefaults(contract?.facility_name || '');

      console.log('[Extension Extract] Comparison:', {
        contract: {
          am_name: contract?.am_name,
          ac_name: contract?.ac_name,
          am_ac: contract?.am_ac
        },
        extracted: {
          accountManager: validated.accountManager,
          accountCoordinator: validated.accountCoordinator
        },
        confidence: validated._confidence,
        validated: validated._validated
      });

      setExtensionExtract(validated);
      setExtractionConfidence(validated._confidence || {});

      const billRate = extracted.currentBillRate || extracted.billRate || extracted.rate || '';
      const proposedDates = extracted.proposedDates || extracted.extensionDates || '';

      const finalProposedDates = (
        extracted.proposedStartDate &&
        extracted.proposedEndDate &&
        !extracted.proposedStartDate.includes('[') &&
        !extracted.proposedEndDate.includes('[')
      )
        ? `${extracted.proposedStartDate} - ${extracted.proposedEndDate}`
        : proposedDates;

      const startDate = extracted.proposedStartDate
        ? parseDateString(extracted.proposedStartDate)
        : null;

      const endDate = extracted.proposedEndDate
        ? parseDateString(extracted.proposedEndDate)
        : null;

      setExtensionForm(prev => ({
        ...prev,
        unit: extracted.specialty || prev.unit,
        currentBillRate: billRate === '[RATE]' ? '' : billRate,
        currentShiftHours: extracted.currentShift || extracted.shift || prev.currentShiftHours,
        currentEndDate: prev.currentEndDate,
        proposedDates: finalProposedDates === '[PROPOSED DATES]' ? '' : finalProposedDates,
        proposedStartDate: startDate,
        proposedEndDate: endDate,
        timeOffBetween: prev.timeOffBetween || 'None',
        timeOffDuring: (extracted.timeOffDates && extracted.timeOffDates.length > 0)
          ? extracted.timeOffDates.join(', ')
          : (extracted.rto || extracted.timeOff || 'None'),
        localStatus: prev.localStatus || 'N',
        managerDiscussion: prev.managerDiscussion || 'Yes',
        additionalDetails: prev.additionalDetails || 'N/A',
      }));

      const missingFields = [];
      const lowConfidenceFields = [];

      if (!billRate || billRate === '[RATE]') missingFields.push('Bill Rate');
      if (!finalProposedDates || finalProposedDates === '[PROPOSED DATES]') missingFields.push('Proposed Dates');

      if (validated._confidence) {
        Object.entries(validated._confidence).forEach(([field, confidence]) => {
          if (confidence < 0.7) {
            lowConfidenceFields.push(field);
          }
        });
      }

      if (validated._validated?.accountManager === false) {
        showToast?.('⚠️ Account Manager name not found in database - please verify', 'info');
      }
      if (validated._validated?.accountCoordinator === false) {
        showToast?.('⚠️ Account Coordinator name not found in database - please verify', 'info');
      }

      if (missingFields.length > 0) {
        showToast?.(`Extension data extracted. Please manually enter: ${missingFields.join(', ')}`, 'info');
      } else if (lowConfidenceFields.length > 0) {
        showToast?.(`Extension data extracted. Please verify fields marked with ⚠️`, 'info');
      } else {
        showToast?.('Extension data extracted successfully', 'success');
      }

      if (contract?.id) {
        await logExtractionAudit(
          String(contract.id),
          validated,
          extensionForm
        );
      }
    } catch (error: any) {
      console.error('[Extension Extract] Error:', error);
      showToast?.(error.message || 'Extraction failed', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveEmailEdits = () => {
    setIsEditingEmail(false);
    showToast?.('Email addresses updated', 'success');
  };

  const handleCancelEmailEdits = () => {
    setEditedTo(email.to);
    setEditedCc(email.cc || '');
    setIsEditingEmail(false);
  };

  if (!contract) return null;

  return (
    <EmailModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Assignment Email"
      subtitle={`${contract.candidate_name} • ${contract.facility_name}`}
      maxWidth="6xl"
      busy={isExtracting}
      headerActions={
        contract.nova_url && (
          <a
            href={contract.nova_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-all text-[11px] font-semibold text-slate-700 flex items-center gap-1.5"
          >
            <ExternalLink size={14} />
            View in Nova
          </a>
        )
      }
      rightPanel={
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Contract Context */}
          <section>
            <h3 className={`${DESIGN.text.label} mb-4`}>
              Contract Details
            </h3>

            <div className="space-y-3">
              {/* Candidate Card */}
              <div className={`${DESIGN.elevation.card} ${DESIGN.radius.md} p-4 bg-${DESIGN.colors.bgCard}`}>
                <div className={`${DESIGN.text.caption} mb-2`}>Candidate</div>
                <div className={`${DESIGN.text.value} mb-1`}>
                  {contract.candidate_name}
                </div>
                <div className={`${DESIGN.text.caption}`}>
                  {contract.specialty}
                </div>
              </div>

              {/* Facility Card */}
              <div className={`${DESIGN.elevation.card} ${DESIGN.radius.md} p-4 bg-${DESIGN.colors.bgCard}`}>
                <div className={`${DESIGN.text.caption} mb-2`}>Facility</div>
                <div className={`${DESIGN.text.value}`}>
                  {contract.facility_name}
                </div>
              </div>

              {/* End Date Card */}
              <div className={`${DESIGN.elevation.card} ${DESIGN.radius.md} p-4 bg-${DESIGN.colors.bgCard}`}>
                <div className={`${DESIGN.text.caption} mb-2`}>Contract End</div>
                <div className={`${DESIGN.text.value}`}>
                  {formatEndDate(contract.end_date)}
                </div>
              </div>

              {/* Quick Action - Phone */}
              {contract.phone && (
                <button
                  onClick={() => handleCopy(contract.phone!, 'Phone')}
                  className={`w-full py-3 ${DESIGN.text.label} ${DESIGN.colors.primary} hover:text-white bg-${DESIGN.colors.bgCard} hover:bg-${DESIGN.colors.primary} border border-${DESIGN.colors.border} ${DESIGN.radius.md} ${DESIGN.transition} flex items-center justify-center gap-2`}
                >
                  {copiedSection === 'Phone' ? (
                    <>
                      <Check size={14} className="text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Phone size={14} />
                      Copy Phone
                    </>
                  )}
                </button>
              )}
            </div>
          </section>

          {/* Extension Data Upload */}
          {
            templateType === 'extension_request' && (
              <section>
                <h3 className={`${DESIGN.text.label} mb-3`}>
                  Extract Extension Data
                </h3>
                <label
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      const evt = { target: { files: [file] } } as any;
                      handleExtensionFile(evt);
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed ${DESIGN.radius.md} p-6 cursor-pointer ${DESIGN.transition} ${dragActive
                    ? `border-${DESIGN.colors.primary} bg-${DESIGN.colors.bgSubtle}`
                    : `border-${DESIGN.colors.border} hover:border-${DESIGN.colors.tertiary}`
                    }`}
                >
                  <div className={`p-3 bg-${DESIGN.colors.bgSubtle} ${DESIGN.radius.md}`}>
                    {isExtracting ? (
                      <Loader2 size={18} className={`animate-spin text-${DESIGN.colors.secondary}`} />
                    ) : (
                      <Upload size={18} className={`text-${DESIGN.colors.secondary}`} />
                    )}
                  </div>
                  <div className="text-center">
                    <span className={`${DESIGN.text.value} block mb-1`}>
                      {isExtracting ? 'Extracting data...' : 'Drop screenshot here'}
                    </span>
                    <span className={DESIGN.text.caption}>
                      PNG or JPG format
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={handleExtensionFile}
                  />
                </label>
              </section>
            )
          }
        </div >
      }
      footer={
        < div className="flex items-center justify-between px-6 py-4 border-t border-slate-200" >
          <button
            onClick={() => handleCopy(email.body, 'body')}
            className={`px-4 py-2.5 ${DESIGN.text.label} ${DESIGN.radius.md} border border-${DESIGN.colors.border} hover:bg-${DESIGN.colors.bgSubtle} ${DESIGN.transition} flex items-center gap-2`}
          >
            {copiedSection === 'body' ? (
              <>
                <Check size={14} className="text-emerald-600" />
                <span className="text-emerald-600">Copied</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy Body
              </>
            )}
          </button>

          <button
            onClick={openOutlookWeb}
            disabled={!email.to || email.to.includes('[')}
            className={`px-6 py-3 text-[13px] font-semibold ${DESIGN.radius.md} ${DESIGN.transition} flex items-center gap-2 ${!email.to || email.to.includes('[')
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : `bg-${DESIGN.colors.primary} text-white hover:bg-slate-800 ${DESIGN.elevation.float}`
              }`}
          >
            <Send size={16} />
            Open in Outlook
          </button>
        </div >
      }
    >
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto">
            {TEMPLATE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setTemplateType(tab.key)}
                  className={`px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${templateType === tab.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {templateType === 'extension_request' && (
          <div className="bg-slate-50/30 border-b border-slate-100 max-h-[280px] overflow-y-auto flex-shrink-0">
            <div className="px-8 py-6">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">
                Extension Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1.5">Local</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setExtensionForm(prev => ({ ...prev, localStatus: prev.localStatus === 'Y' ? 'N' : 'Y' }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${extensionForm.localStatus === 'Y' ? 'bg-slate-900' : 'bg-slate-300'
                        }`}
                      role="switch"
                      aria-checked={extensionForm.localStatus === 'Y'}
                    >
                      <span className="sr-only">Local</span>
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${extensionForm.localStatus === 'Y' ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                    <span className="text-[12px] font-medium text-slate-700">
                      {extensionForm.localStatus === 'Y' ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    Unit
                    {extractionConfidence.specialty && extractionConfidence.specialty < 0.7 && (
                      <span className="text-yellow-500" title="Low confidence - please verify">⚠️</span>
                    )}
                  </label>
                  <input
                    value={extensionForm.unit}
                    onChange={(e) => setExtensionForm(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full px-3 py-2 text-[12px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    placeholder="e.g., ICU"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    Current Bill Rate
                    {extractionConfidence.currentBillRate && extractionConfidence.currentBillRate < 0.7 && (
                      <span className="text-yellow-500" title="Low confidence - please verify">⚠️</span>
                    )}
                  </label>
                  <input
                    value={extensionForm.currentBillRate}
                    onChange={(e) => setExtensionForm(prev => ({ ...prev, currentBillRate: e.target.value }))}
                    className={`w-full px-3 py-2 text-[12px] bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 ${extractionConfidence.currentBillRate && extractionConfidence.currentBillRate < 0.7
                      ? 'border-yellow-400'
                      : 'border-slate-200'
                      }`}
                    placeholder="e.g., $65/hr"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    Shift/Hours
                    {extractionConfidence.shift && extractionConfidence.shift < 0.7 && (
                      <span className="text-yellow-500" title="Low confidence - please verify">⚠️</span>
                    )}
                  </label>
                  <input
                    value={extensionForm.currentShiftHours}
                    onChange={(e) => setExtensionForm(prev => ({ ...prev, currentShiftHours: e.target.value }))}
                    className={`w-full px-3 py-2 text-[12px] bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 ${extractionConfidence.shift && extractionConfidence.shift < 0.7
                      ? 'border-yellow-400'
                      : 'border-slate-200'
                      }`}
                    placeholder="e.g., 3x12 Nights"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    Proposed Extension Dates
                    {extractionConfidence.proposedDates && extractionConfidence.proposedDates < 0.7 && (
                      <span className="text-yellow-500" title="Low confidence - please verify">⚠️</span>
                    )}
                  </label>
                  <input
                    value={extensionForm.proposedDates}
                    onChange={(e) => setExtensionForm(prev => ({ ...prev, proposedDates: e.target.value }))}
                    className={`w-full px-3 py-2 text-[12px] bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 ${extractionConfidence.proposedDates && extractionConfidence.proposedDates < 0.7
                      ? 'border-yellow-400'
                      : 'border-slate-200'
                      }`}
                    placeholder="e.g., March 15 - June 15, 2025"
                  />
                </div>

                {extensionForm.proposedStartDate && extensionForm.proposedEndDate && (
                  <DateConfirmationBadge
                    startDate={extensionForm.proposedStartDate}
                    endDate={extensionForm.proposedEndDate}
                  />
                )}

                {extensionForm.proposedStartDate && extensionForm.proposedEndDate && (
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={handleSaveExtensionDates}
                      disabled={isSavingExtensionDates || extensionDatesSaved}
                      className={`w-full px-4 py-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${extensionDatesSaved
                        ? 'bg-green-100 text-green-700 border-2 border-green-300 cursor-default'
                        : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                        }`}
                    >
                      {isSavingExtensionDates ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving dates...
                        </>
                      ) : extensionDatesSaved ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Extension dates saved
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Extension Dates (
                          {extensionForm.proposedStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {' - '}
                          {extensionForm.proposedEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          )
                        </>
                      )}
                    </button>
                    {extensionDatesSaved && (
                      <p className="text-xs text-green-600 mt-2 text-center">
                        Dates will be confirmed when prospect moves to Signed status
                      </p>
                    )}
                  </div>
                )}

                {/* Time Off - Simplified binary toggles */}
                <div>
                  <label className={`block ${DESIGN.text.label} mb-2`}>Time Off Between</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const isNone = extensionForm.timeOffBetween === 'None';
                        setExtensionForm(prev => ({
                          ...prev,
                          timeOffBetween: isNone ? '' : 'None'
                        }));
                      }}
                      className={`px-4 py-2 text-[12px] font-medium ${DESIGN.radius.sm} ${DESIGN.transition} ${extensionForm.timeOffBetween === 'None'
                        ? `bg-${DESIGN.colors.primary} text-white`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      None
                    </button>
                    <input
                      value={extensionForm.timeOffBetween === 'None' ? '' : extensionForm.timeOffBetween}
                      onChange={(e) => setExtensionForm(prev => ({ ...prev, timeOffBetween: e.target.value }))}
                      disabled={extensionForm.timeOffBetween === 'None'}
                      className={`flex-1 px-3 py-2 ${DESIGN.text.input} bg-white border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.borderFocus} ${DESIGN.transition} ${extensionForm.timeOffBetween === 'None' ? 'opacity-40' : ''
                        }`}
                      placeholder="Specify dates if needed"
                    />
                  </div>
                </div>

                <div>
                  <label className={`block ${DESIGN.text.label} mb-2`}>Time Off During</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const isNone = extensionForm.timeOffDuring === 'None';
                        setExtensionForm(prev => ({
                          ...prev,
                          timeOffDuring: isNone ? '' : 'None'
                        }));
                      }}
                      className={`px-4 py-2 text-[12px] font-medium ${DESIGN.radius.sm} ${DESIGN.transition} ${extensionForm.timeOffDuring === 'None'
                        ? `bg-${DESIGN.colors.primary} text-white`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      None
                    </button>
                    <input
                      value={extensionForm.timeOffDuring === 'None' ? '' : extensionForm.timeOffDuring}
                      onChange={(e) => setExtensionForm(prev => ({ ...prev, timeOffDuring: e.target.value }))}
                      disabled={extensionForm.timeOffDuring === 'None'}
                      className={`flex-1 px-3 py-2 ${DESIGN.text.input} bg-white border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.borderFocus} ${DESIGN.transition} ${extensionForm.timeOffDuring === 'None' ? 'opacity-40' : ''
                        }`}
                      placeholder="Specify dates if needed"
                    />
                  </div>
                </div>

                {/* Manager Discussion */}
                <div className="col-span-2">
                  <label className={`block ${DESIGN.text.label} mb-2`}>
                    Discussed with Manager?
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const isNo = extensionForm.managerDiscussion === 'No';
                        setExtensionForm(prev => ({
                          ...prev,
                          managerDiscussion: isNo ? 'Yes' : 'No'
                        }));
                      }}
                      className={`px-4 py-2 text-[12px] font-medium ${DESIGN.radius.sm} ${DESIGN.transition} ${extensionForm.managerDiscussion === 'No'
                        ? `bg-${DESIGN.colors.primary} text-white`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      No
                    </button>
                    <input
                      value={extensionForm.managerDiscussion === 'No' ? '' : (extensionForm.managerDiscussion === 'Yes' ? '' : extensionForm.managerDiscussion)}
                      onChange={(e) => setExtensionForm(prev => ({ ...prev, managerDiscussion: e.target.value }))}
                      disabled={extensionForm.managerDiscussion === 'No'}
                      className={`flex-1 px-3 py-2 ${DESIGN.text.input} bg-white border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.borderFocus} ${DESIGN.transition} ${extensionForm.managerDiscussion === 'No' ? 'opacity-40' : ''
                        }`}
                      placeholder={extensionForm.managerDiscussion === 'Yes' ? "Manager's name" : ""}
                    />
                  </div>
                </div>

                {/* Additional Details */}
                <div className="col-span-2">
                  <label className={`block ${DESIGN.text.label} mb-2`}>
                    Additional Details
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const isNA = extensionForm.additionalDetails === 'N/A';
                        setExtensionForm(prev => ({
                          ...prev,
                          additionalDetails: isNA ? '' : 'N/A'
                        }));
                      }}
                      className={`px-4 py-2 text-[12px] font-medium ${DESIGN.radius.sm} ${DESIGN.transition} ${extensionForm.additionalDetails === 'N/A'
                        ? `bg-${DESIGN.colors.primary} text-white`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      N/A
                    </button>
                    <textarea
                      value={extensionForm.additionalDetails === 'N/A' ? '' : extensionForm.additionalDetails}
                      onChange={(e) => setExtensionForm(prev => ({ ...prev, additionalDetails: e.target.value }))}
                      disabled={extensionForm.additionalDetails === 'N/A'}
                      rows={2}
                      className={`flex-1 px-3 py-2 ${DESIGN.text.input} bg-white border border-${DESIGN.colors.border} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.borderFocus} ${DESIGN.transition} ${extensionForm.additionalDetails === 'N/A' ? 'opacity-40' : ''
                        }`}
                      placeholder="Any special requirements or notes"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {templateType === 'margin_approval' && (
          <div className="px-8 py-6 bg-slate-50/30 border-b border-slate-100 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">
              Margin Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1.5">Margin %</label>
                <input
                  value={approvalForm.marginPercent}
                  onChange={(e) => setApprovalForm(prev => ({ ...prev, marginPercent: e.target.value }))}
                  className="w-full px-3 py-2 text-[12px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g., 18"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1.5">Reason for Approval</label>
                <textarea
                  value={approvalForm.reason}
                  onChange={(e) => setApprovalForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 text-[12px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                  rows={3}
                  placeholder="Explain why margin approval is needed"
                />
              </div>
            </div>
          </div>
        )}

        {/* Email Preview - Clear hierarchy and purpose */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              <div className="space-y-5">
                {/* Email Recipients - Editable with clear affordance */}
                <div className="space-y-3">
                  {/* To Field */}
                  <div className="flex items-center gap-3">
                    <span className={`${DESIGN.text.label} w-12 flex-shrink-0`}>To</span>
                    {isEditingEmail ? (
                      <input
                        type="text"
                        value={editedTo}
                        onChange={(e) => setEditedTo(e.target.value)}
                        onBlur={handleSaveEmailEdits}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEmailEdits();
                          if (e.key === 'Escape') handleCancelEmailEdits();
                        }}
                        className={`flex-1 px-3 py-2 ${DESIGN.text.input} bg-white border border-${DESIGN.colors.borderFocus} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.borderFocus}`}
                        placeholder="email@ayahealthcare.com"
                        autoFocus
                      />
                    ) : (
                      <>
                        <span
                          onClick={() => setIsEditingEmail(true)}
                          className={`flex-1 font-mono text-[12px] text-${DESIGN.colors.secondary} cursor-pointer hover:text-${DESIGN.colors.primary} ${DESIGN.transition}`}
                        >
                          {email.to || 'Click to add recipient'}
                        </span>
                        <button
                          onClick={() => setIsEditingEmail(true)}
                          className={`p-2 ${DESIGN.radius.sm} text-${DESIGN.colors.secondary} hover:text-${DESIGN.colors.primary} hover:bg-${DESIGN.colors.bgHover} ${DESIGN.transition}`}
                          title="Edit recipients"
                          aria-label="Edit email recipients"
                        >
                          <Edit2 size={15} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* CC Field */}
                  {(email.cc || isEditingEmail) && (
                    <div className="flex items-center gap-3">
                      <span className={`${DESIGN.text.label} w-12 flex-shrink-0`}>CC</span>
                      {isEditingEmail ? (
                        <input
                          type="text"
                          value={editedCc}
                          onChange={(e) => setEditedCc(e.target.value)}
                          onBlur={handleSaveEmailEdits}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEmailEdits();
                            if (e.key === 'Escape') handleCancelEmailEdits();
                          }}
                          className={`flex-1 px-3 py-2 ${DESIGN.text.input} bg-white border border-${DESIGN.colors.borderFocus} ${DESIGN.radius.sm} focus:outline-none focus:ring-2 focus:ring-${DESIGN.colors.borderFocus}`}
                          placeholder="email@ayahealthcare.com; email2@ayahealthcare.com"
                        />
                      ) : (
                        <span
                          onClick={() => setIsEditingEmail(true)}
                          className={`flex-1 font-mono text-[12px] text-${DESIGN.colors.secondary} cursor-pointer hover:text-${DESIGN.colors.primary} ${DESIGN.transition}`}
                        >
                          {email.cc || 'Click to add CC'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-200"></div>

                {/* Subject Line */}
                <div>
                  <label className={`block ${DESIGN.text.label} mb-2`}>
                    Subject
                  </label>
                  <div className={`w-full px-4 py-3 ${DESIGN.text.value} bg-${DESIGN.colors.bgSubtle} border border-${DESIGN.colors.border} ${DESIGN.radius.md}`}>
                    {email.subject}
                  </div>
                </div>

                {/* Message Body */}
                <div>
                  <label className={`block ${DESIGN.text.label} mb-2`}>
                    Message
                  </label>
                  <div className={`relative w-full bg-${DESIGN.colors.bgSubtle} border border-${DESIGN.colors.border} ${DESIGN.radius.md}`}>
                    <pre className={`p-4 ${DESIGN.text.body} whitespace-pre-wrap font-sans overflow-y-auto max-h-[400px]`}>
                      {email.body}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </EmailModalShell >
  );
}

export { AssignmentEmailModal };