/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMAIL CONTRACT v2.1.2 — Hardened Guards
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Changes from v2.1.1:
 * - ADD: safeCandidateName guard (prevents "stop signature" from becoming names)
 * - ADD: stripActionLines sanitizer (removes "Next Step:" lines from body)
 *
 * v2.1.1 Fixes:
 * - FIX: Signature stripping now only operates on tail 30% of body
 * - FIX: safeNumberOrNull properly handles empty strings → null
 * - FIX: buildEmailDraft validates output with Zod before returning
 *
 * v2.1 Features:
 * 1) Body-Signature Firewall: strips recruiter-signature artifacts from body tail.
 * 2) NextSteps Cap: defaults to 2 user-facing steps (Outlook + Nova) to stop overflow.
 * 3) True TS Discriminated Unions: compiler-enforced template inputs.
 * 4) Var Normalization: supports facility vs facility_name, weekly_pay vs gross_weekly_pay, etc.
 * 5) CC Hardening: de-dupes, filters empties, always includes assistant if present.
 * 6) Safer Mailto: CRLF normalization + 2000-char guard.
 *
 * @module app/api/chat/command-center/lib/email-contract
 * @version 2.1.2
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'reference_consent' | 'doc_request' | 'assignment_interest' | 'generic'} TemplateKey
 */

/**
 * @typedef {'open_nova' | 'await_docs' | 'await_availability' | 'move_stage' | 'send_email'} NextStepType
 */

/**
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
 * Candidate lookup result from DB (permissive; callers vary by table)
 * @typedef {Object} CandidateLookup
 * @property {number|string|null} [candidate_id]
 * @property {string|null} [nova_url]
 * @property {string|null} [name]
 * @property {string|null} [email]
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Zod Schemas (Output Contract)
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
    signature: z.string().nullable(), // UI preview only
    cc: z.array(z.string()), // Always include assistant when present
    mailto: z.string(), // Built from body only
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
// SECTION 3: Router (Deterministic Template Selection)
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
        /\b(bls|acls|pals|license)\b/i,
        /\b(submit|submission)\b.*\b(need|require)/i,
        /\b(need|require|missing).*\b(document|cert|license)/i,
        /\b(start\s*date|interview)\b/i,
    ],
    assignment_interest: [
        /\bclick(ed)?\s*interested/i,
        /\b(interested|apply|applied)\b.*\b(assignment|position|job)/i,
        /\b(new|open)\s*(assignment|position|role)/i,
        /\bpay\s*package\b/i,
        /\boutreach\s*(email)?\b/i,
    ],
    // generic: intentionally no patterns - it's the default fallback
});

/**
 * Router: determines template_key from user message + context.
 * @param {string} message
 * @param {Object} [context]
 * @param {TemplateKey} [context.forced_template_key]
 * @returns {{ template_key: TemplateKey }}
 */
