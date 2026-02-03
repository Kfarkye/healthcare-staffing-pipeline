/**
 * ════════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER CHAT — Production Route Handler (v4.0.0)
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE: Deterministic template-first with LLM fallback
 *
 * v4.0.0 CHANGELOG:
 * - CRITICAL FIX: Deterministic template path now reached consistently
 * - CRITICAL FIX: Markdown stripped from all email outputs before response
 * - CRITICAL FIX: Intent check aligned with router changes (COLD_OUTREACH + image)
 * - ENHANCED: Two-pass extraction enforces plain text contract
 *
 * @module app/api/chat/command-center/route
 * @version 4.0.0
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
    streamText,
    generateText,
    stepCountIs,
    createUIMessageStream,
    createUIMessageStreamResponse,
} from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

import { createCommandCenterTools } from './tools.js';
import { classify, Intent } from './lib/router.js';
import { getPromptForIntent, EXTRACT_DATA_PROMPT, getPass2DraftPrompt } from './lib/prompts.js';
import { validate } from './lib/validator.js';
import { routeToTemplate, buildEmailResponse } from './lib/email-contract.js';

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Runtime Configuration
// ════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MODEL_CONFIG = Object.freeze({
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-2.0-flash-001',
    temperature: 0.7,
    maxSteps: 10,
    maxRetries: 2,
    safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
});

const TIMEOUT_CONFIG = Object.freeze({ soft: 55_000, cacheTTL: 1000 * 60 * 5 });

const HEADERS = Object.freeze({
    DEFAULT: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-vercel-ai-data-stream, x-vercel-ai-ui-message-stream, x-trace-id',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    }
});

const TEMPLATE_BY_INTENT = Object.freeze({ DRAFT_OUTREACH: 'pay_package_outreach' });

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2: Infrastructure Classes
// ════════════════════════════════════════════════════════════════════════════════

class Logger {
    constructor(traceId) {
        this.traceId = traceId;
        this.startTime = Date.now();
    }
    _log(level, event, data = {}, error = null) {
        const payload = { ts: new Date().toISOString(), lvl: level, trace: this.traceId, ms: Date.now() - this.startTime, event, ...data };
        if (error) payload.err = { msg: error.message || String(error), name: error.name };
        const msg = JSON.stringify(payload);
        if (level === 'ERROR') console.error(msg); else console.log(msg);
    }
    info(event, data) { this._log('INFO', event, data); }
    warn(event, data) { this._log('WARN', event, data); }
    error(event, error, data) { this._log('ERROR', event, data, error); }
}

class CircuitBreaker {
    constructor(threshold = 5, resetTimeout = 30_000) {
        this.failures = 0; this.lastFailure = 0; this.isOpen = false;
        this.threshold = threshold; this.resetTimeout = resetTimeout;
    }
    check() {
        if (this.isOpen && Date.now() - this.lastFailure > this.resetTimeout) { this.reset(); return true; }
        return !this.isOpen;
    }
    recordFailure() { this.failures++; this.lastFailure = Date.now(); if (this.failures >= this.threshold) this.isOpen = true; }
    recordSuccess() { if (this.failures > 0) this.reset(); }
    reset() { this.failures = 0; this.isOpen = false; this.lastFailure = 0; }
}
const globalBreaker = new CircuitBreaker();

class TemplateCache {
    constructor(ttl = TIMEOUT_CONFIG.cacheTTL) { this.cache = new Map(); this.ttl = ttl; }
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) { this.cache.delete(key); return null; }
        return item.value;
    }
    set(key, value) {
        if (this.cache.size > 50) this.cache.clear();
        this.cache.set(key, { value, expiry: Date.now() + this.ttl });
    }
}
const templateCache = new TemplateCache();

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3: Utilities
// ════════════════════════════════════════════════════════════════════════════════

const sanitizeEnv = (val) => String(val ?? '').trim().replace(/^["']|["']$/g, '');

const EnvSchema = z.object({
    SUPABASE_URL: z.string().transform(sanitizeEnv).pipe(z.string().url()),
    SUPABASE_SERVICE_ROLE_KEY: z.string().transform(sanitizeEnv).pipe(z.string().min(1)),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().transform(sanitizeEnv).pipe(z.string().min(1)),
});

const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.any()).optional(),
    systemContext: z.string().optional(),
    mode: z.enum(['default', 'cold_outreach', 'batch_reassign', 'reply_mode']).optional(),
    modeLocked: z.boolean().optional(),
});

async function fetchTemplate(supabase, name, logger) {
    if (!name) return null;
    const cached = templateCache.get(name);
    if (cached) { logger?.info('template_cache_hit', { name }); return cached; }
    const { data, error } = await supabase.from('communication_templates')
        .select('subject_template, body_template, required_variables')
        .eq('name', name).eq('is_active', true).maybeSingle();
    if (error) { logger?.error('template_fetch_failed', error, { name }); return null; }
    if (!data?.body_template) return null;
    const template = { subject: data.subject_template ?? '', body: data.body_template, variables: Array.isArray(data.required_variables) ? data.required_variables : [] };
    templateCache.set(name, template);
    return template;
}

function renderTemplate(templateStr, vars = {}) {
    return templateStr.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
        const val = vars[key];
        return (val === undefined || val === null || val === '') ? `[[MISSING:${key}]]` : String(val);
    });
}

/**
 * CRITICAL: Strip all markdown formatting from text for Outlook-ready plain text.
 */
