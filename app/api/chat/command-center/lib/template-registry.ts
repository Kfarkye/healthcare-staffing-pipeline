/**
 * ════════════════════════════════════════════════════════════════════════════════
 * TEMPLATE REGISTRY — Unified Template Source of Truth
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Single registry for ALL templates across the system.
 * Backend builders (email-builder.ts) and frontend templates (outreach/templates.ts)
 * are unified here with consistent metadata and build functions.
 *
 * Usage:
 *   import { getTemplate, buildFromTemplate, getTemplatesByCategory } from './template-registry';
 *
 *   const template = getTemplate(TemplateType.PAY_PACKAGE);
 *   const output = buildFromTemplate(TemplateType.PAY_PACKAGE, extractedData);
 *   const outreachTemplates = getTemplatesByCategory(TemplateCategory.OUTREACH);
 *
 * @module lib/template-registry
 * @version 1.0.0
 */

import type {
    TemplateTypeValue,
    TemplateCategoryValue,
    MessageTypeValue,
    EmailOutput,
    SmsOutput,
    TemplateOutput,
    TemplateDefinition,
} from '../types/index';

import { TemplateType, TemplateCategory, MessageType } from '../types/index';
import { CONFIG } from './config';

// Backend builders
import {
    buildPayPackageEmail,
    buildWorkingTravelerEmail,
    buildReengagedTravelerEmail,
    buildDocRequestEmail,
    buildReferenceRequestEmail,
    buildLicensingRequestEmail,
    buildReassignmentRequestEmail,
    buildMarginApprovalEmail,
    buildOfferDetailsEmail,
} from './email-builder';

// Frontend templates
import {
    OUTREACH_EMAIL_TEMPLATES,
    OPS_EMAIL_TEMPLATES,
    RESPONSE_EMAIL_TEMPLATES,
    type ExtractedOfferData,
    type EmailTemplate,
} from '@/outreach/templates';

// ════════════════════════════════════════════════════════════════════════════════
// Data Adapters
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Safely parse a numeric value from mixed input (strings with $, %, commas, etc.)
 */
