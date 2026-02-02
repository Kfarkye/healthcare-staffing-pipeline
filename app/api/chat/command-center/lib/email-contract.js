/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMAIL CONTRACT — Strict Output Schema for Email Drafts
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Prevents free-writing by enforcing deterministic template routing and structured output.
 *
 * @module app/api/chat/command-center/lib/email-contract
 * @version 1.0.0
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'reference_consent' | 'doc_request' | 'assignment_interest' | 'generic'} TemplateKey
 */

/**
 * @typedef {'open_nova' | 'await_docs' | 'await_availability' | 'move_stage' | 'send_email'} NextStepType
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Zod Schemas
// ═══════════════════════════════════════════════════════════════════════════════

export const CandidateMetaSchema = z.object({
    candidate_id: z.number().nullable(),
    nova_url: z.string().nullable(),
    name: z.string().nullable(),
});

export const EmailDraftMetaSchema = z.object({
    template_key: z.enum(['reference_consent', 'doc_request', 'assignment_interest', 'generic']),
    candidate: CandidateMetaSchema,
    requested_items: z.array(z.string()).optional(),
});

export const EmailDraftSchema = z.object({
    kind: z.literal('email_draft'),
    to_name: z.string().nullable(),
    to_email: z.string().nullable(),
    subject: z.string(),
    body: z.string(), // Plain text, CRLF-safe
    cc: z.array(z.string()), // Always include Tiffany
    mailto: z.string(), // Pre-filled mailto link
    meta: EmailDraftMetaSchema,
});

export const NextStepActionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('open_nova'),
        label: z.string(),
        href: z.string(),
    }),
    z.object({
        type: z.literal('await_docs'),
        label: z.string(),
        required: z.array(z.string()),
    }),
    z.object({
        type: z.literal('await_availability'),
        label: z.string(),
        required: z.array(z.string()),
    }),
    z.object({
        type: z.literal('move_stage'),
        label: z.string(),
        stage: z.string(),
        enabled_when: z.string().optional(),
    }),
    z.object({
        type: z.literal('send_email'),
        label: z.string(),
        href: z.string(),
    }),
]);

export const EmailResponseSchema = z.object({
    email: EmailDraftSchema,
    next_steps: z.array(NextStepActionSchema),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Template Router
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATE_PATTERNS = Object.freeze({
    reference_consent: [
        /\breference/i,
        /\b(ok|okay|yes)?\s*(to)?\s*reach\s*out\s*(to)?\s*reference/i,
        /\b(confirm|check)\s*(with)?\s*reference/i,
        /\breference\s*consent/i,
        /\breferences?\s*needed/i,
    ],
    doc_request: [
        /\b(cert|certification|certs|document|documents|docs)/i,
        /\b(bls|acls|pals|nb|rn license)/i,
        /\b(submit|submission)\b.*\b(need|require)/i,
        /\b(need|require|missing).*\b(document|cert|license)/i,
        /\b(start\s*date|interview)\b.*\b(work|confirm)/i,
    ],
    assignment_interest: [
        /\bclick(ed)?\s*interested/i,
        /\b(interested|apply|applied)\b.*\b(assignment|position|job)/i,
        /\b(new|open)\s*(assignment|position|role)/i,
        /\bpay\s*package\b/i,
        /\boutreach\s*(email)?\b/i,
    ],
});

/**
 * Router: determines template_key from user message + context.
 * Prevents model improvisation by locking to a specific template path.
 *
 * @param {string} message - User message
 * @param {Object} [context] - Additional context
 * @returns {{ template_key: TemplateKey, required_fields: string[] }}
 */
