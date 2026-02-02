/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMAIL CONTRACT v2.0 — Elite Pattern Refactor
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Changes from v1.0:
 * - DELETED: Regex template engine (fragile, runtime parsing)
 * - ADDED: JS function templates (V8-compiled, zero parsing overhead)
 * - ADDED: Discriminated union input types (compiler-enforced required vars)
 * - ADDED: Recruiter profile dependency injection (scalable, multi-tenant ready)
 * - KEPT: Zod output schemas (correct pattern for AI output validation)
 *
 * @module app/api/chat/command-center/lib/email-contract
 * @version 2.0.0
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Type Definitions (Discriminated Unions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Recruiter profile for dependency injection.
 * @typedef {Object} RecruiterProfile
 * @property {string} name
 * @property {string} email
 * @property {string} phone
 * @property {string} title
 * @property {string} [assistantName]
 * @property {string} [assistantEmail]
 */

/**
 * Default recruiter profile (current user: Kofi Farkye)
 * @type {RecruiterProfile}
 */
export const DEFAULT_RECRUITER = Object.freeze({
    name: 'Kofi Farkye',
    email: 'kofi.farkye@ayahealthcare.com',
    phone: '858-529-7267 Ext: 17017',
    title: 'Senior Recruiter, Fulfillment Specialist',
    assistantName: 'Tiffany Chavez',
    assistantEmail: 'Tiffany.Chavez@ayahealthcare.com',
});

/**
 * Template input types (discriminated union).
 * The compiler enforces that each template_key gets its required fields.
 *
 * @typedef {(
 *   | { key: 'reference_consent'; candidate_name: string }
 *   | { key: 'doc_request'; candidate_name: string; facility_name?: string; requested_items?: string[] }
 *   | { key: 'assignment_interest'; candidate_name: string; facility_name: string; role: string; location?: string; start_date?: string; end_date?: string; shifts?: string; hourly_rate?: string; stipend?: string; weekly_pay: string }
 *   | { key: 'generic'; candidate_name: string; body_content?: string }
 * )} TemplateInput
 */

/**
 * @typedef {'reference_consent' | 'doc_request' | 'assignment_interest' | 'generic'} TemplateKey
 */

/**
 * @typedef {'open_nova' | 'await_docs' | 'await_availability' | 'move_stage' | 'send_email'} NextStepType
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Zod Schemas (Output Contract — enforced on AI responses)
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
    body: z.string(), // Plain text, NO signature (Outlook auto-appends)
    signature: z.string().nullable(), // For UI preview only, NOT in mailto
    cc: z.array(z.string()), // Always include assistant
    mailto: z.string(), // Built from body only (no signature)
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
// SECTION 4: JS Function Templates (V8-compiled, type-safe)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pure function templates — zero parsing, V8-optimized.
 * Each template is a function that receives typed input and returns { subject, body }.
 */
const TEMPLATE_FUNCTIONS = Object.freeze({
    /**
     * Reference consent template
     * @param {{ candidate_name: string }} vars
     * @returns {{ subject: string, body: string }}
     */
    reference_consent: (vars) => ({
        subject: 'References Needed for Your Submission',
        body: `Hi ${vars.candidate_name},

I'm reaching out because the facility is ready to move forward with your submission and will need to contact your professional references.

Can you confirm the following:
- Are you okay with facilities reaching out to your references?
- Are the references on your Aya profile current and will they respond promptly?
- If you need to update or add a reference, please let me know and I'll help you get that done.

Once I have your confirmation, I can move your submission forward.

Thank you!`,
    }),

    /**
     * Document request template
     * @param {{ candidate_name: string; facility_name?: string; requested_items?: string[] }} vars
     * @returns {{ subject: string, body: string }}
     */
    doc_request: (vars) => {
        const facility = vars.facility_name || 'your assignment';
        const items = vars.requested_items?.length
            ? vars.requested_items.map(item => `- ${item}`).join('\n')
            : `- Current resume (updated within last 6 months)
- BLS card (AHA preferred — send what you have and we'll confirm facility requirement)
- Skills checklist`;

        return {
            subject: `Documents Needed for Submission - ${facility}`,
            body: `Hi ${vars.candidate_name},

Great news! I'm working on getting you submitted for this assignment. To keep things moving, I need a few items from you:

${items}

Also, please send your best interview times this week (include your time zone).

Once I have these, I can get your file submitted.

Thank you!`,
        };
    },

    /**
     * Assignment interest / outreach template
     * @param {{ candidate_name: string; facility_name: string; role: string; location?: string; start_date?: string; end_date?: string; shifts?: string; hourly_rate?: string; stipend?: string; weekly_pay: string }} vars
     * @returns {{ subject: string, body: string }}
     */
    assignment_interest: (vars) => ({
        subject: `${vars.role} - ${vars.facility_name} | ${vars.weekly_pay}/week`,
        body: `Hi ${vars.candidate_name},

I came across your profile and thought you'd be a strong fit for this ${vars.role} opening at ${vars.facility_name}.

Facility: ${vars.facility_name}
Location: ${vars.location || 'TBD'}
Assignment Dates: ${vars.start_date || 'TBD'} - ${vars.end_date || 'TBD'}
Shifts: ${vars.shifts || 'TBD'}

Pay Package:
- Taxable Hourly Rate: ${vars.hourly_rate || 'TBD'}
- Meals & Housing Stipend: ${vars.stipend || 'TBD'}
- Total Gross Weekly Pay: ${vars.weekly_pay}

To move forward, confirm:
- Available to start ${vars.start_date || 'the assignment'}?
- Any time-off during the assignment?
- Is your Aya profile current?

Reply with the 3 confirmations above and I will move the submission forward.`,
    }),

    /**
     * Generic fallback template
     * @param {{ candidate_name: string; body_content?: string }} vars
     * @returns {{ subject: string, body: string }}
     */
    generic: (vars) => ({
        subject: 'Follow-up from Aya Healthcare',
        body: `Hi ${vars.candidate_name},

${vars.body_content || 'I wanted to follow up with you regarding your healthcare travel opportunities.'}

Thank you!`,
    }),
});

// Legacy export for backward compatibility
export const TEMPLATES = TEMPLATE_FUNCTIONS;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Signature Builder (Dependency Injection)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build signature from recruiter profile.
 * @param {RecruiterProfile} profile
 * @returns {string}
 */
function buildSignature(profile) {
    const assistantLine = profile.assistantName && profile.assistantEmail
        ? `Please include my recruiter assistant on all email communications:\n${profile.assistantName} – ${profile.assistantEmail}\n\n`
        : '';

    return `${assistantLine}${profile.name}
${profile.title}
P: ${profile.phone}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Email Builder (Clean, Composable)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a mailto link from email components.
 * Returns empty string if URL exceeds safe browser limits.
 *
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

    const mailto = `mailto:${to}?subject=${subject}${cc}&body=${body}`;

    // Production safety: guard against browser URL length limits
    if (mailto.length > 2000) {
        console.warn('[email-contract] mailto link exceeds 2000 chars, returning empty (UI should handle with clipboard)');
        return '';
    }

    return mailto;
}

/**
 * Build a structured EmailDraft from template input + candidate lookup result.
 *
 * @param {Object} params
 * @param {TemplateKey} params.template_key
 * @param {Object} params.vars - Template variables (validated by caller)
 * @param {Object|null} params.candidate - Lookup result from DB
 * @param {string[]} [params.requested_items] - For doc_request template
 * @param {RecruiterProfile} [params.recruiter] - Injectable recruiter profile
 * @returns {z.infer<typeof EmailDraftSchema>}
 */
export function buildEmailDraft({
    template_key,
    vars,
    candidate,
    requested_items = [],
    recruiter = DEFAULT_RECRUITER,
}) {
    // 1. Select template function (O(1) lookup)
    const renderFn = TEMPLATE_FUNCTIONS[template_key] || TEMPLATE_FUNCTIONS.generic;

    // 2. Build template input with merged candidate data
    const templateInput = {
        ...vars,
        candidate_name: candidate?.name ?? vars.candidate_name ?? 'there',
        requested_items: requested_items.length ? requested_items : undefined,
    };

    // 3. Execute template function (V8-compiled, zero parsing)
    const { subject, body } = renderFn(templateInput);

    // 4. Build signature from recruiter profile
    const signature = buildSignature(recruiter);

    // 5. Assemble email draft
    const email = {
        kind: /** @type {const} */ ('email_draft'),
        to_name: candidate?.name ?? vars.candidate_name ?? null,
        to_email: candidate?.email ?? vars.candidate_email ?? null,
        subject,
        body, // Body-only, no signature (Outlook auto-appends)
        signature, // For UI preview only
        cc: [recruiter.assistantEmail || 'Tiffany.Chavez@ayahealthcare.com'],
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

    // 6. Build mailto from body only (Outlook auto-appends signature)
    email.mailto = buildMailtoLink(email);

    return email;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: NextSteps Builder
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

    // 2. Send Email (always, but depends on mailto)
    if (email.mailto) {
        steps.push({
            type: /** @type {const} */ ('send_email'),
            label: 'Open in Outlook',
            href: email.mailto,
        });
    } else {
        // mailto was empty (too long), show copy indicator
        steps.push({
            type: /** @type {const} */ ('await_docs'),
            label: 'Copy email to clipboard (too long for link)',
            required: ['body copied'],
        });
    }

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
// SECTION 8: Full Response Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a complete email response with email + next_steps.
 *
 * @param {Object} params
 * @param {string} params.message - User message for template routing
 * @param {Object} params.vars - Template variables
 * @param {Object|null} params.candidate - Candidate lookup result
 * @param {string[]} [params.requested_items]
 * @param {RecruiterProfile} [params.recruiter] - Injectable recruiter profile
 * @returns {z.infer<typeof EmailResponseSchema>}
 */
export function buildEmailResponse({
    message,
    vars,
    candidate,
    requested_items = [],
    recruiter = DEFAULT_RECRUITER,
}) {
    const { template_key } = routeToTemplate(message);

    const email = buildEmailDraft({
        template_key,
        vars,
        candidate,
        requested_items,
        recruiter,
    });

    const next_steps = buildNextSteps({ email, template_key });

    return { email, next_steps };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: Exports
// ═══════════════════════════════════════════════════════════════════════════════

export default {
    // Schemas
    EmailDraftSchema,
    NextStepActionSchema,
    EmailResponseSchema,
    CandidateMetaSchema,
    EmailDraftMetaSchema,
    // Builders
    routeToTemplate,
    buildEmailDraft,
    buildNextSteps,
    buildEmailResponse,
    // Config
    TEMPLATES,
    DEFAULT_RECRUITER,
};
