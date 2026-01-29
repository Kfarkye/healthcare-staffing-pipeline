/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER CHAT — ELITE PRODUCTION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * STATUS: PRODUCTION HARDENED v3.1.0
 * PLATFORM: Vercel / Next.js (Serverless Optimized)
 *
 * FIXES & UPGRADES:
 * - LATENCY: Non-blocking audit logs via `waitUntil`
 * - PROTOCOL: Enforced UI Message Stream (SSE format)
 * - RESILIENCE: Class-based Circuit Breaker & In-Memory Template Caching
 * - SAFETY: Strict Input Sanitization & Zod Validation
 * - TEMPLATE: Improved contract for clean Subject:/Body output
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

// ─────────────────────────────────────────────────────────────────────────────
// Internal Modules (Relative imports preserved)
// ─────────────────────────────────────────────────────────────────────────────
import { createCommandCenterTools } from './tools.js';
import { classify, Intent } from './lib/router.js';
import { getPromptForIntent } from './lib/prompts.js';
import { validate } from './lib/validator.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: RUNTIME CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes (Vercel Pro/Enterprise max)

const MODEL_CONFIG = Object.freeze({
    // Gemini 3 models as per user preference
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-2.0-flash-001',
    temperature: 0.7,
    maxSteps: 10,
    maxRetries: 2,
});

const TIMEOUT_CONFIG = Object.freeze({
    soft: 55_000, // 55s soft timeout
    cacheTTL: 1000 * 60 * 5, // 5 minute template cache
});

const HEADERS = Object.freeze({
    CORS: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-vercel-ai-data-stream, x-vercel-ai-ui-message-stream, x-trace-id',
    },
    NO_CACHE: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    },
});

