/**
 * ════════════════════════════════════════════════════════════════════════════════
 * TEMPLATE CATALOG — Shared, Client-Safe Template Metadata
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * SSOT for template metadata consumed by both:
 *   - Client UI (TemplatePicker in CommandCenterV2)
 *   - Server-side registry (template-registry.ts adds build functions)
 *
 * NO server-only imports. NO build functions. Pure data.
 *
 * @module lib/template-catalog
 * @version 1.0.0
 */

// ════════════════════════════════════════════════════════════════════════════════
// Enums (mirrors types/index.ts but client-safe — no server deps)
// ════════════════════════════════════════════════════════════════════════════════

export const TemplateCatalogIntent = {
    DRAFT_OUTREACH: 'DRAFT_OUTREACH',
    DRAFT_EMAIL: 'DRAFT_EMAIL',
    OFFER_DETAILS: 'OFFER_DETAILS',
    LICENSING_REQUEST: 'LICENSING_REQUEST',
    REASSIGNMENT_REQUEST: 'REASSIGNMENT_REQUEST',
} as const;

export type CatalogIntentType = typeof TemplateCatalogIntent[keyof typeof TemplateCatalogIntent];

export const CatalogCategory = {
    OUTREACH: 'outreach',
    OPS: 'ops',
    RESPONSE: 'response',
    SNIPPET: 'snippet',
} as const;

export type CatalogCategoryValue = typeof CatalogCategory[keyof typeof CatalogCategory];

export const CatalogMessageType = {
    EMAIL: 'email',
    SMS: 'sms',
    OTHER: 'other',
} as const;

export type CatalogMessageTypeValue = typeof CatalogMessageType[keyof typeof CatalogMessageType];

// ════════════════════════════════════════════════════════════════════════════════
// Catalog Entry
// ════════════════════════════════════════════════════════════════════════════════

export interface TemplateCatalogEntry {
    /** Template ID — matches TemplateType values */
    id: string;
    /** Human-readable display name */
    name: string;
    /** Grouping category for picker UI */
    category: CatalogCategoryValue;
    /** Message channel */
    messageType: CatalogMessageTypeValue;
    /** Correct intent for server-side routing */
    intent: CatalogIntentType;
    /** If true, hidden from general picker (requires role gating) */
    internalOnly: boolean;
    /** Fields required for a complete template build */
    requiredFields: string[];
}

// ════════════════════════════════════════════════════════════════════════════════
// UI Display Categories (for TemplatePicker grouping)
// ════════════════════════════════════════════════════════════════════════════════

export const PICKER_CATEGORIES = [
    { key: CatalogCategory.OUTREACH, label: 'Outreach', filterMessageType: CatalogMessageType.EMAIL },
    { key: 'sms', label: 'Text', filterMessageType: CatalogMessageType.SMS },
    { key: CatalogCategory.OPS, label: 'Ops', filterMessageType: undefined },
    { key: CatalogCategory.RESPONSE, label: 'Response', filterMessageType: undefined },
] as const;