export function routeToTemplate(message, context = {}) {
    const normalized = (message ?? '').toLowerCase().trim();

    // Check reference_consent FIRST (highest specificity)
    for (const pattern of TEMPLATE_PATTERNS.reference_consent) {
        if (pattern.test(normalized)) {
            return {
                template_key: 'reference_consent',
                required_fields: ['candidate_name'],
            };
        }
    }

    // Check doc_request
    for (const pattern of TEMPLATE_PATTERNS.doc_request) {
        if (pattern.test(normalized)) {
            return {
                template_key: 'doc_request',
                required_fields: ['candidate_name', 'requested_items'],
            };
        }
    }

    // Check assignment_interest
    for (const pattern of TEMPLATE_PATTERNS.assignment_interest) {
        if (pattern.test(normalized)) {
            return {
                template_key: 'assignment_interest',
                required_fields: ['candidate_name', 'facility', 'role', 'weekly_pay'],
            };
        }
    }

    // Default to generic
    return {
        template_key: 'generic',
        required_fields: ['candidate_name'],
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Template Registry
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CC = 'Tiffany.Chavez@ayahealthcare.com';

export const TEMPLATES = Object.freeze({
    reference_consent: {
        subject: 'References Needed for Your Submission',
        body: `Hi {{candidate_name}},

I'm reaching out because the facility is ready to move forward with your submission and will need to contact your professional references.

Can you confirm the following:
- Are you okay with facilities reaching out to your references?
- Are the references on your Aya profile current and will they respond promptly?
- If you need to update or add a reference, please let me know and I'll help you get that done.

Once I have your confirmation, I can move your submission forward.

Thank you!

Please include my recruiter assistant on all email communications:
Tiffany Chavez – Tiffany.Chavez@ayahealthcare.com

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017`,
    },

    doc_request: {
        subject: 'Documents Needed for Submission - {{facility_name}}',
        body: `Hi {{candidate_name}},

Great news! I'm working on getting you submitted for this assignment. To keep things moving, I need a few items from you:

{{#if requested_items}}
{{#each requested_items}}
- {{this}}
{{/each}}
{{else}}
- Current resume (updated within last 6 months)
- BLS card (AHA preferred — send what you have and we'll confirm facility requirement)
- Skills checklist
{{/if}}

Also, please send your best interview times this week (include your time zone).

Once I have these, I can get your file submitted.

Thank you!

Please include my recruiter assistant on all email communications:
Tiffany Chavez – Tiffany.Chavez@ayahealthcare.com

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017`,
    },

    assignment_interest: {
        subject: '{{role}} - {{facility_name}} | {{weekly_pay}}/week',
        body: `Hi {{candidate_name}},

I came across your profile and thought you'd be a strong fit for this {{role}} opening at {{facility_name}}.

Facility: {{facility_name}}
Location: {{location}}
Assignment Dates: {{start_date}} - {{end_date}}
Shifts: {{shifts}}

Pay Package:
- Taxable Hourly Rate: {{hourly_rate}}
- Meals & Housing Stipend: {{stipend}}
- Total Gross Weekly Pay: {{weekly_pay}}

To move forward, confirm:
- Available to start {{start_date}}?
- Any time-off during the assignment?
- Is your Aya profile current?

Reply with the 3 confirmations above and I will move the submission forward.

Please include my recruiter assistant on all email communications:
Tiffany Chavez – Tiffany.Chavez@ayahealthcare.com

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017`,
    },

    generic: {
        subject: 'Follow-up from Aya Healthcare',
        body: `Hi {{candidate_name}},

{{body_content}}

Please include my recruiter assistant on all email communications:
Tiffany Chavez – Tiffany.Chavez@ayahealthcare.com

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017`,
    },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Email Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Replace template variables with actual values.
 * @param {string} template
 * @param {Record<string, string | null | undefined>} vars
 * @returns {string}
 */
function renderTemplate(template, vars) {
    let result = template;

    // Handle conditionals: {{#if key}}...{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
        const val = vars[key];
        if (val && (Array.isArray(val) ? val.length > 0 : true)) {
            return content;
        }
        return '';
    });

    // Handle each loops: {{#each key}}...{{/each}}
    result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, content) => {
        const arr = vars[key];
        if (!Array.isArray(arr)) return '';
        return arr.map((item) => content.replace(/\{\{this\}\}/g, String(item))).join('\n');
    });

    // Handle simple variables: {{key}}
    result = result.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const val = vars[key];
        if (val === undefined || val === null || val === '') return `[[MISSING:${key}]]`;
        return String(val);
    });

    return result;
}

/**
 * Build a mailto link from email components.
 * @param {Object} email
 * @param {string|null} email.to_email
 * @param {string} email.subject
 * @param {string} email.body
 * @param {string[]} email.cc
 * @returns {string}
 */
function buildMailtoLink(email) {
    const to = email.to_email || '';
    const subject = encodeURIComponent(email.subject);
    // Normalize line breaks to CRLF for Outlook compatibility
    const body = encodeURIComponent(email.body.replace(/\r?\n/g, '\r\n'));
    const cc = email.cc.length ? `&cc=${encodeURIComponent(email.cc.join(','))}` : '';

    return `mailto:${to}?subject=${subject}${cc}&body=${body}`;
}