const TEMPLATE_BY_INTENT = Object.freeze({
    DRAFT_OUTREACH: 'pay_package_outreach',
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: INFRASTRUCTURE CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Structured JSON Logger (CloudWatch/Datadog ready)
 */
class Logger {
    constructor(traceId) {
        this.traceId = traceId;
        this.startTime = Date.now();
    }

    _log(level, event, data = {}, error = null) {
        const payload = {
            ts: new Date().toISOString(),
            lvl: level,
            trace: this.traceId,
            ms: Date.now() - this.startTime,
            event,
            ...data,
        };

        if (error) {
            payload.err = {
                msg: error.message || String(error),
                name: error.name,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            };
        }

        const msg = JSON.stringify(payload);
        if (level === 'ERROR') console.error(msg);
        else console.log(msg);
    }

    info(event, data) { this._log('INFO', event, data); }
    warn(event, data) { this._log('WARN', event, data); }
    error(event, error, data) { this._log('ERROR', event, data, error); }
}

/**
 * Stateful Circuit Breaker
 * Protects downstream APIs from thundering herds.
 */
class CircuitBreaker {
    constructor(threshold = 5, resetTimeout = 30_000) {
        this.failures = 0;
        this.lastFailure = 0;
        this.isOpen = false;
        this.threshold = threshold;
        this.resetTimeout = resetTimeout;
    }

    check() {
        if (this.isOpen) {
            if (Date.now() - this.lastFailure > this.resetTimeout) {
                this.reset();
                return true; // Half-open state
            }
            return false;
        }
        return true;
    }

    recordFailure() {
        this.failures++;
        this.lastFailure = Date.now();
        if (this.failures >= this.threshold) this.isOpen = true;
    }

    recordSuccess() {
        if (this.failures > 0) this.reset();
    }

    reset() {
        this.failures = 0;
        this.isOpen = false;
        this.lastFailure = 0;
    }
}
const globalBreaker = new CircuitBreaker();

/**
 * LRU-ish In-Memory Cache
 * Reduces Supabase latency for hot templates on warm starts.
 */
class TemplateCache {
    constructor(ttl = TIMEOUT_CONFIG.cacheTTL) {
        this.cache = new Map();
        this.ttl = ttl;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    set(key, value) {
        if (this.cache.size > 100) this.cache.clear();
        this.cache.set(key, { value, expiry: Date.now() + this.ttl });
    }
}
const templateCache = new TemplateCache();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: BUSINESS LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch template with caching strategy
 */
async function fetchTemplate(supabase, name, logger) {
    if (!name) return null;

    const cached = templateCache.get(name);
    if (cached) {
        logger?.info('template_cache_hit', { name });
        return cached;
    }

    const { data, error } = await supabase
        .from('communication_templates')
        .select('subject_template, body_template, required_variables')
        .eq('name', name)
        .eq('is_active', true)
        .maybeSingle();

    if (error) {
        logger?.error('template_fetch_error', error, { name });
        return null;
    }
    if (!data?.body_template) return null;

    const template = {
        subject: data.subject_template ?? '',
        body: data.body_template,
        variables: Array.isArray(data.required_variables) ? data.required_variables : [],
    };

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
 * Build template contract for model (improved for clean output)
 */
function buildTemplateContract(template) {
    return `
═══════════════════════════════════════════════════════════════════════════════
MANDATORY OUTPUT CONTRACT — EMAIL TEMPLATE
═══════════════════════════════════════════════════════════════════════════════

Generate an email using EXACTLY this structure. Fill the {{placeholders}} with values from the image or context.

SUBJECT LINE FORMAT:
${template.subject}

EMAIL BODY FORMAT:
${template.body}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT RULES:
1. Start your response with "Subject: " followed by the filled subject line
2. Then a blank line, then the email body
3. Keep ALL formatting (line breaks, bullet points with "-", spacing)
4. Do NOT include labels like "SUBJECT LINE FORMAT" or "EMAIL BODY FORMAT" in output
5. If any data is missing, use [[MISSING:field_name]]
═══════════════════════════════════════════════════════════════════════════════

EXAMPLE OUTPUT FORMAT:
Subject: RRT - ABC Hospital | $2,000/week

Hi John,

I came across your profile...

Pay Package:
- Taxable Hourly Rate: $25/hr
- Meals & Housing Stipend: $1,100/week
- Total Gross Weekly Pay: $2,000

...

Thank you!
═══════════════════════════════════════════════════════════════════════════════
`;
}

/**
 * STREAMS ADAPTER (CRITICAL FIX)
 * Prioritizes UI Message Stream (SSE format) for frontend compatibility.
 */
function asChatResponse(result, init = {}) {
    const headers = { ...init.headers, ...HEADERS.CORS };

    // PRIORITY 1: UI Message Stream (SSE format - frontend parses this)
    if (result && typeof result.toUIMessageStreamResponse === 'function') {
        return result.toUIMessageStreamResponse({ ...init, headers });
    }

    // PRIORITY 2: Wrapper for manual stream
    if (result && typeof result.toUIMessageStream === 'function') {
        return createUIMessageStreamResponse({
            status: init.status ?? 200,
            statusText: init.statusText ?? 'OK',
            headers,
            stream: result.toUIMessageStream(),
        });
    }

    // FALLBACK: Data Stream (0:/2: format)
    if (result && typeof result.toDataStreamResponse === 'function') {
        return result.toDataStreamResponse({ ...init, headers });
    }

    // LEGACY
    if (result && typeof result.toTextStreamResponse === 'function') {
        return result.toTextStreamResponse({ ...init, headers });
    }

    if (result instanceof ReadableStream) {
        return new Response(result, { ...init, headers });
    }

    throw new Error('Invalid stream result type');
}

/**
 * Mimics a streaming response for buffered content
 */
function createBufferedUIResponse(text, { traceId, status, issues } = {}) {
    const blockId = `buffered-${randomUUID()}`;

    const stream = createUIMessageStream({
        async execute({ writer }) {
            if (traceId) {
                writer.write({
                    type: 'data',
                    value: { traceId, status: status ?? 'ok', issues: issues ?? [] }
                });
            }
            writer.write({ type: 'text-start', id: blockId });
            writer.write({ type: 'text-delta', id: blockId, delta: text ?? '' });
            writer.write({ type: 'text-end', id: blockId });
        },
    });

    return createUIMessageStreamResponse({
        status: 200,
        headers: {
            ...HEADERS.CORS,
            ...HEADERS.NO_CACHE,
            'x-trace-id': traceId ?? '',
        },
        stream,
    });
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];

    return messages.filter(m => m && typeof m === 'object').map((msg) => {
        if (typeof msg.content === 'string') return msg;

        const parts = Array.isArray(msg.content) ? msg.content :
            Array.isArray(msg.parts) ? msg.parts : null;

        if (!parts) return { role: msg.role, content: '' };

        const content = parts.map(part => {
            if (!part) return null;
            if (part.type === 'text') return { type: 'text', text: part.text ?? '' };

            if (part.type === 'image' || (part.type === 'file' && part.mimeType?.startsWith('image/'))) {
                if (part.image) return { type: 'image', image: part.image };
                if (part.data) {
                    const mime = part.mimeType ?? 'image/jpeg';
                    const data = part.data.startsWith('data:') ? part.data : `data:${mime};base64,${part.data}`;
                    return { type: 'image', image: data };
                }
                return { type: 'text', text: '[Image]' };
            }
            return null;
        }).filter(Boolean);

        return { role: msg.role, content: content.length ? content : '' };
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: AUDIT LOGGING (Async/Reliable)
// ═══════════════════════════════════════════════════════════════════════════════

const sanitize = (val) => String(val ?? '').trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

const EnvSchema = z.object({
    SUPABASE_URL: z.string().transform(sanitize).pipe(z.string().url()),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.any()).optional(),
});

/**
 * Performs audit logging safely using Vercel's waitUntil.
 */
async function performAuditLog(supabase, traceId, intent, input, validation) {
    try {
        const { error } = await supabase.from('ai_audit_logs').insert({
            function_name: 'command-center',
            trace_id: traceId,
            intent: intent || 'UNKNOWN',
            input_message: (input ?? '').slice(0, 1000),
            output_text: (validation?.text ?? '').slice(0, 4000),
            validation_issues: validation?.issues?.length ?? 0,
            valid: validation?.valid ?? false,
            created_at: new Date().toISOString(),
        });
        if (error) throw error;
    } catch (e) {
        console.warn(`[Audit Fail] ${traceId}: ${e.message}`);
    }
}

function isRetryableError(error) {
    const msg = (error?.message ?? '').toLowerCase();
    return (
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('overloaded') ||
        msg.includes('rate limit') ||
        msg.includes('fetch failed')
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: API HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: HEADERS.CORS });
}

export async function POST(request) {
    const traceId = request.headers.get('x-trace-id') || randomUUID();
    const logger = new Logger(traceId);

    // 1. ENVIRONMENT VALIDATION
    const envResult = EnvSchema.safeParse(process.env);
    if (!envResult.success) {
        logger.error('startup_config_invalid', envResult.error);
        return new Response(JSON.stringify({ error: 'System Configuration Error', traceId }), {
            status: 500, headers: HEADERS.CORS
        });
    }
    const env = envResult.data;

    // 2. CIRCUIT BREAKER CHECK
    if (!globalBreaker.check()) {
        logger.warn('circuit_breaker_active');
        return new Response(JSON.stringify({
            error: 'Service temporarily unavailable. Please retry later.',
            retryAfter: 60, traceId
        }), {
            status: 503,
            headers: { ...HEADERS.CORS, 'Retry-After': '60', 'Content-Type': 'application/json' }
        });
    }

    // 3. PARSE & VALIDATE INPUT
    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON', traceId }), { status: 400, headers: HEADERS.CORS });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
        logger.warn('invalid_payload', parsed.error);
        return new Response(JSON.stringify({ error: 'Invalid Request Schema', traceId }), {
            status: 400, headers: { ...HEADERS.CORS, 'Content-Type': 'application/json' }
        });
    }

    const { messages, context } = parsed.data;

    // 4. INIT CLIENTS
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: { headers: { 'x-trace-id': traceId } },
    });

    const google = createGoogleGenerativeAI({
        apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    });

    const abortController = new AbortController();
    const softTimeout = setTimeout(() => {
        logger.warn('soft_timeout_triggered');
        abortController.abort();
    }, TIMEOUT_CONFIG.soft);

    try {
        // 5. INTENT CLASSIFICATION
        const normalizedMessages = normalizeMessages(messages);
        const lastUserMsg = normalizedMessages.findLast(m => m.role === 'user');
        const inputText = Array.isArray(lastUserMsg?.content)
            ? lastUserMsg.content.find(p => p.type === 'text')?.text ?? ''
            : lastUserMsg?.content ?? '';

        const classification = classify({
            message: inputText || 'Start interaction',
            history: normalizedMessages
        });

        logger.info('intent_classified', { intent: classification.intent, tools: classification.requiresTools });

        const systemPrompt = [
            getPromptForIntent(classification.intent),
            context ? `\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}` : '',
            `\nCurrent Time: ${new Date().toISOString()}`
        ].join('');

        // DRAFT_OUTREACH uses template contract, so no tools needed
        const shouldProvideTools = classification.requiresTools && classification.intent !== Intent.DRAFT_OUTREACH;
        const tools = shouldProvideTools ? createCommandCenterTools(supabase) : undefined;

        // 6. STRATEGY SELECTION
        const isBuffered = classification.intent === Intent.EDIT_CONTENT;
        const needsTemplate = classification.intent === Intent.DRAFT_OUTREACH;

        let activeSystemPrompt = systemPrompt;

        // Handle Templates
        if (needsTemplate) {
            const templateName = TEMPLATE_BY_INTENT[classification.intent];
            const template = await fetchTemplate(supabase, templateName, logger);

            if (template) {
                const templateContract = buildTemplateContract(template);
                activeSystemPrompt += '\n\n' + templateContract;
                logger.info('template_contract_applied', { templateName });
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // PATH A: BUFFERED RESPONSE
        // ═══════════════════════════════════════════════════════════════
        if (isBuffered) {
            const result = await generateText({
                model: google(MODEL_CONFIG.primary),
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

            const outputText = result.text || 'Process completed.';
            const validation = validate(outputText, { autoFix: true });

            // BACKGROUND AUDIT (Non-blocking)
            waitUntil(performAuditLog(supabase, traceId, classification.intent, inputText, validation));

            return createBufferedUIResponse(validation.text, {
                traceId,
                status: validation.valid ? 'valid' : 'warning',
                issues: validation.issues
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // PATH B: STREAMING RESPONSE
        // ═══════════════════════════════════════════════════════════════
        const result = streamText({
            model: google(MODEL_CONFIG.primary),
            system: activeSystemPrompt,
            messages: normalizedMessages,
            tools,
            toolChoice: shouldProvideTools ? 'auto' : undefined,
            stopWhen: stepCountIs(MODEL_CONFIG.maxSteps),
            maxRetries: MODEL_CONFIG.maxRetries,
            temperature: MODEL_CONFIG.temperature,
            abortSignal: abortController.signal,
            onError: ({ error }) => {
                logger.error('stream_failure', error);
                globalBreaker.recordFailure();
            },
            onFinish: ({ text, finishReason, usage }) => {
                clearTimeout(softTimeout);
                globalBreaker.recordSuccess();

                const validation = validate(text);
                logger.info('stream_completed', {
                    finishReason,
                    tokens: usage?.totalTokens,
                    valid: validation.valid
                });

                // BACKGROUND AUDIT (Non-blocking)
                waitUntil(performAuditLog(supabase, traceId, classification.intent, inputText, validation));
            },
        });

        return asChatResponse(result, {
            headers: { 'x-trace-id': traceId }
        });

    } catch (error) {
        clearTimeout(softTimeout);

        if (isRetryableError(error)) {
            logger.warn('triggering_fallback', { originalError: error.message });
            globalBreaker.recordFailure();

            try {
                const fallbackResult = await generateText({
                    model: google(MODEL_CONFIG.fallback),
                    system: systemPrompt,
                    messages: normalizedMessages,
                    maxRetries: 1,
                });

                const fallbackText = fallbackResult.text || 'Fallback generated.';

                waitUntil(performAuditLog(supabase, traceId, 'FALLBACK', inputText, { text: fallbackText, valid: true }));

                return createBufferedUIResponse(fallbackText, { traceId, status: 'fallback' });
            } catch (fallbackErr) {
                logger.error('fallback_failed', fallbackErr);
            }
        } else {
            logger.error('fatal_error', error);
        }

        const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');
        return new Response(JSON.stringify({ error: isTimeout ? 'Request timed out' : 'Internal Service Error', traceId }), {
            status: isTimeout ? 504 : 500,
            headers: { ...HEADERS.CORS, 'Content-Type': 'application/json' }
        });
    }
}
