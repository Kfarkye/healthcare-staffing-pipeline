/**
 * ════════════════════════════════════════════════════════════════════════════════
 * TEMPLATE REGISTRY — Server-Side Build Layer
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Pairs shared catalog metadata (SSOT from src/lib/template-catalog.ts) with
 * server-side build functions. Metadata (name, category, messageType, internalOnly,
 * requiredFields) is pulled from the catalog — only build logic lives here.
 *
 * Usage:
 *   import { getTemplate, buildFromTemplate, getTemplatesByCategory } from './template-registry';
 *
 *   const template = getTemplate(TemplateType.PAY_PACKAGE);
 *   const output = buildFromTemplate(TemplateType.PAY_PACKAGE, extractedData);
 *   const outreachTemplates = getTemplatesByCategory(TemplateCategory.OUTREACH);
 *
 * @module lib/template-registry
 * @version 2.0.0
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

import { TemplateType, MessageType } from '../types/index';
import { CONFIG } from './config';

// Shared catalog (SSOT for template metadata)
import { getCatalogEntry } from '@/lib/template-catalog';

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
// Catalog → Registry Factory
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Build a TemplateDefinition by pulling metadata from the shared catalog.
 * Only the build function and optional description are provided here.
 * Throws at module-load time if the ID is missing from the catalog —
 * this catches sync drift immediately.
 */
