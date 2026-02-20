/**
 * ════════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER — Configuration
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for all configuration values.
 * Change settings here, not scattered across files.
 *
 * @module lib/config
 * @version 1.0.0
 */

import { 
    AppConfig, 
    IntentConfig, 
    Intent, 
    TemplateType,
    ChatMode 
} from '../types/index';

// ════════════════════════════════════════════════════════════════════════════════
// Application Configuration
// ════════════════════════════════════════════════════════════════════════════════

export const CONFIG: AppConfig = {
    signature: {
        name: 'Kofi Farkye',
        title: 'Senior Recruiter, Fulfillment Specialist',
        phone: '858-529-7267',
        extension: '17017',
        assistant: {
            name: 'Tiffany Chavez',
            email: 'Tiffany.Chavez@ayahealthcare.com',
        },
    },
    teamEmails: {
        licensing: 'LicensingAllied@ayahealthcare.com',
        reassignments: 'reassignments@ayahealthcare.com',
    },
    defaults: {
        hoursPerWeek: '36',
        greeting: 'there',
        cc: 'Tiffany.Chavez@ayahealthcare.com',
    },
    nova: {
        baseUrl: 'https://nova.ayahealthcare.com',
        candidatePath: '/#/recruiting/candidates',
        profileSuffix: '/new-profile/about',
    },
};

// ════════════════════════════════════════════════════════════════════════════════
// Intent Routing Configuration (Declarative)
// ════════════════════════════════════════════════════════════════════════════════

export const INTENT_CONFIG: Record<string, IntentConfig> = {
    [Intent.DRAFT_OUTREACH]: {
        intent: Intent.DRAFT_OUTREACH,
        templateType: TemplateType.PAY_PACKAGE,
        handler: 'email',
        requiresExtraction: true,
        requiresTools: false,
    },
    [Intent.DRAFT_EMAIL]: {
        intent: Intent.DRAFT_EMAIL,
        templateType: null, // Determined at runtime
        handler: 'email',
        requiresExtraction: false,
        requiresTools: false,
    },
    [Intent.OFFER_DETAILS]: {
        intent: Intent.OFFER_DETAILS,
        templateType: TemplateType.OFFER_DETAILS,
        handler: 'email',
        requiresExtraction: true,
        requiresTools: false,
    },
    [Intent.LICENSING_REQUEST]: {
        intent: Intent.LICENSING_REQUEST,
        templateType: TemplateType.LICENSING,
        handler: 'email',
        requiresExtraction: false,
        requiresTools: false,
    },
    [Intent.REASSIGNMENT_REQUEST]: {
        intent: Intent.REASSIGNMENT_REQUEST,
        templateType: TemplateType.REASSIGNMENT,
        handler: 'email',
        requiresExtraction: false,
        requiresTools: true,
    },
    [Intent.DATABASE_ACTION]: {
        intent: Intent.DATABASE_ACTION,
        templateType: null,
        handler: 'tools',
        requiresExtraction: false,
        requiresTools: true,
    },
    [Intent.PIPELINE_QUERY]: {
        intent: Intent.PIPELINE_QUERY,
        templateType: null,
        handler: 'tools',
        requiresExtraction: false,
        requiresTools: true,
    },
    [Intent.CAMPAIGN_WORKFLOW]: {
        intent: Intent.CAMPAIGN_WORKFLOW,
        templateType: null,
        handler: 'chat',
        requiresExtraction: false,
        requiresTools: true,
    },
    [Intent.EDIT_CONTENT]: {
        intent: Intent.EDIT_CONTENT,
        templateType: null,
        handler: 'chat',
        requiresExtraction: false,
        requiresTools: false,
    },
    [Intent.SEARCH_QUERY]: {
        intent: Intent.SEARCH_QUERY,
        templateType: null,
        handler: 'chat',
        requiresExtraction: false,
        requiresTools: false,
    },
    [Intent.GENERAL_CHAT]: {
        intent: Intent.GENERAL_CHAT,
        templateType: null,
        handler: 'chat',
        requiresExtraction: false,
        requiresTools: false,
    },
    [Intent.UNKNOWN]: {
        intent: Intent.UNKNOWN,
        templateType: null,
        handler: 'chat',
        requiresExtraction: false,
        requiresTools: false,
    },
};

// ════════════════════════════════════════════════════════════════════════════════
// Mode → Intent Mapping
// ════════════════════════════════════════════════════════════════════════════════

export const MODE_INTENT_MAP: Record<string, { intent: string; templateType: string | null }> = {
    [`${ChatMode.COLD_OUTREACH}:image`]: {
        intent: Intent.DRAFT_OUTREACH,
        templateType: TemplateType.PAY_PACKAGE,
    },
    [`${ChatMode.COLD_OUTREACH}:text`]: {
        intent: Intent.CAMPAIGN_WORKFLOW,
        templateType: null,
    },
    [`${ChatMode.BATCH_REASSIGN}:any`]: {
        intent: Intent.REASSIGNMENT_REQUEST,
        templateType: TemplateType.REASSIGNMENT,
    },
    [`${ChatMode.REPLY_MODE}:any`]: {
        intent: Intent.DRAFT_EMAIL,
        templateType: null,
    },
};

// ════════════════════════════════════════════════════════════════════════════════
// Mode Context → Template Type Mapping
// ════════════════════════════════════════════════════════════════════════════════

export const CONTEXT_TEMPLATE_MAP: Record<string, string> = {
    'Working Traveler': TemplateType.WORKING_TRAVELER,
    'Re-Engaged Traveler': TemplateType.REENGAGED_TRAVELER,
    'Reengaged Traveler': TemplateType.REENGAGED_TRAVELER,
    'Pay Package Email': TemplateType.PAY_PACKAGE,
    'Internal Reassignment Request': TemplateType.REASSIGNMENT,
    'Licensing Request': TemplateType.LICENSING,
    'Reply to Email': null, // Determined by content
};

// ════════════════════════════════════════════════════════════════════════════════
// Model Configuration
// ════════════════════════════════════════════════════════════════════════════════

export const MODEL_CONFIG = {
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-2.0-flash-001',
    extraction: {
        temperature: 0.1,
        maxRetries: 2,
    },
    chat: {
        temperature: 0.7,
        maxRetries: 2,
        maxSteps: 10,
    },
    safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
};

// ════════════════════════════════════════════════════════════════════════════════
// HTTP Configuration
// ════════════════════════════════════════════════════════════════════════════════

export const HTTP_CONFIG = {
    timeout: 55_000,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-trace-id',
        'Cache-Control': 'no-store',
    },
};

// ════════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get intent configuration
 */
export function getIntentConfig(intent: string): IntentConfig {
    return INTENT_CONFIG[intent] || INTENT_CONFIG[Intent.GENERAL_CHAT];
}

/**
 * Build Nova profile URL
 */
export function buildNovaUrl(novaId: string): string {
    const { baseUrl, candidatePath, profileSuffix } = CONFIG.nova;
    return `${baseUrl}${candidatePath}/${novaId}${profileSuffix}`;
}

/**
 * Build signature block
 */
export function buildSignature(): string {
    const { name, title, phone, extension, assistant } = CONFIG.signature;
    return [
        '',
        'Please include my recruiter assistant on all email communications:',
        `${assistant.name} - ${assistant.email}`,
        '',
        name,
        title,
        `P: ${phone} Ext: ${extension}`,
    ].join('\n');
}

export default CONFIG;