function toNumber(val: any): number {
    if (val == null) return 0;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * Convert generic data record to ExtractedOfferData for frontend template builders.
 * Maps field names from the chat extraction pipeline to the frontend template schema.
 */
function toOfferData(data: Record<string, any>): ExtractedOfferData {
    const location = data.location || '';
    const [locCity, locState] = location.includes(',')
        ? location.split(',').map((s: string) => s.trim())
        : ['', ''];

    return {
        name: data.candidateName || data.name || '',
        email: data.candidateEmail || data.email || '',
        facility: data.facility || '',
        city: data.city || locCity || '',
        state: data.state || locState || '',
        shiftType: data.shifts || data.shiftType || '',
        weeklyHours: Number(data.hoursPerWeek || data.weeklyHours || 36),
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        taxableRate: toNumber(data.hourlyRate || data.taxableRate),
        weeklyStipend: toNumber(data.stipend || data.weeklyStipend),
        grossWeeklyPay: toNumber(data.weeklyTotal || data.grossWeeklyPay),
        specialty: data.specialty || '',
        jobId: data.jobId || null,
        candidateId: data.candidateId || data.novaId || null,
        actualMargin: data.actualMargin ?? (data.marginPercentage ? toNumber(data.marginPercentage) : null),
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// Template Wrappers
// ════════════════════════════════════════════════════════════════════════════════

/** Wrap a frontend email template into a TemplateOutput-producing build function */
function wrapEmailTemplate(
    id: TemplateTypeValue,
    template: EmailTemplate,
): (data: Record<string, any>) => EmailOutput {
    return (data) => {
        const offerData = toOfferData(data);
        const result = template.generateContent(offerData);
        return {
            to: result.to || data.candidateEmail || data.email || '',
            cc: result.cc ? [result.cc] : [CONFIG.defaults.cc],
            subject: result.subject,
            body: result.body,
            missing: [],
            isComplete: true,
            templateType: id,
            messageType: MessageType.EMAIL,
        };
    };
}

/** Wrap a frontend SMS template into a SmsOutput-producing build function */
function wrapSmsTemplate(
    id: TemplateTypeValue,
    template: EmailTemplate,
): (data: Record<string, any>) => SmsOutput {
    return (data) => {
        const offerData = toOfferData(data);
        const result = template.generateContent(offerData);
        return {
            to: data.candidateEmail || data.email || data.phone || '',
            body: result.body,
            missing: [],
            isComplete: true,
            templateType: id,
            messageType: 'sms',
        };
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// Frontend Template Lookup
// ════════════════════════════════════════════════════════════════════════════════

const ALL_FRONTEND_TEMPLATES = [
    ...OUTREACH_EMAIL_TEMPLATES,
    ...OPS_EMAIL_TEMPLATES,
    ...RESPONSE_EMAIL_TEMPLATES,
];

function findFrontendTemplate(frontendId: string): EmailTemplate | undefined {
    return ALL_FRONTEND_TEMPLATES.find(t => t.id === frontendId);
}

/** Resolve a frontend template to a build function, with SMS detection */
function resolveFrontendBuild(
    id: TemplateTypeValue,
    frontendId: string,
    isSms: boolean,
): (data: Record<string, any>) => TemplateOutput {
    const template = findFrontendTemplate(frontendId);
    if (!template) {
        return () => ({
            to: '',
            cc: [],
            subject: '',
            body: `[Template "${frontendId}" not found]`,
            missing: [],
            isComplete: false,
            templateType: id,
        });
    }
    return isSms ? wrapSmsTemplate(id, template) : wrapEmailTemplate(id, template);
}

// ════════════════════════════════════════════════════════════════════════════════
// Registry Definition
// ════════════════════════════════════════════════════════════════════════════════

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
    // ── Backend Pipeline Templates ──────────────────────────────────────────
    {
        id: TemplateType.PAY_PACKAGE,
        name: 'Pay Package Email',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['facility', 'location', 'startDate', 'weeklyTotal'],
        description: 'Standard pay package outreach with full breakdown',
        build: (data) => buildPayPackageEmail(data as any),
    },
    {
        id: TemplateType.WORKING_TRAVELER,
        name: 'Working Traveler Email',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['facility', 'weeklyTotal'],
        description: 'Quick breakdown for active travelers',
        build: (data) => buildWorkingTravelerEmail(data as any),
    },
    {
        id: TemplateType.REENGAGED_TRAVELER,
        name: 'Re-Engaged Traveler Email',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['facility', 'weeklyTotal'],
        description: 'Reconnection email for previously engaged travelers',
        build: (data) => buildReengagedTravelerEmail(data as any),
    },
    {
        id: TemplateType.DOC_REQUEST,
        name: 'Document Request',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName'],
        description: 'Request missing documents for submission',
        build: (data) => buildDocRequestEmail(data as any),
    },
    {
        id: TemplateType.REFERENCE_REQUEST,
        name: 'Reference Request',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName'],
        description: 'Confirm and request candidate references',
        build: (data) => buildReferenceRequestEmail(data as any),
    },
    {
        id: TemplateType.LICENSING,
        name: 'Licensing Request',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: true,
        requiredFields: ['specialty', 'state'],
        description: 'Internal licensing info request to team',
        build: (data) => buildLicensingRequestEmail(data as any),
    },
    {
        id: TemplateType.REASSIGNMENT,
        name: 'Reassignment Request',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: true,
        requiredFields: ['candidateName', 'novaId'],
        description: 'Internal candidate reassignment request',
        build: (data) => buildReassignmentRequestEmail(data as any),
    },
    {
        id: TemplateType.MARGIN_APPROVAL,
        name: 'Margin Approval Request',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: true,
        requiredFields: ['candidateName', 'marginPercentage', 'reason', 'placementType', 'premiumNeeded', 'sentToComp', 'approverEmail'],
        description: 'Internal margin approval workflow',
        build: (data) => buildMarginApprovalEmail(data as any),
    },
    {
        id: TemplateType.OFFER_DETAILS,
        name: 'Offer Details Email',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['facility', 'candidateName', 'weeklyTotal'],
        description: 'Formal offer details with next steps',
        build: (data) => buildOfferDetailsEmail(data as any),
    },

    // ── Outreach Email Templates (frontend) ─────────────────────────────────
    {
        id: TemplateType.INITIAL_OUTREACH,
        name: 'Initial Outreach – Full Details',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
        description: 'Full details outreach for new candidates',
        build: resolveFrontendBuild(TemplateType.INITIAL_OUTREACH, 'initial_outreach', false),
    },
    {
        id: TemplateType.HOURLY_RATE_OUTREACH,
        name: 'Hourly Rate Offer',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
        description: 'Outreach emphasizing hourly rate',
        build: resolveFrontendBuild(TemplateType.HOURLY_RATE_OUTREACH, 'hourly_rate_outreach', false),
    },
    {
        id: TemplateType.RUSH_MA_FULL_DETAILS,
        name: 'Rush MA – Full Details + References',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Rush University Medical Assistant with references',
        build: resolveFrontendBuild(TemplateType.RUSH_MA_FULL_DETAILS, 'rush_ma_full_details', false),
    },
    {
        id: TemplateType.REENGAGEMENT,
        name: 'Re-engagement – Full Details Pitch',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
        description: 'Re-engagement with full assignment details',
        build: resolveFrontendBuild(TemplateType.REENGAGEMENT, 'reengagement', false),
    },
    {
        id: TemplateType.WORKING_TRAVELER_INTEREST,
        name: 'Working Traveler – Interested Click',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Follow-up for working travelers who clicked interested',
        build: resolveFrontendBuild(TemplateType.WORKING_TRAVELER_INTEREST, 'working_traveler_interest', false),
    },
    {
        id: TemplateType.REENGAGED_TRAVELER_INTEREST,
        name: 'Re-Engaged Traveler – Interested Click',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Follow-up for re-engaged travelers who clicked interested',
        build: resolveFrontendBuild(TemplateType.REENGAGED_TRAVELER_INTEREST, 'reengaged_traveler_interest', false),
    },
    {
        id: TemplateType.COMPETITIVE_OFFER,
        name: 'Competitive Counter Offer',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Counter offer when candidate is considering other agencies',
        build: resolveFrontendBuild(TemplateType.COMPETITIVE_OFFER, 'competitive_offer', false),
    },
    {
        id: TemplateType.REFERRAL_REQUEST,
        name: 'Referral Request',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'specialty'],
        description: 'Ask candidate for referrals',
        build: resolveFrontendBuild(TemplateType.REFERRAL_REQUEST, 'referral_request', false),
    },
    {
        id: TemplateType.SUBMISSION_WITH_REFERENCES,
        name: 'Assignment Submission + References',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
        description: 'Submission confirmation with reference instructions',
        build: resolveFrontendBuild(TemplateType.SUBMISSION_WITH_REFERENCES, 'submission_with_references', false),
    },

    // ── Snippet Templates ───────────────────────────────────────────────────
    {
        id: TemplateType.PAY_PACKAGE_SNIPPET,
        name: 'Pay Package & Facility Info Snippet',
        category: TemplateCategory.SNIPPET,
        messageType: MessageType.OTHER,
        internalOnly: false,
        requiredFields: ['facility'],
        description: 'Copy-paste snippet with pay and facility details',
        build: resolveFrontendBuild(TemplateType.PAY_PACKAGE_SNIPPET, 'pay_package_snippet', false),
    },

    // ── SMS Templates ───────────────────────────────────────────────────────
    {
        id: TemplateType.TEXT_QUICK_PITCH,
        name: 'Quick Pitch Text',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.SMS,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Quick SMS pitch with full pay details',
        build: resolveFrontendBuild(TemplateType.TEXT_QUICK_PITCH, 'text_quick_pitch', true),
    },
    {
        id: TemplateType.TEXT_FOLLOWUP,
        name: 'Follow-up Text',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.SMS,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Quick follow-up check via text',
        build: resolveFrontendBuild(TemplateType.TEXT_FOLLOWUP, 'text_followup', true),
    },
    {
        id: TemplateType.TEXT_URGENT,
        name: 'Urgent – Fast Decision Text',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.SMS,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Urgent text for time-sensitive roles',
        build: resolveFrontendBuild(TemplateType.TEXT_URGENT, 'text_urgent', true),
    },
    {
        id: TemplateType.TEXT_LAST_CHANCE,
        name: 'Last Chance Text',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.SMS,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Final follow-up text before closing',
        build: resolveFrontendBuild(TemplateType.TEXT_LAST_CHANCE, 'text_last_chance', true),
    },
    {
        id: TemplateType.TEXT_SUBMITTED,
        name: 'Submission Confirmation Text',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.SMS,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Text confirming submission to facility',
        build: resolveFrontendBuild(TemplateType.TEXT_SUBMITTED, 'text_submitted', true),
    },
    {
        id: TemplateType.TEXT_OFFER_RECEIVED,
        name: 'Offer Received Text',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.SMS,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'Text notifying candidate of offer',
        build: resolveFrontendBuild(TemplateType.TEXT_OFFER_RECEIVED, 'text_offer_received', true),
    },
    {
        id: TemplateType.TEXT_SUBMISSION_GENERAL,
        name: 'Assignment Submission Text',
        category: TemplateCategory.OUTREACH,
        messageType: MessageType.SMS,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
        description: 'General submission confirmation via text',
        build: resolveFrontendBuild(TemplateType.TEXT_SUBMISSION_GENERAL, 'text_submission_general', true),
    },

    // ── Ops Templates (frontend variants) ───────────────────────────────────
    {
        id: TemplateType.OPS_REASSIGNMENT,
        name: 'Reassignment Request (Ops)',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: true,
        requiredFields: ['candidateName'],
        description: 'Ops-format reassignment request',
        build: resolveFrontendBuild(TemplateType.OPS_REASSIGNMENT, 'ops_reassignment', false),
    },
    {
        id: TemplateType.OPS_DOCUMENTS_AND_REFERENCES,
        name: 'Documents & References',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'specialty'],
        description: 'Request docs and references with benefits info',
        build: resolveFrontendBuild(TemplateType.OPS_DOCUMENTS_AND_REFERENCES, 'ops_documents_and_references', false),
    },
    {
        id: TemplateType.OPS_LICENSING_INFO,
        name: 'Licensing Info Request (Ops)',
        category: TemplateCategory.OPS,
        messageType: MessageType.EMAIL,
        internalOnly: true,
        requiredFields: ['specialty', 'state'],
        description: 'Ops-format licensing information request',
        build: resolveFrontendBuild(TemplateType.OPS_LICENSING_INFO, 'ops_licensing_info', false),
    },

    // ── Response Templates ──────────────────────────────────────────────────
    {
        id: TemplateType.RESPONSE_LTC_AND_REFERENCES,
        name: 'LTC & Reference Request Response',
        category: TemplateCategory.RESPONSE,
        messageType: MessageType.EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName'],
        description: 'Response template for LTC and reference follow-up',
        build: resolveFrontendBuild(TemplateType.RESPONSE_LTC_AND_REFERENCES, 'response_ltc_and_references', false),
    },
];

// ════════════════════════════════════════════════════════════════════════════════
// Registry Index (O(1) lookups)
// ════════════════════════════════════════════════════════════════════════════════

const REGISTRY_MAP = new Map<TemplateTypeValue, TemplateDefinition>(
    TEMPLATE_REGISTRY.map(t => [t.id, t])
);

// ════════════════════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════════════════════

/** Get a template definition by ID */
export function getTemplate(id: TemplateTypeValue): TemplateDefinition | undefined {
    return REGISTRY_MAP.get(id);
}

/** Get all templates in a category */
export function getTemplatesByCategory(category: TemplateCategoryValue): TemplateDefinition[] {
    return TEMPLATE_REGISTRY.filter(t => t.category === category);
}

/** Get all templates filtered by message type */
export function getTemplatesByMessageType(messageType: MessageTypeValue): TemplateDefinition[] {
    return TEMPLATE_REGISTRY.filter(t => t.messageType === messageType);
}

/** Get all non-internal templates (for candidate-facing UI) */
export function getPublicTemplates(): TemplateDefinition[] {
    return TEMPLATE_REGISTRY.filter(t => !t.internalOnly);
}

/** Build output from a template by ID */
export function buildFromTemplate(
    id: TemplateTypeValue,
    data: Record<string, any>,
): TemplateOutput | null {
    const template = REGISTRY_MAP.get(id);
    if (!template) return null;
    return template.build(data);
}

/** Check if a template ID exists in the registry */
export function hasTemplate(id: string): boolean {
    return REGISTRY_MAP.has(id as TemplateTypeValue);
}

/** Get all template IDs */
export function getAllTemplateIds(): TemplateTypeValue[] {
    return Array.from(REGISTRY_MAP.keys());
}