function fromCatalog(
    id: TemplateTypeValue,
    build: (data: Record<string, any>) => TemplateOutput,
    description?: string,
): TemplateDefinition {
    const catalog = getCatalogEntry(id);
    if (!catalog) {
        throw new Error(
            `[template-registry] Template "${id}" not found in catalog. ` +
            `Add it to src/lib/template-catalog.ts first.`,
        );
    }
    return {
        id,
        name: catalog.name,
        category: catalog.category as TemplateCategoryValue,
        messageType: catalog.messageType as MessageTypeValue,
        internalOnly: catalog.internalOnly,
        requiredFields: catalog.requiredFields,
        ...(description ? { description } : {}),
        build,
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// Data Adapters
// ════════════════════════════════════════════════════════════════════════════════

/** Safely parse a numeric value from mixed input (strings with $, %, commas, etc.) */
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
    isSms: boolean,
): (data: Record<string, any>) => TemplateOutput {
    // id doubles as frontend template id (same string values)
    const template = findFrontendTemplate(id);
    if (!template) {
        return () => ({
            to: '',
            cc: [],
            subject: '',
            body: `[Template "${id}" not found]`,
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
    fromCatalog(TemplateType.PAY_PACKAGE,             (data) => buildPayPackageEmail(data as any),          'Standard pay package outreach with full breakdown'),
    fromCatalog(TemplateType.WORKING_TRAVELER,        (data) => buildWorkingTravelerEmail(data as any),     'Quick breakdown for active travelers'),
    fromCatalog(TemplateType.REENGAGED_TRAVELER,      (data) => buildReengagedTravelerEmail(data as any),   'Reconnection email for previously engaged travelers'),
    fromCatalog(TemplateType.DOC_REQUEST,             (data) => buildDocRequestEmail(data as any),          'Request missing documents for submission'),
    fromCatalog(TemplateType.REFERENCE_REQUEST,       (data) => buildReferenceRequestEmail(data as any),    'Confirm and request candidate references'),
    fromCatalog(TemplateType.LICENSING,               (data) => buildLicensingRequestEmail(data as any),    'Internal licensing info request to team'),
    fromCatalog(TemplateType.REASSIGNMENT,            (data) => buildReassignmentRequestEmail(data as any), 'Internal candidate reassignment request'),
    fromCatalog(TemplateType.MARGIN_APPROVAL,         (data) => buildMarginApprovalEmail(data as any),      'Internal margin approval workflow'),
    fromCatalog(TemplateType.OFFER_DETAILS,           (data) => buildOfferDetailsEmail(data as any),        'Formal offer details with next steps'),

    // ── Outreach Email Templates (frontend) ─────────────────────────────────
    fromCatalog(TemplateType.INITIAL_OUTREACH,             resolveFrontendBuild(TemplateType.INITIAL_OUTREACH, false),             'Full details outreach for new candidates'),
    fromCatalog(TemplateType.HOURLY_RATE_OUTREACH,         resolveFrontendBuild(TemplateType.HOURLY_RATE_OUTREACH, false),         'Outreach emphasizing hourly rate'),
    fromCatalog(TemplateType.RUSH_MA_FULL_DETAILS,         resolveFrontendBuild(TemplateType.RUSH_MA_FULL_DETAILS, false),         'Rush University Medical Assistant with references'),
    fromCatalog(TemplateType.REENGAGEMENT,                 resolveFrontendBuild(TemplateType.REENGAGEMENT, false),                 'Re-engagement with full assignment details'),
    fromCatalog(TemplateType.WORKING_TRAVELER_INTEREST,    resolveFrontendBuild(TemplateType.WORKING_TRAVELER_INTEREST, false),    'Follow-up for working travelers who clicked interested'),
    fromCatalog(TemplateType.REENGAGED_TRAVELER_INTEREST,  resolveFrontendBuild(TemplateType.REENGAGED_TRAVELER_INTEREST, false),  'Follow-up for re-engaged travelers who clicked interested'),
    fromCatalog(TemplateType.COMPETITIVE_OFFER,            resolveFrontendBuild(TemplateType.COMPETITIVE_OFFER, false),            'Counter offer when candidate is considering other agencies'),
    fromCatalog(TemplateType.REFERRAL_REQUEST,             resolveFrontendBuild(TemplateType.REFERRAL_REQUEST, false),             'Ask candidate for referrals'),
    fromCatalog(TemplateType.SUBMISSION_WITH_REFERENCES,   resolveFrontendBuild(TemplateType.SUBMISSION_WITH_REFERENCES, false),   'Submission confirmation with reference instructions'),

    // ── Snippet Templates ───────────────────────────────────────────────────
    fromCatalog(TemplateType.PAY_PACKAGE_SNIPPET, resolveFrontendBuild(TemplateType.PAY_PACKAGE_SNIPPET, false), 'Copy-paste snippet with pay and facility details'),

    // ── SMS Templates ───────────────────────────────────────────────────────
    fromCatalog(TemplateType.TEXT_QUICK_PITCH,         resolveFrontendBuild(TemplateType.TEXT_QUICK_PITCH, true),         'Quick SMS pitch with full pay details'),
    fromCatalog(TemplateType.TEXT_FOLLOWUP,            resolveFrontendBuild(TemplateType.TEXT_FOLLOWUP, true),            'Quick follow-up check via text'),
    fromCatalog(TemplateType.TEXT_URGENT,              resolveFrontendBuild(TemplateType.TEXT_URGENT, true),              'Urgent text for time-sensitive roles'),
    fromCatalog(TemplateType.TEXT_LAST_CHANCE,         resolveFrontendBuild(TemplateType.TEXT_LAST_CHANCE, true),         'Final follow-up text before closing'),
    fromCatalog(TemplateType.TEXT_SUBMITTED,           resolveFrontendBuild(TemplateType.TEXT_SUBMITTED, true),           'Text confirming submission to facility'),
    fromCatalog(TemplateType.TEXT_OFFER_RECEIVED,      resolveFrontendBuild(TemplateType.TEXT_OFFER_RECEIVED, true),      'Text notifying candidate of offer'),
    fromCatalog(TemplateType.TEXT_SUBMISSION_GENERAL,   resolveFrontendBuild(TemplateType.TEXT_SUBMISSION_GENERAL, true),  'General submission confirmation via text'),

    // ── Ops Templates (frontend variants) ───────────────────────────────────
    fromCatalog(TemplateType.OPS_REASSIGNMENT,              resolveFrontendBuild(TemplateType.OPS_REASSIGNMENT, false),              'Ops-format reassignment request'),
    fromCatalog(TemplateType.OPS_DOCUMENTS_AND_REFERENCES,  resolveFrontendBuild(TemplateType.OPS_DOCUMENTS_AND_REFERENCES, false),  'Request docs and references with benefits info'),
    fromCatalog(TemplateType.OPS_LICENSING_INFO,            resolveFrontendBuild(TemplateType.OPS_LICENSING_INFO, false),             'Ops-format licensing information request'),

    // ── Response Templates ──────────────────────────────────────────────────
    fromCatalog(TemplateType.RESPONSE_LTC_AND_REFERENCES, resolveFrontendBuild(TemplateType.RESPONSE_LTC_AND_REFERENCES, false), 'Response template for LTC and reference follow-up'),
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