// ════════════════════════════════════════════════════════════════════════════════
// The Catalog
// ════════════════════════════════════════════════════════════════════════════════

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
    // ── Outreach Email ─────────────────────────────────────────────────────
    {
        id: 'pay_package',
        name: 'Pay Package',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['facility', 'location', 'startDate', 'weeklyTotal'],
    },
    {
        id: 'initial_outreach',
        name: 'Initial Outreach – Full Details',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
    },
    {
        id: 'hourly_rate_outreach',
        name: 'Hourly Rate Offer',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
    },
    {
        id: 'working_traveler',
        name: 'Working Traveler',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['facility', 'weeklyTotal'],
    },
    {
        id: 'working_traveler_interest',
        name: 'Working Traveler – Interested',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'reengaged_traveler',
        name: 'Re-Engaged Traveler',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['facility', 'weeklyTotal'],
    },
    {
        id: 'reengaged_traveler_interest',
        name: 'Re-Engaged – Interested',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'reengagement',
        name: 'Re-engagement Pitch',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
    },
    {
        id: 'extension_offer',
        name: 'Extension Opportunity',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'competitive_offer',
        name: 'Competitive Counter Offer',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'referral_request',
        name: 'Referral Request',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'specialty'],
    },
    {
        id: 'submission_with_references',
        name: 'Submission + References',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility', 'specialty'],
    },
    {
        id: 'rush_ma_full_details',
        name: 'Rush MA – Full Details',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'offer_details',
        name: 'Offer Details',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.OFFER_DETAILS,
        internalOnly: false,
        requiredFields: ['facility', 'candidateName', 'weeklyTotal'],
    },

    // ── Snippet ─────────────────────────────────────────────────────────────
    {
        id: 'pay_package_snippet',
        name: 'Pay Package Snippet',
        category: CatalogCategory.SNIPPET,
        messageType: CatalogMessageType.OTHER,
        intent: TemplateCatalogIntent.OFFER_DETAILS,
        internalOnly: false,
        requiredFields: ['facility'],
    },

    // ── Text Messages (SMS) ────────────────────────────────────────────────
    {
        id: 'text_quick_pitch',
        name: 'Quick Pitch',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.SMS,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'text_followup',
        name: 'Follow-up Check',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.SMS,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'text_urgent',
        name: 'Urgent – Fast Decision',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.SMS,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'text_last_chance',
        name: 'Last Chance',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.SMS,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'text_submitted',
        name: 'Submission Confirmation',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.SMS,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'text_offer_received',
        name: 'Offer Received',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.SMS,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },
    {
        id: 'text_submission_general',
        name: 'Submission General',
        category: CatalogCategory.OUTREACH,
        messageType: CatalogMessageType.SMS,
        intent: TemplateCatalogIntent.DRAFT_OUTREACH,
        internalOnly: false,
        requiredFields: ['candidateName', 'facility'],
    },

    // ── Ops ────────────────────────────────────────────────────────────────
    {
        id: 'doc_request',
        name: 'Document Request',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName'],
    },
    {
        id: 'reference_request',
        name: 'Reference Request',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName'],
    },
    {
        id: 'ops_documents_and_references',
        name: 'Docs & References',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName', 'specialty'],
    },
    {
        id: 'licensing',
        name: 'Licensing Request',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.LICENSING_REQUEST,
        internalOnly: true,
        requiredFields: ['specialty', 'state'],
    },
    {
        id: 'ops_licensing_info',
        name: 'Licensing Info (Ops)',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.LICENSING_REQUEST,
        internalOnly: true,
        requiredFields: ['specialty', 'state'],
    },
    {
        id: 'reassignment',
        name: 'Reassignment Request',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.REASSIGNMENT_REQUEST,
        internalOnly: true,
        requiredFields: ['candidateName', 'novaId'],
    },
    {
        id: 'ops_reassignment',
        name: 'Reassignment (Ops)',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.REASSIGNMENT_REQUEST,
        internalOnly: true,
        requiredFields: ['candidateName'],
    },
    {
        id: 'margin_approval',
        name: 'Margin Approval',
        category: CatalogCategory.OPS,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_EMAIL,
        internalOnly: true,
        requiredFields: ['candidateName', 'marginPercentage', 'reason', 'placementType', 'premiumNeeded', 'sentToComp', 'approverEmail'],
    },

    // ── Response ───────────────────────────────────────────────────────────
    {
        id: 'response_ltc_and_references',
        name: 'LTC & References',
        category: CatalogCategory.RESPONSE,
        messageType: CatalogMessageType.EMAIL,
        intent: TemplateCatalogIntent.DRAFT_EMAIL,
        internalOnly: false,
        requiredFields: ['candidateName'],
    },
];

// ════════════════════════════════════════════════════════════════════════════════
// Lookup Helpers (client-safe)
// ════════════════════════════════════════════════════════════════════════════════

const CATALOG_MAP = new Map<string, TemplateCatalogEntry>(
    TEMPLATE_CATALOG.map(t => [t.id, t])
);

/** Lookup a catalog entry by template ID. Returns undefined if not found. */
export function getCatalogEntry(id: string): TemplateCatalogEntry | undefined {
    return CATALOG_MAP.get(id);
}

/** Check if a template ID exists in the catalog. */
export function hasCatalogEntry(id: string): boolean {
    return CATALOG_MAP.has(id);
}

/** Get all public (non-internal) templates for the picker. */
export function getPublicCatalogEntries(): TemplateCatalogEntry[] {
    return TEMPLATE_CATALOG.filter(t => !t.internalOnly);
}

/** Get templates grouped by picker category. */
export function getCatalogByPickerCategory(): Record<string, TemplateCatalogEntry[]> {
    const groups: Record<string, TemplateCatalogEntry[]> = {};
    for (const entry of TEMPLATE_CATALOG) {
        // SMS templates are in 'outreach' category but displayed under 'sms' group
        const groupKey = entry.messageType === CatalogMessageType.SMS ? 'sms' : entry.category;
        (groups[groupKey] ??= []).push(entry);
    }
    return groups;
}