/**
 * Build a structured EmailDraft from template + variables + candidate lookup result.
 *
 * @param {Object} params
 * @param {TemplateKey} params.template_key
 * @param {Record<string, any>} params.vars
 * @param {Object|null} params.candidate - Lookup result from DB
 * @param {string[]} [params.requested_items]
 * @returns {z.infer<typeof EmailDraftSchema>}
 */
export function buildEmailDraft({ template_key, vars, candidate, requested_items = [] }) {
    const template = TEMPLATES[template_key] || TEMPLATES.generic;

    // Merge candidate data into vars
    const mergedVars = {
        ...vars,
        candidate_name: candidate?.name ?? vars.candidate_name ?? 'there',
        requested_items,
    };

    const subject = renderTemplate(template.subject, mergedVars);
    const body = renderTemplate(template.body, mergedVars);

    const email = {
        kind: /** @type {const} */ ('email_draft'),
        to_name: candidate?.name ?? vars.candidate_name ?? null,
        to_email: candidate?.email ?? vars.candidate_email ?? null,
        subject,
        body,
        cc: [DEFAULT_CC],
        mailto: '', // Will be set below
        meta: {
            template_key,
            candidate: {
                candidate_id: candidate?.candidate_id ?? null,
                nova_url: candidate?.nova_url ?? null,
                name: candidate?.name ?? vars.candidate_name ?? null,
            },
            requested_items: requested_items.length ? requested_items : undefined,
        },
    };

    email.mailto = buildMailtoLink(email);

    return email;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: NextSteps Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build next steps based on context and candidate data.
 *
 * @param {Object} params
 * @param {z.infer<typeof EmailDraftSchema>} params.email
 * @param {TemplateKey} params.template_key
 * @returns {z.infer<typeof NextStepActionSchema>[]}
 */
export function buildNextSteps({ email, template_key }) {
    const steps = [];

    // 1. Open in Nova (only if we have a nova_url)
    if (email.meta.candidate.nova_url) {
        steps.push({
            type: /** @type {const} */ ('open_nova'),
            label: 'Open in Nova',
            href: email.meta.candidate.nova_url,
        });
    }

    // 2. Send Email (always)
    steps.push({
        type: /** @type {const} */ ('send_email'),
        label: 'Open in Outlook',
        href: email.mailto,
    });

    // 3. Template-specific next steps
    if (template_key === 'reference_consent') {
        steps.push({
            type: /** @type {const} */ ('await_docs'),
            label: 'Waiting on reference confirmation',
            required: ['reference consent'],
        });
    }

    if (template_key === 'doc_request') {
        const items = email.meta.requested_items || ['documents'];
        steps.push({
            type: /** @type {const} */ ('await_docs'),
            label: 'Waiting on documents',
            required: items,
        });
        steps.push({
            type: /** @type {const} */ ('await_availability'),
            label: 'Waiting on interview availability',
            required: ['interview times'],
        });
    }

    if (template_key === 'assignment_interest') {
        steps.push({
            type: /** @type {const} */ ('await_docs'),
            label: 'Waiting on confirmations',
            required: ['availability', 'time-off', 'profile status'],
        });
    }

    // 4. Move Stage (only if we have candidate_id)
    if (email.meta.candidate.candidate_id) {
        steps.push({
            type: /** @type {const} */ ('move_stage'),
            label: 'Move to Submitted',
            stage: 'Submitted',
            enabled_when: 'docs_received',
        });
    }

    return steps;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Full Response Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a complete email response with email + next_steps.
 *
 * @param {Object} params
 * @param {string} params.message - User message for template routing
 * @param {Record<string, any>} params.vars - Template variables
 * @param {Object|null} params.candidate - Candidate lookup result
 * @param {string[]} [params.requested_items]
 * @returns {z.infer<typeof EmailResponseSchema>}
 */
export function buildEmailResponse({ message, vars, candidate, requested_items = [] }) {
    const { template_key } = routeToTemplate(message);

    const email = buildEmailDraft({
        template_key,
        vars,
        candidate,
        requested_items,
    });

    const next_steps = buildNextSteps({ email, template_key });

    return { email, next_steps };
}

export default {
    EmailDraftSchema,
    NextStepActionSchema,
    EmailResponseSchema,
    routeToTemplate,
    buildEmailDraft,
    buildNextSteps,
    buildEmailResponse,
    TEMPLATES,
};