export function routeToTemplate(message, context = {}) {
    if (context.forced_template_key) {
        return { template_key: context.forced_template_key };
    }

    const normalized = (message ?? '').toLowerCase().trim();

    for (const pattern of TEMPLATE_PATTERNS.reference_consent) {
        if (pattern.test(normalized)) return { template_key: 'reference_consent' };
    }
    for (const pattern of TEMPLATE_PATTERNS.doc_request) {
        if (pattern.test(normalized)) return { template_key: 'doc_request' };
    }
    for (const pattern of TEMPLATE_PATTERNS.assignment_interest) {
        if (pattern.test(normalized)) return { template_key: 'assignment_interest' };
    }

    return { template_key: 'generic' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Pure Function Templates (No Regex Engines, No Parsing)
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATE_FUNCTIONS = Object.freeze({
    /**
     * @param {{ candidate_name: string }} vars
     */
    reference_consent: (vars) => ({
        subject: 'References Needed for Your Submission',
        body: `Hi ${vars.candidate_name},

I'm reaching out because the facility is ready to move forward with your submission and will need to contact your professional references.

Can you confirm:
- You're okay with facilities reaching out to your references
- The references on your Aya profile are current and will respond promptly

If you need to update or add a reference, tell me and I will help get that handled.

Once I have your confirmation, I will move your submission forward.

Thank you!`,
    }),

    /**
     * @param {{ candidate_name: string; facility_name?: string; requested_items?: string[] }} vars
     */
    doc_request: (vars) => {
        const facility = vars.facility_name || 'your submission';
        const items =
            vars.requested_items && vars.requested_items.length
                ? vars.requested_items.map((i) => `- ${i}`).join('\n')
                : `- Current resume (updated within last 6 months)
- BLS card (send what you have — I will confirm facility preference)
- Skills checklist`;

        return {
            subject: `Documents Needed for Submission - ${facility}`,
            body: `Hi ${vars.candidate_name},

To get your file submitted and keep things moving, please reply with the following:

${items}

Also, send your best interview times this week (include your time zone).

Once these come through, I will submit you right away.

Thank you!`,
        };
    },

    /**
     * @param {{ candidate_name: string; facility_name: string; role: string; weekly_pay: string; location?: string; start_date?: string; end_date?: string; shifts?: string; hourly_rate?: string; stipend?: string }} vars
     */
    assignment_interest: (vars) => ({
        subject: `${vars.role} - ${vars.facility_name} | ${vars.weekly_pay}/week`,
        body: `Hi ${vars.candidate_name},

I saw your interest in the ${vars.role} opening at ${vars.facility_name}. Here are the details:

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

Reply with those 3 items and I will move your submission forward.`,
    }),

    /**
     * @param {{ candidate_name: string; body_content?: string }} vars
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
// SECTION 5: Signature (Preview Only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build signature from recruiter profile.
 * @param {RecruiterProfile} profile
 * @returns {string}
 */
function buildSignature(profile) {
    const assistantLine =
        profile.assistantName && profile.assistantEmail
            ? `Please include my recruiter assistant on all email communications:\n${profile.assistantName} – ${profile.assistantEmail}\n\n`
            : '';

    return `${assistantLine}${profile.name}
${profile.title}
P: ${profile.phone}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Mailto Builder (Body-only, Outlook-safe)
// ═══════════════════════════════════════════════════════════════════════════════

const MAILTO_MAX_LEN = 2000;

/**
 * Normalize line breaks to CRLF for Outlook compatibility.
 * @param {string} text
 * @returns {string}
 */
function normalizeCRLF(text) {
    return (text ?? '').replace(/\r?\n/g, '\r\n');
}

/**
 * Build a mailto link from email components.
 * Returns empty string if URL exceeds safe browser limits.
 * @param {{ to_email: string|null; subject: string; body: string; cc: string[] }} email
 * @returns {string}
 */
function buildMailtoLink(email) {
    const to = email.to_email || '';
    const subject = encodeURIComponent(email.subject);
    const body = encodeURIComponent(normalizeCRLF(email.body));
    const ccList = (email.cc || []).filter(Boolean);
    const cc = ccList.length ? `&cc=${encodeURIComponent(ccList.join(','))}` : '';

    const mailto = `mailto:${to}?subject=${subject}${cc}&body=${body}`;

    if (mailto.length > MAILTO_MAX_LEN) {
        console.warn('[email-contract] mailto exceeds 2000 chars; returning empty so UI uses clipboard copy.');
        return '';
    }
    return mailto;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Normalizers + Firewalls
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Safely convert to trimmed string or undefined.
 * @param {unknown} v
 * @returns {string|undefined}
 */
function safeString(v) {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
}

/**
 * Safely convert to number or null.
 * FIX v2.1.1: Empty strings now correctly return null instead of 0.
 * @param {unknown} v
 * @returns {number|null}
 */
function safeNumberOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    if (!s.length) return null; // FIX: Empty string → null, not 0
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * Guard: Prevents instructions/keywords from becoming candidate names.
 * If user writes "stop signature" or "remove the template", the LLM might
 * incorrectly extract that as a candidate name.
 *
 * @param {unknown} input
 * @returns {string|null} - Returns null if input looks like instructions, not a name
 */
const BAD_NAME_TOKENS = [
    'signature', 'stop', 'remove', 'dont', "don't", 'next step',
    'template', 'contract', 'code', 'email', 'draft', 'subject',
    'body', 'mailto', 'outlook', 'gmail', 'copy', 'clipboard',
];

function safeCandidateName(input) {
    if (typeof input !== 'string') return null;
    const s = input.trim();
    if (!s) return null;
    const lower = s.toLowerCase();

    // Reject if contains instruction-like tokens
    if (BAD_NAME_TOKENS.some(t => lower.includes(t))) return null;

    // Reject long "sentences" as names (real names are 1-4 words max)
    if (s.split(/\s+/).length > 4) return null;

    return s;
}

/**
 * Sanitizes body to remove any "Next Step:" or "Action:" lines that might leak.
 * This is a safety net in case the LLM appends workflow instructions to body.
 *
 * @param {string} body
 * @returns {string}
 */
function stripActionLines(body) {
    if (!body) return '';
    const lines = body.replace(/\r?\n/g, '\n').split('\n');
    const kept = lines.filter(l => !/^\s*(next\s*step|action)\s*:/i.test(l));
    return kept.join('\n').trim();
}

/**
 * Strips signature-like lines from the body tail (prevents double signature in Outlook).
 * FIX v2.1.1: Only operates on the last 30% of body to prevent false positives
 * (e.g., "I spoke with Tiffany earlier" in body content).
 *
 * @param {string} body
 * @param {RecruiterProfile} recruiter
 * @returns {string}
 */
function stripSignatureArtifacts(body, recruiter) {
    let out = body ?? '';
    const lowerBody = out.toLowerCase();

    const needles = [
        recruiter.name,
        recruiter.title,
        recruiter.phone,
        recruiter.assistantEmail || '',
        'Please include my recruiter assistant',
    ]
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);

    if (!needles.length) return out.trim();

    // FIX: Only strip if signature block appears in last 30% of body
    const lastThirdStart = Math.floor(out.length * 0.7);

    const hits = needles
        .map((needle) => ({ needle, idx: lowerBody.indexOf(needle) }))
        .filter((x) => x.idx >= lastThirdStart) // Only in last 30%
        .sort((a, b) => a.idx - b.idx);

    // Only strip if multiple signature indicators in tail (prevents false positives)
    if (hits.length >= 2) {
        out = out.slice(0, hits[0].idx);
    }

    return out.trim();
}

/**
 * Normalizes variable names to the template's canonical keys.
 * Supports: facility → facility_name, gross_weekly_pay → weekly_pay, etc.
 *
 * @param {TemplateKey} template_key
 * @param {Record<string, unknown>} vars
 * @returns {Object}
 */
function normalizeVarsForTemplate(template_key, vars) {
    // Use safeCandidateName to prevent instructions from becoming names
    const rawName = safeString(vars.candidate_name) || safeString(vars.name);
    const candidate_name = safeCandidateName(rawName) || 'there';

    const candidate_email =
        safeString(vars.candidate_email) ||
        safeString(vars.email) ||
        undefined;

    if (template_key === 'reference_consent') {
        return { candidate_name, candidate_email };
    }

    if (template_key === 'doc_request') {
        const facility_name = safeString(vars.facility_name) || safeString(vars.facility) || undefined;
        const requested_itemsRaw = vars.requested_items;
        const requested_items =
            Array.isArray(requested_itemsRaw)
                ? requested_itemsRaw.map(String).map((s) => s.trim()).filter(Boolean)
                : undefined;

        return { candidate_name, candidate_email, facility_name, requested_items };
    }

    if (template_key === 'assignment_interest') {
        const facility_name = safeString(vars.facility_name) || safeString(vars.facility) || 'TBD';
        const role = safeString(vars.role) || safeString(vars.position_title) || 'Role';
        const weekly_pay = safeString(vars.weekly_pay) || safeString(vars.gross_weekly_pay) || 'TBD';

        return {
            candidate_name,
            candidate_email,
            facility_name,
            role,
            weekly_pay,
            location: safeString(vars.location),
            start_date: safeString(vars.start_date),
            end_date: safeString(vars.end_date),
            shifts: safeString(vars.shifts),
            hourly_rate: safeString(vars.hourly_rate),
            stipend: safeString(vars.stipend),
        };
    }

    // generic
    return {
        candidate_name,
        candidate_email,
        body_content: safeString(vars.body_content),
    };
}

/**
 * Build CC list with de-duplication.
 * @param {RecruiterProfile} recruiter
 * @param {string[]} extraCc
 * @returns {string[]}
 */
function buildCc(recruiter, extraCc = []) {
    const raw = [
        ...extraCc,
        recruiter.assistantEmail || '',
    ]
        .map((s) => String(s || '').trim())
        .filter(Boolean);

    // De-dupe case-insensitive
    const seen = new Set();
    const out = [];
    for (const email of raw) {
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(email);
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Email Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a structured EmailDraft from template input + candidate lookup result.
 *
 * @param {Object} params
 * @param {TemplateKey} params.template_key
 * @param {Record<string, unknown>} params.vars
 * @param {CandidateLookup|null} params.candidate
 * @param {string[]} [params.requested_items]
 * @param {RecruiterProfile} [params.recruiter]
 * @param {string[]} [params.extra_cc]
 * @returns {z.infer<typeof EmailDraftSchema>}
 */
export function buildEmailDraft({
    template_key,
    vars,
    candidate,
    requested_items = [],
    recruiter = DEFAULT_RECRUITER,
    extra_cc = [],
}) {
    const renderFn = TEMPLATE_FUNCTIONS[template_key] ?? TEMPLATE_FUNCTIONS.generic;

    const normalizedVars = normalizeVarsForTemplate(template_key, {
        ...vars,
        requested_items: requested_items.length ? requested_items : vars.requested_items,
    });

    const resolvedName = safeString(candidate?.name) || normalizedVars.candidate_name || 'there';
    const resolvedEmail = safeString(candidate?.email) || normalizedVars.candidate_email || null;

    const { subject, body: rawBody } = renderFn({
        ...normalizedVars,
        candidate_name: resolvedName,
    });

    // Firewall 1: Strip "Next Step:" or "Action:" lines that might leak
    const noActionLines = stripActionLines(rawBody);
    // Firewall 2: Strip recruiter signature artifacts from tail
    const cleanBody = stripSignatureArtifacts(noActionLines, recruiter);

    const signature = buildSignature(recruiter);
    const cc = buildCc(recruiter, extra_cc);

    const draft = {
        kind: /** @type {const} */ ('email_draft'),
        to_name: resolvedName || null,
        to_email: resolvedEmail,
        subject,
        body: cleanBody, // body-only
        signature, // preview-only
        cc,
        mailto: '', // filled below
        meta: {
            template_key,
            candidate: {
                candidate_id: safeNumberOrNull(candidate?.candidate_id),
                nova_url: safeString(candidate?.nova_url) || null,
                name: resolvedName || null,
            },
            requested_items: requested_items.length ? requested_items : undefined,
        },
    };

    draft.mailto = buildMailtoLink(draft);

    // FIX v2.1.1: Validate output against schema before returning
    return EmailDraftSchema.parse(draft);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: NextSteps Builder (Default: 2 steps max)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build next steps based on context and candidate data.
 *
 * @param {Object} params
 * @param {z.infer<typeof EmailDraftSchema>} params.email
 * @param {TemplateKey} params.template_key
 * @param {Object} [params.options]
 * @param {boolean} [params.options.include_internal_steps] - Default false
 * @param {number} [params.options.max_user_steps] - Default 2
 * @returns {z.infer<typeof NextStepActionSchema>[]}
 */
export function buildNextSteps({ email, template_key, options }) {
    const includeInternal = options?.include_internal_steps === true;
    const maxUserSteps = Number.isFinite(options?.max_user_steps)
        ? Math.max(0, Number(options?.max_user_steps))
        : 2;

    const userSteps = [];
    const internalSteps = [];

    // User-facing: Open in Outlook (only if mailto available)
    if (email.mailto) {
        userSteps.push({
            type: /** @type {const} */ ('send_email'),
            label: 'Open in Outlook',
            href: email.mailto,
        });
    }

    // User-facing: Open in Nova (only if nova_url exists)
    if (email.meta.candidate.nova_url) {
        userSteps.push({
            type: /** @type {const} */ ('open_nova'),
            label: 'Open in Nova',
            href: email.meta.candidate.nova_url,
        });
    }

    // Internal steps are optional; keep them out of the UI by default
    if (includeInternal) {
        if (template_key === 'reference_consent') {
            internalSteps.push({
                type: /** @type {const} */ ('await_docs'),
                label: 'Awaiting reference consent',
                required: ['reference consent'],
            });
        }

        if (template_key === 'doc_request') {
            const items = email.meta.requested_items || ['documents'];
            internalSteps.push({
                type: /** @type {const} */ ('await_docs'),
                label: 'Awaiting documents',
                required: items,
            });
            internalSteps.push({
                type: /** @type {const} */ ('await_availability'),
                label: 'Awaiting interview availability',
                required: ['interview times'],
            });
        }

        if (template_key === 'assignment_interest') {
            internalSteps.push({
                type: /** @type {const} */ ('await_docs'),
                label: 'Awaiting confirmations',
                required: ['availability', 'time-off', 'profile current'],
            });
        }

        if (email.meta.candidate.candidate_id) {
            internalSteps.push({
                type: /** @type {const} */ ('move_stage'),
                label: 'Move to Submitted',
                stage: 'Submitted',
                enabled_when: 'docs_received',
            });
        }
    }

    // Cap user steps to prevent UI overflow
    const cappedUserSteps = userSteps.slice(0, maxUserSteps);

    return [...cappedUserSteps, ...internalSteps];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: Full Response Builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a complete email response with email + next_steps.
 *
 * @param {Object} params
 * @param {string} params.message - User message for template routing
 * @param {Record<string, unknown>} params.vars - Template variables
 * @param {CandidateLookup|null} params.candidate - Candidate lookup result
 * @param {string[]} [params.requested_items]
 * @param {RecruiterProfile} [params.recruiter]
 * @param {string[]} [params.extra_cc]
 * @param {Object} [params.route_context]
 * @param {TemplateKey} [params.route_context.forced_template_key]
 * @param {Object} [params.next_steps_options]
 * @param {boolean} [params.next_steps_options.include_internal_steps]
 * @param {number} [params.next_steps_options.max_user_steps]
 * @returns {z.infer<typeof EmailResponseSchema>}
 */
export function buildEmailResponse({
    message,
    vars,
    candidate,
    requested_items = [],
    recruiter = DEFAULT_RECRUITER,
    extra_cc = [],
    route_context,
    next_steps_options,
}) {
    const { template_key } = routeToTemplate(message, route_context);

    const email = buildEmailDraft({
        template_key,
        vars,
        candidate,
        requested_items,
        recruiter,
        extra_cc,
    });

    const next_steps = buildNextSteps({
        email,
        template_key,
        options: next_steps_options,
    });

    return { email, next_steps };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: Exports
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