function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold **text**
        .replace(/__([^_]+)__/g, '$1')       // Bold __text__
        .replace(/\*([^*]+)\*/g, '$1')       // Italic *text*
        .replace(/_([^_]+)_/g, '$1')         // Italic _text_
        .replace(/^\s*[\*\+]\s+/gm, '- ')    // Bullet * or + to -
        .replace(/^\s*•\s*/gm, '- ')         // Unicode bullet to -
        .replace(/^#+\s*/gm, '')             // Headers
        .replace(/`([^`]+)`/g, '$1')         // Inline code
        .replace(/^>\s*/gm, '')              // Blockquotes
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
        .replace(/\r\n/g, '\n')
        .trim();
}

function buildTemplateContract(template) {
    return `
================================================================================
MANDATORY OUTPUT CONTRACT - EMAIL TEMPLATE (PLAIN TEXT ONLY)
================================================================================
Generate an email using EXACTLY this structure. Fill {{placeholders}} with values.

SUBJECT: ${template.subject}
BODY: ${template.body}

RULES:
1. Start with "Subject: " then subject line, blank line, then body
2. Use dashes (-) for bullets, NOT asterisks or dots
3. NO MARKDOWN: No **, no *, no #, no bullets with asterisks
4. If data missing, use [[MISSING:field_name]]
================================================================================`;
}

function asChatResponse(result, init = {}) {
    const headers = { ...init.headers, ...HEADERS.DEFAULT };
    if (result?.toUIMessageStreamResponse) return result.toUIMessageStreamResponse({ ...init, headers });
    if (result?.toUIMessageStream) return createUIMessageStreamResponse({ status: init.status ?? 200, headers, stream: result.toUIMessageStream() });
    if (result?.toDataStreamResponse) return result.toDataStreamResponse({ ...init, headers });
    if (result?.toTextStreamResponse) return result.toTextStreamResponse({ ...init, headers });
    if (result instanceof ReadableStream) return new Response(result, { ...init, headers });
    throw new Error('Unsupported stream result type');
}

function createBufferedUIResponse(text, { traceId, status, issues } = {}) {
    const blockId = `buffered-${randomUUID()}`;
    const cleanText = stripMarkdown(text ?? ''); // CRITICAL: Strip markdown

    const stream = createUIMessageStream({
        async execute({ writer }) {
            if (traceId) writer.write({ type: 'data', value: { traceId, status: status ?? 'ok', issues: issues ?? [] } });
            writer.write({ type: 'text-start', id: blockId });
            writer.write({ type: 'text-delta', id: blockId, delta: cleanText });
            writer.write({ type: 'text-end', id: blockId });
        },
    });
    return createUIMessageStreamResponse({ status: 200, headers: { ...HEADERS.DEFAULT, 'x-trace-id': traceId ?? '' }, stream });
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const lastIndex = messages.length - 1;
    return messages.map((msg, index) => {
        let parts = [];
        if (typeof msg.content === 'string') parts.push({ type: 'text', text: msg.content });
        else if (Array.isArray(msg.content)) parts.push(...msg.content);
        else if (Array.isArray(msg.parts)) parts.push(...msg.parts);
        if (Array.isArray(msg.experimental_attachments)) parts.push(...msg.experimental_attachments.map(a => ({ type: a.contentType?.startsWith('image/') ? 'image' : 'file', ...a, mimeType: a.contentType })));
        if (Array.isArray(msg.attachments)) parts.push(...msg.attachments.map(a => ({ type: a.contentType?.startsWith('image/') ? 'image' : 'file', ...a, mimeType: a.contentType })));

        const content = parts.map((part) => {
            if (!part) return null;
            if (part.type === 'text' || (!part.type && typeof part.text === 'string')) return { type: 'text', text: part.text ?? '' };
            const isImage = part.type === 'image' || (part.type === 'file' && part.mimeType?.startsWith('image/')) || part.contentType?.startsWith('image/');
            if (isImage) {
                if (index !== lastIndex) return { type: 'text', text: '[Image from previous turn]' };
                if (typeof part.url === 'string') return { type: 'image', image: new URL(part.url) };
                if (typeof part.image === 'string') return part.image.startsWith('http') ? { type: 'image', image: new URL(part.image) } : { type: 'image', image: part.image };
                if (part.data) { const mime = part.mimeType ?? part.contentType ?? 'image/jpeg'; const prefix = part.data.startsWith('data:') ? '' : `data:${mime};base64,`; return { type: 'image', image: `${prefix}${part.data}` }; }
                if (part.image_url?.url) return { type: 'image', image: new URL(part.image_url.url) };
                return { type: 'text', text: '[Image]' };
            }
            return null;
        }).filter(Boolean);
        if (content.length === 0) return { role: msg.role, content: '' };
        return { role: msg.role, content };
    });
}

async function performAuditLog(supabase, traceId, intent, input, validation) {
    try {
        await supabase.from('ai_audit_logs').insert({
            function_name: 'command-center', trace_id: traceId, intent: intent || 'UNKNOWN',
            input_message: (input ?? '').slice(0, 1000), output_text: (validation?.text ?? '').slice(0, 4000),
            validation_issues: validation?.issues?.length ?? 0, valid: validation?.valid ?? false, created_at: new Date().toISOString(),
        });
    } catch (e) { console.warn(`[Audit Error] ${traceId}: ${e.message}`); }
}

function isRetryableError(error) {
    const msg = (error?.message ?? '').toLowerCase();
    return msg.includes('429') || msg.includes('503') || msg.includes('overloaded') || msg.includes('rate limit') || msg.includes('fetch failed');
}
// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Main Handler (Continued from Part 1)
// ════════════════════════════════════════════════════════════════════════════════

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: HEADERS.DEFAULT });
}

export async function POST(request) {
    const traceId = request.headers.get('x-trace-id') || randomUUID();
    const logger = new Logger(traceId);

    // 1. CONFIGURATION
    const rawEnv = { ...process.env, GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY };
    const envResult = EnvSchema.safeParse(rawEnv);
    if (!envResult.success) {
        const missingKeys = envResult.error.issues.map(i => i.path.join('.'));
        logger.error('env_validation_failed', { missing: missingKeys });
        return new Response(JSON.stringify({ error: 'System Configuration Error', details: `Missing: ${missingKeys.join(', ')}`, traceId }), { status: 500, headers: HEADERS.DEFAULT });
    }
    const env = envResult.data;

    // 2. CIRCUIT BREAKER
    if (!globalBreaker.check()) {
        logger.warn('circuit_breaker_active');
        return new Response(JSON.stringify({ error: 'Service Unavailable', retryAfter: 60, traceId }), { status: 503, headers: { ...HEADERS.DEFAULT, 'Retry-After': '60' } });
    }

    // 3. PARSE INPUT
    let body;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON', traceId }), { status: 400, headers: HEADERS.DEFAULT }); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return new Response(JSON.stringify({ error: 'Invalid Schema', traceId }), { status: 400, headers: HEADERS.DEFAULT });
    const { messages, context, systemContext: systemContextRaw, mode, modeLocked } = parsed.data;

    // 4. CLIENTS
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { headers: { 'x-trace-id': traceId } } });
    const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    const abortController = new AbortController();
    const softTimeout = setTimeout(() => abortController.abort(), TIMEOUT_CONFIG.soft);

    try {
        // 5. INTENT CLASSIFICATION
        const normalizedMessages = normalizeMessages(messages);
        const lastUserMsg = normalizedMessages.findLast(m => m.role === 'user');
        const rawInputText = Array.isArray(lastUserMsg?.content) ? lastUserMsg.content.filter(p => p.type === 'text').map(p => p.text).join('\n') : lastUserMsg?.content ?? '';
        const inputText = String(rawInputText).replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, "");
        const hasImage = Array.isArray(lastUserMsg?.content) && lastUserMsg.content.some(p => p.type === 'image');

        logger.info('classification_input', { inputText: inputText.slice(0, 100), inputLength: inputText.length, hasImage, mode, modeLocked });

        const systemContext = (systemContextRaw ?? '').trim();
        const classificationMessage = [inputText, systemContext, hasImage && !inputText && !systemContext ? 'Draft a pay package outreach email using this image' : ''].filter(Boolean).join(' ') || 'Start interaction';
        const routerMode = mode ?? 'default';
        const routerModeLocked = Boolean(modeLocked);

        const classification = await classify({ message: classificationMessage, history: normalizedMessages, mode: routerMode, modeLocked: routerModeLocked, hasImage });

        logger.info('intent_classified', { intent: classification.intent, tools: classification.requiresTools, mode: routerMode, modeLocked: routerModeLocked, hasImage, fastPath: classification.fastPath });

        const modeContextBlock = systemContext?.trim() ? `\n\nMODE CONTEXT:\nUser selected: "${systemContext}"\n` : '';
        const systemPrompt = [getPromptForIntent(classification.intent), modeContextBlock, context ? `\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}` : '', `\nCurrent Time: ${new Date().toISOString()}`].join('');

        const shouldProvideTools = ![Intent.DRAFT_OUTREACH, Intent.DRAFT_EMAIL].includes(classification.intent);
        const tools = shouldProvideTools ? createCommandCenterTools(supabase) : undefined;
        const isBuffered = [Intent.EDIT_CONTENT, Intent.DRAFT_OUTREACH, Intent.DRAFT_EMAIL, Intent.LICENSING_REQUEST, Intent.REASSIGNMENT_REQUEST].includes(classification.intent);
        let activeSystemPrompt = systemPrompt;

        // ════════════════════════════════════════════════════════════════════════
        // 6. TWO-PASS EXTRACTION FOR DRAFT_OUTREACH + IMAGE (CRITICAL PATH)
        // ════════════════════════════════════════════════════════════════════════
        if (classification.intent === Intent.DRAFT_OUTREACH && hasImage) {
            try {
                logger.info('two_pass_extraction_start');

                // PASS 1: Extract data as structured JSON (Pure Vision)
                const extractionResult = await generateText({
                    model: google(MODEL_CONFIG.primary, { safetySettings: MODEL_CONFIG.safetySettings }),
                    system: EXTRACT_DATA_PROMPT,
                    messages: normalizedMessages,
                    maxRetries: MODEL_CONFIG.maxRetries,
                    temperature: 0.1,
                    abortSignal: abortController.signal,
                });

                let extractedData;
                try {
                    const jsonMatch = extractionResult.text.match(/\{[\s\S]*\}/);
                    extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
                } catch (parseError) {
                    logger.warn('extraction_parse_failed', { error: parseError.message });
                    extractedData = null;
                }

                if (extractedData) {
                    logger.info('pass1_complete', { fieldsFound: Object.keys(extractedData).filter(k => extractedData[k] && k !== 'missing').length, missing: extractedData.missing || [] });

                    // PASS 2: DETERMINISTIC TEMPLATE FILL (No LLM - zero freestyle risk)
                    const templateVars = {
                        first_name: extractedData.candidateName?.split(' ')[0] || 'there',
                        specialty: extractedData.specialty || extractedData.role || '',
                        facility_name: extractedData.facility || '',
                        city: extractedData.location?.split(',')[0]?.trim() || '',
                        state: extractedData.location?.split(',')[1]?.trim() || '',
                        start_date: extractedData.startDate || '',
                        end_date: extractedData.endDate || '',
                        shift_type: extractedData.shifts || '',
                        hours_per_week: extractedData.hoursPerWeek || '36',
                        taxable_rate: extractedData.hourlyRate || '',
                        stipend_weekly: extractedData.stipend || '',
                        gross_weekly_pay: extractedData.weeklyTotal || '',
                    };

                    const template = await fetchTemplate(supabase, 'pay_package_outreach', logger);

                    if (template) {
                        const subject = renderTemplate(template.subject, templateVars);
                        const body = renderTemplate(template.body, templateVars);
                        const toLine = extractedData.candidateEmail ? `To: ${extractedData.candidateEmail}\n` : '';
                        const output = `${toLine}Subject: ${subject}\n\n${body}`;

                        clearTimeout(softTimeout);
                        globalBreaker.recordSuccess();
                        const validation = validate(output, { autoFix: true });

                        logger.info('deterministic_template_complete', { templateUsed: 'pay_package_outreach', pass1Fields: Object.keys(extractedData).length });
                        waitUntil(performAuditLog(supabase, traceId, 'DRAFT_OUTREACH_DETERMINISTIC', inputText, validation));

                        return createBufferedUIResponse(validation.text, { traceId, status: 'deterministic_template', issues: validation.issues });
                    }
                    logger.warn('template_fetch_failed_fallback_to_llm');
                }
                logger.warn('extraction_failed_fallback_to_single_pass');
            } catch (error) {
                logger.warn('two_pass_error_fallback', { error: error.message });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // 6b. DETERMINISTIC EMAIL DRAFTING (DRAFT_EMAIL intent)
        // ════════════════════════════════════════════════════════════════════════
        if (classification.intent === Intent.DRAFT_EMAIL) {
            try {
                logger.info('draft_email_start', { inputText: inputText.slice(0, 100) });
                const routeResult = routeToTemplate(inputText);
                logger.info('template_routed', { template_key: routeResult.template_key });

                const namePatterns = [/(?:for|to|candidate|email|reach out to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:needs|wants|profile|submission)/i];
                let candidateName = null;
                for (const pattern of namePatterns) { const match = inputText.match(pattern); if (match?.[1]) { candidateName = match[1].trim(); break; } }

                let candidate = null;
                if (candidateName && tools?.resolve_candidate) {
                    try {
                        const resolveResult = await tools.resolve_candidate.execute({ name: candidateName });
                        if (resolveResult?.found) candidate = { candidate_id: resolveResult.candidate_id, name: resolveResult.name, email: resolveResult.email, nova_url: resolveResult.nova_url };
                    } catch (e) { logger.warn('candidate_resolve_failed', { error: e.message }); }
                }

                let requestedItems = [];
                if (routeResult.template_key === 'doc_request') {
                    const matches = inputText.match(/\b(bls|acls|pals|cpr|license|resume|skills?\s*checklist|availability)\b/gi);
                    if (matches) { requestedItems = [...new Set(matches.map(m => m.toUpperCase()))]; if (!requestedItems.some(i => i.includes('AVAILABILITY'))) requestedItems.push('Best interview times this week (include time zone)'); }
                }

                const vars = { candidate_name: candidate?.name || candidateName || 'there', candidate_email: candidate?.email, ...context };
                const emailResponse = buildEmailResponse({ message: inputText, vars, candidate, requested_items: requestedItems });

                clearTimeout(softTimeout);
                const jsonPayload = JSON.stringify(emailResponse, null, 2);
                const responseText = `[EMAIL_DRAFT_JSON]\n${jsonPayload}\n[/EMAIL_DRAFT_JSON]`;
                waitUntil(performAuditLog(supabase, traceId, 'DRAFT_EMAIL', inputText, { text: responseText, valid: true, template_key: routeResult.template_key }));
                return createBufferedUIResponse(responseText, { traceId, status: 'email_draft_structured' });
            } catch (error) {
                logger.error('draft_email_error', error);
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // 7. TEMPLATE PROCESSING (Non-image path)
        // ════════════════════════════════════════════════════════════════════════
        const needsTemplate = classification.intent === Intent.DRAFT_OUTREACH && !hasImage;
        if (needsTemplate) {
            const templateName = TEMPLATE_BY_INTENT[classification.intent];
            const template = await fetchTemplate(supabase, templateName, logger);
            if (template) {
                const vars = context || {};
                const missingVars = template.variables.filter(v => !vars[v]);
                if (missingVars.length === 0) {
                    const output = `Subject: ${renderTemplate(template.subject, vars)}\n\n${renderTemplate(template.body, vars)}`;
                    clearTimeout(softTimeout);
                    const validation = validate(output, { autoFix: true });
                    waitUntil(performAuditLog(supabase, traceId, classification.intent, inputText, validation));
                    return createBufferedUIResponse(output, { traceId, status: 'template_direct' });
                }
                activeSystemPrompt += '\n\n' + buildTemplateContract(template);
                logger.info('template_contract_applied', { templateName, missingVars: missingVars.slice(0, 5) });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // 8. BUFFERED EXECUTION (LLM fallback with markdown stripping)
        // ════════════════════════════════════════════════════════════════════════
        if (isBuffered) {
            try {
                const result = await generateText({
                    model: google(MODEL_CONFIG.primary, { safetySettings: MODEL_CONFIG.safetySettings }),
                    system: activeSystemPrompt,
                    messages: normalizedMessages,
                    tools,
                    toolChoice: shouldProvideTools ? 'auto' : undefined,
                    stopWhen: stepCountIs(MODEL_CONFIG.maxSteps),
                    maxRetries: MODEL_CONFIG.maxRetries,
                    temperature: MODEL_CONFIG.temperature,
                    abortSignal: abortController.signal,
                });

                clearTimeout(softTimeout);
                globalBreaker.recordSuccess();
                let text = result.text || (result.toolCalls?.length ? 'Tools used.' : 'No output.');
                const validation = validate(text, { autoFix: true });
                waitUntil(performAuditLog(supabase, traceId, classification.intent, inputText, validation));
                return createBufferedUIResponse(validation.text, { traceId, status: 'valid', issues: validation.issues });
            } catch (error) {
                if (isRetryableError(error)) {
                    logger.warn('fallback_triggered_buffered', { error: error.message });
                    const fallback = await generateText({ model: google(MODEL_CONFIG.fallback, { safetySettings: MODEL_CONFIG.safetySettings }), system: activeSystemPrompt, messages: normalizedMessages, maxRetries: 1 });
                    clearTimeout(softTimeout);
                    let text = fallback.text || 'Fallback response.';
                    waitUntil(performAuditLog(supabase, traceId, 'FALLBACK', inputText, { text, valid: true }));
                    return createBufferedUIResponse(text, { traceId, status: 'fallback' });
                }
                throw error;
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // 9. STREAMING EXECUTION (Chat / Tools)
        // ════════════════════════════════════════════════════════════════════════
        try {
            const result = streamText({
                model: google(MODEL_CONFIG.primary, { safetySettings: MODEL_CONFIG.safetySettings }),
                system: activeSystemPrompt,
                messages: normalizedMessages,
                tools,
                toolChoice: shouldProvideTools ? 'auto' : undefined,
                stopWhen: stepCountIs(MODEL_CONFIG.maxSteps),
                maxRetries: MODEL_CONFIG.maxRetries,
                temperature: MODEL_CONFIG.temperature,
                abortSignal: abortController.signal,
                onError: ({ error }) => { logger.error('stream_fail', error); globalBreaker.recordFailure(); },
                onFinish: ({ text, finishReason, usage }) => {
                    clearTimeout(softTimeout);
                    globalBreaker.recordSuccess();
                    const validation = validate(text);
                    logger.info('stream_completed', { finishReason, tokens: usage?.totalTokens, valid: validation.valid });
                    waitUntil(performAuditLog(supabase, traceId, classification.intent, inputText, validation));
                }
            });
            return asChatResponse(result, { headers: { 'x-trace-id': traceId } });
        } catch (error) {
            if (isRetryableError(error)) {
                logger.warn('fallback_triggered_stream', { error: error.message });
                const fallback = await generateText({ model: google(MODEL_CONFIG.fallback, { safetySettings: MODEL_CONFIG.safetySettings }), system: activeSystemPrompt, messages: normalizedMessages, maxRetries: 1 });
                clearTimeout(softTimeout);
                const text = fallback.text || 'Fallback response.';
                waitUntil(performAuditLog(supabase, traceId, 'FALLBACK', inputText, { text, valid: true }));
                return createBufferedUIResponse(text, { traceId, status: 'fallback' });
            }
            throw error;
        }
    } catch (error) {
        clearTimeout(softTimeout);
        logger.error('handler_error', error);
        const isTimeout = error.name === 'AbortError';
        return new Response(JSON.stringify({ error: isTimeout ? 'Request timed out' : 'Processing Error', traceId }), { status: isTimeout ? 504 : 500, headers: HEADERS.DEFAULT });
    }
}
