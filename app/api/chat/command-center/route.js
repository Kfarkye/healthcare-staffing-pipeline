/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER CHAT — ELITE PRODUCTION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * FIX v2.0.1 (Paste-and-go):
 * - Always return UI Message Stream responses (prevents raw "0:/2:" rendering)
 * - Version-tolerant stream response adapter (UI stream first, then legacy)
 * - Correct multi-step tool calling loop control via stopWhen(stepCountIs(N))
 * - Buffered path uses text-start/text-delta/text-end (AI SDK UI protocol)
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

// ─────────────────────────────────────────────────────────────────────────────
// Internal Modules (relative imports preserved)
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
export const maxDuration = 300;

const MODEL_CONFIG = Object.freeze({
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-3-pro-preview',
    temperature: 0.7,
    maxSteps: 5,
    maxRetries: 2,
});

const TIMEOUT_CONFIG = Object.freeze({
    soft: 55_000,
    chunk: 30_000,
});

const circuitBreaker = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
    threshold: 3,
    resetTimeout: 60_000,
};

const CORS_HEADERS = Object.freeze({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-vercel-ai-data-stream, x-vercel-ai-ui-message-stream, x-trace-id',
});

/**
 * Intent-to-Template Mapping
 * Server decides which template to use — model cannot override
 */
const TEMPLATE_BY_INTENT = Object.freeze({
    DRAFT_OUTREACH: 'pay_package_outreach',
    // Add more mappings as needed:
    // EXTENSION_REQUEST: 'extension_request',
    // REASSIGNMENT: 'reassignment_request',
});

/**
 * Fetch template from database (server-side, deterministic)
 * @param {SupabaseClient} supabase
 * @param {string} name - Template name
 * @returns {Promise<{subject: string, body: string, variables: string[]} | null>}
 */
async function fetchTemplate(supabase, name) {
    const { data, error } = await supabase
        .from('communication_templates')
        .select('subject_template, body_template, required_variables')
        .eq('name', name)
        .eq('is_active', true)
        .maybeSingle();

    if (error || !data?.body_template) return null;

    return {
        subject: data.subject_template ?? '',
        body: data.body_template,
        variables: Array.isArray(data.required_variables) ? data.required_variables : [],
    };
}

/**
 * Render template with variables (deterministic, no LLM needed)
 * Missing variables become [[MISSING:varname]] for visibility
 * @param {string} templateStr - Template with {{varname}} placeholders
 * @param {Record<string, any>} vars - Variable values from context
 * @returns {string}
 */
function renderTemplate(templateStr, vars = {}) {
    return templateStr.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
        const val = vars[key];
        if (val === undefined || val === null || val === '') {
            return `[[MISSING:${key}]]`;
        }
        return String(val);
    });
}

/**
 * Build template contract for model (hard structure enforcement)
 * @param {{subject: string, body: string}} template
 * @returns {string}
 */
function buildTemplateContract(template) {
    return `
═══════════════════════════════════════════════════════════════════════════════
MANDATORY OUTPUT CONTRACT — TEMPLATE-FIRST ENFORCEMENT
═══════════════════════════════════════════════════════════════════════════════

You MUST use EXACTLY this template structure. Do not invent headings, reorder sections, or improvise.
Fill placeholders only. If data is missing, leave placeholder as [[MISSING:field_name]].

TEMPLATE SUBJECT:
${template.subject}

TEMPLATE BODY:
${template.body}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT: Return the filled template exactly as structured above.
═══════════════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: INPUT VALIDATION & SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const sanitize = (val) => (val ?? '').trim().replace(/^["']|["']$/g, '');

const EnvSchema = z.object({
    SUPABASE_URL: z.string().transform(sanitize).pipe(z.string().url()),
    SUPABASE_SERVICE_ROLE_KEY: z.string().transform(sanitize).pipe(z.string().min(1)),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().transform(sanitize).pipe(z.string().min(1)),
});

const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.any()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Buffered UI stream response (correct for AI SDK UI / useChat)
 * Writes the assistant text using start/delta/end events.
 * Also writes optional custom data as `data-<name>` events (safe, ignored if unused).
 */
function createBufferedUIResponse(text, { traceId, status, issues } = {}) {
    const blockId = `buffered-${randomUUID()}`;

    const stream = createUIMessageStream({
        async execute({ writer }) {
            // Optional debug metadata for the client (safe to ignore)
            if (traceId) {
                writer.write({
                    type: 'data-trace',
                    data: { traceId, status: status ?? 'ok', issues: issues ?? [] },
                });
            }

            writer.write({ type: 'text-start', id: blockId });
            writer.write({ type: 'text-delta', id: blockId, delta: text ?? '' });
            writer.write({ type: 'text-end', id: blockId });
        },
    });

    return createUIMessageStreamResponse({
        status: 200,
        statusText: 'OK',
        headers: {
            ...CORS_HEADERS,
            'x-trace-id': traceId ?? '',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
        stream,
    });
}

/**
 * Version-tolerant response adapter:
 * Prefer UI Message Stream (AI SDK UI v6+), then legacy data stream, then text stream.
 */
function asChatResponse(result, init = {}) {
    // Best: AI SDK UI message stream response
    if (result && typeof result.toUIMessageStreamResponse === 'function') {
        return result.toUIMessageStreamResponse(init);
    }

    // Next best: wrap UI message stream explicitly
    if (result && typeof result.toUIMessageStream === 'function') {
        return createUIMessageStreamResponse({
            status: init.status ?? 200,
            statusText: init.statusText ?? 'OK',
            headers: init.headers ?? {},
            stream: result.toUIMessageStream(),
        });
    }

    // Legacy: AI SDK data stream response (older useChat transports)
    if (result && typeof result.toDataStreamResponse === 'function') {
        return result.toDataStreamResponse(init);
    }

    // Legacy: text stream response
    if (result && typeof result.toTextStreamResponse === 'function') {
        return result.toTextStreamResponse(init);
    }

    // Last resort: ReadableStream
    if (result instanceof ReadableStream) {
        return new Response(result, init);
    }

    const methods = Object.keys(result || {}).filter((k) => typeof result[k] === 'function');
    throw new TypeError(
        `Unsupported streaming result. Available methods: ${methods.join(', ') || 'none'}`
    );
}

/**
 * Normalizes message content for model consumption
 * - Handles both msg.content AND msg.parts
 * - Extracts text from complex content structures
 * - Replaces old images with placeholders
 */
function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];

    const lastIndex = messages.length - 1;

    return messages.map((msg, index) => {
        const potentialContent = Array.isArray(msg.content)
            ? msg.content
            : Array.isArray(msg.parts)
                ? msg.parts
                : null;

        if (!potentialContent && typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }

        if (potentialContent) {
            const content = potentialContent
                .map((part) => {
                    if (part.type === 'text') {
                        return { type: 'text', text: part.text ?? '' };
                    }

                    const isImage =
                        part.type === 'image' || (part.type === 'file' && part.mimeType?.startsWith('image/'));

                    if (isImage) {
                        if (index !== lastIndex) return { type: 'text', text: '[Image from previous turn]' };

                        if (part.image && typeof part.image === 'string') {
                            if (part.image.startsWith('http://') || part.image.startsWith('https://')) {
                                return { type: 'image', image: new URL(part.image) };
                            }
                            return { type: 'image', image: part.image };
                        }

                        if (part.data) {
                            const mime = part.mimeType ?? 'image/jpeg';
                            if (part.data.startsWith('data:')) return { type: 'image', image: part.data };
                            return { type: 'image', image: `data:${mime};base64,${part.data}` };
                        }

                        if (part.image || part.data) return { type: 'text', text: '[Image]' };
                        return null;
                    }

                    return null;
                })
                .filter(Boolean);

            if (content.length === 0) return { role: msg.role, content: '' };
            return { role: msg.role, content };
        }

        return msg;
    });
}

function checkCircuitBreaker() {
    const now = Date.now();
    if (circuitBreaker.isOpen && now - circuitBreaker.lastFailure > circuitBreaker.resetTimeout) {
        circuitBreaker.isOpen = false;
        circuitBreaker.failures = 0;
    }
    return !circuitBreaker.isOpen;
}

function recordFailure() {
    circuitBreaker.failures += 1;
    circuitBreaker.lastFailure = Date.now();
    if (circuitBreaker.failures >= circuitBreaker.threshold) circuitBreaker.isOpen = true;
}

function recordSuccess() {
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
}

function isRetryableError(error) {
    const msg = (error?.message ?? '').toLowerCase();
    return (
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('overloaded') ||
        msg.includes('rate limit') ||
        msg.includes('quota')
    );
}

class Logger {
    constructor(traceId) {
        this.traceId = traceId;
        this.startTime = Date.now();
    }

    info(event, data = {}) {
        console.log(
            JSON.stringify({
                lvl: 'INFO',
                trace: this.traceId,
                ms: Date.now() - this.startTime,
                event,
                ...data,
            })
        );
    }

    warn(event, data = {}) {
        console.warn(
            JSON.stringify({
                lvl: 'WARN',
                trace: this.traceId,
                ms: Date.now() - this.startTime,
                event,
                ...data,
            })
        );
    }

    error(event, err, data = {}) {
        console.error(
            JSON.stringify({
                lvl: 'ERROR',
                trace: this.traceId,
                ms: Date.now() - this.startTime,
                event,
                err: err?.message || String(err),
                stack: err?.stack,
                ...data,
            })
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

function logAudit(supabase, traceId, intent, input, validation, attempt = 1) {
    const payload = {
        function_name: 'command-center',
        trace_id: traceId,
        intent,
        input_message: (input ?? '').slice(0, 500),
        output_text: (validation?.text ?? '').slice(0, 2000),
        validation_issues: validation?.issues?.length ?? 0,
        created_at: new Date().toISOString(),
    };

    supabase
        .from('ai_audit_logs')
        .insert(payload)
        .then(() => { })
        .catch((e) => {
            if (attempt < 2) {
                setTimeout(() => logAudit(supabase, traceId, intent, input, validation, attempt + 1), 500);
            } else {
                console.warn(`[Audit Fail] ${traceId}`, e.message);
            }
        });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
    const traceId = randomUUID();
    const logger = new Logger(traceId);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
        // PHASE 1: VALIDATION
        const env = EnvSchema.safeParse(process.env);
        if (!env.success) {
            logger.error('env_validation_failed', env.error);
            return new Response(JSON.stringify({ error: 'Service misconfigured', traceId }), {
                status: 500,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
        }

        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);
        if (!parsed.success) {
            logger.warn('invalid_request', { errors: parsed.error.errors });
            return new Response(
                JSON.stringify({ error: 'Invalid request format', details: parsed.error.errors, traceId }),
                { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
        }

        const { messages, context } = parsed.data;

        // PHASE 2: CIRCUIT BREAKER
        if (!checkCircuitBreaker()) {
            logger.warn('circuit_breaker_open');
            return new Response(
                JSON.stringify({
                    error: 'Service temporarily unavailable. Please retry in 60 seconds.',
                    retryAfter: 60,
                    traceId,
                }),
                {
                    status: 503,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Retry-After': '60' },
                }
            );
        }

        // PHASE 3: CLIENT INIT
        const supabase = createClient(env.data.SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
            global: { headers: { 'x-trace-id': traceId } },
        });

        const google = createGoogleGenerativeAI({
            apiKey: env.data.GOOGLE_GENERATIVE_AI_API_KEY,
        });

        // PHASE 4: INTENT
        const normalizedMessages = normalizeMessages(messages);
        const lastMessage = normalizedMessages.findLast((m) => m.role === 'user');
        const inputText = Array.isArray(lastMessage?.content)
            ? lastMessage.content.find((p) => p.type === 'text')?.text ?? ''
            : lastMessage?.content ?? '';

        const classification = classify({
            message: inputText || 'Multimodal Input',
            history: normalizedMessages,
        });

        logger.info('intent_classified', {
            intent: classification.intent,
            requiresTools: classification.requiresTools,
            inputLength: inputText.length,
        });

        // PHASE 5: PROMPT + TOOLS
        const systemPrompt = [
            getPromptForIntent(classification.intent),
            context ? `\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}` : '',
        ].join('');

        const tools = classification.requiresTools ? createCommandCenterTools(supabase) : undefined;

        // CRITICAL: Keep auto
        const toolChoice = 'auto';

        // PHASE 6: SOFT TIMEOUT
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            logger.warn('soft_timeout_triggered');
            abortController.abort();
        }, TIMEOUT_CONFIG.soft);

        try {
            const isBufferedIntent = [Intent.EDIT_CONTENT].includes(
                classification.intent
            );

            // Template contract applies to DRAFT_OUTREACH even in streaming path
            const needsTemplateContract = classification.intent === Intent.DRAFT_OUTREACH;

            if (isBufferedIntent) {
                logger.info('strategy_buffered');

                // ═══════════════════════════════════════════════════════════════
                // SERVER-ENFORCED TEMPLATE (Best Practice)
                // The server fetches the template — model cannot bypass this
                // ═══════════════════════════════════════════════════════════════
                const templateName = TEMPLATE_BY_INTENT[classification.intent];
                let templateContract = '';
                let preRenderedOutput = null;

                if (templateName && classification.intent === Intent.DRAFT_OUTREACH) {
                    const template = await fetchTemplate(supabase, templateName);

                    if (template) {
                        logger.info('template_fetched', { name: templateName });

                        // Check if we have enough context to render directly (skip LLM)
                        const vars = context || {};
                        const missingVars = template.variables.filter(v => !vars[v]);

                        if (missingVars.length === 0) {
                            // FAST PATH: All variables present — render without LLM
                            const subject = renderTemplate(template.subject, vars);
                            const body = renderTemplate(template.body, vars);
                            preRenderedOutput = `Subject: ${subject}\n\n${body}`;
                            logger.info('template_rendered_direct', { templateName });
                        } else {
                            // LLM PATH: Inject template as hard contract
                            templateContract = buildTemplateContract(template);
                            logger.info('template_contract_injected', {
                                templateName,
                                missingVars: missingVars.slice(0, 5)
                            });
                        }
                    } else {
                        logger.warn('template_not_found', { name: templateName });
                    }
                }

                // If pre-rendered, skip LLM entirely
                if (preRenderedOutput) {
                    clearTimeout(timeoutId);
                    const validation = validate(preRenderedOutput, { autoFix: true });
                    logAudit(supabase, traceId, classification.intent, inputText, validation);

                    return createBufferedUIResponse(validation.text, {
                        traceId,
                        status: 'template_direct',
                        issues: validation.issues ?? [],
                    });
                }

                // Build final system prompt with template contract (if present)
                const finalSystemPrompt = templateContract
                    ? systemPrompt + '\n\n' + templateContract
                    : systemPrompt;

                const result = await generateText({
                    model: google(MODEL_CONFIG.primary),
                    system: finalSystemPrompt,
                    messages: normalizedMessages,
                    tools,
                    toolChoice,
                    // v6 loop control:
                    stopWhen: stepCountIs(MODEL_CONFIG.maxSteps),
                    maxRetries: MODEL_CONFIG.maxRetries,
                    temperature: MODEL_CONFIG.temperature,
                    abortSignal: abortController.signal,
                });

                clearTimeout(timeoutId);
                recordSuccess();

                const outputText =
                    result.text ||
                    (result.toolCalls?.length > 0
                        ? `Processed using ${result.toolCalls.length} tool(s).`
                        : 'No response text generated.');

                const validation = validate(outputText, { autoFix: true });

                if (validation.text !== outputText) {
                    logger.info('auto_fixed', { issues: validation.issues.map((i) => i.id) });
                }

                logAudit(supabase, traceId, classification.intent, inputText, validation);

                logger.info('buffered_complete', {
                    valid: validation.valid,
                    issues: validation.issues?.length ?? 0,
                    textLength: validation.text.length,
                });

                // IMPORTANT: return a UI message stream response (prevents raw 0:/2: rendering)
                return createBufferedUIResponse(validation.text, {
                    traceId,
                    status: validation.valid ? 'clean' : 'flagged',
                    issues: validation.issues ?? [],
                });
            }

            // STREAMING PATH
            logger.info('strategy_streaming');

            // Template contract for DRAFT_OUTREACH (even in streaming)
            let streamingSystemPrompt = systemPrompt;
            if (needsTemplateContract) {
                const templateName = TEMPLATE_BY_INTENT[classification.intent];
                if (templateName) {
                    const template = await fetchTemplate(supabase, templateName);
                    if (template) {
                        logger.info('template_fetched', { name: templateName });
                        const templateContract = buildTemplateContract(template);
                        streamingSystemPrompt = systemPrompt + '\n\n' + templateContract;
                        logger.info('template_contract_injected_streaming', { templateName });
                    } else {
                        logger.warn('template_not_found', { name: templateName });
                    }
                }
            }

            const result = streamText({
                model: google(MODEL_CONFIG.primary),
                system: streamingSystemPrompt,
                messages: normalizedMessages,
                tools,
                toolChoice,
                // v6 loop control:
                stopWhen: stepCountIs(MODEL_CONFIG.maxSteps),
                maxRetries: MODEL_CONFIG.maxRetries,
                temperature: MODEL_CONFIG.temperature,
                abortSignal: abortController.signal,
                onError: ({ error }) => {
                    logger.error('stream_error', error);
                    recordFailure();
                },
                onFinish: async ({ text, finishReason, usage }) => {
                    clearTimeout(timeoutId);
                    recordSuccess();

                    const validation = validate(text);
                    const issues = Array.isArray(validation?.issues) ? validation.issues : [];

                    // Log detailed validation result for debugging
                    if (issues.length > 0) {
                        logger.info('validation_result', {
                            valid: !!validation?.valid,
                            issue_count: issues.length,
                            issue_ids: issues.map(i => i?.id).filter(Boolean).slice(0, 20),
                            issue_samples: issues.slice(0, 3),
                        });
                    }

                    logAudit(supabase, traceId, classification.intent, inputText, validation);

                    logger.info('stream_finish', {
                        finishReason,
                        validation_issues: issues.length,
                        text_length: text?.length ?? 0,
                        tokens: usage?.totalTokens,
                    });
                },
            });

            return asChatResponse(result, {
                headers: {
                    ...CORS_HEADERS,
                    'x-trace-id': traceId,
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                },
            });
        } catch (execError) {
            clearTimeout(timeoutId);

            if (execError?.name === 'AbortError') {
                logger.warn('request_aborted_timeout');
                return new Response(JSON.stringify({ error: 'Request timed out (55s limit).', traceId }), {
                    status: 504,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                });
            }

            if (isRetryableError(execError)) {
                recordFailure();
                logger.warn('retryable_error_fallback', { error: execError.message });

                try {
                    const fallbackResult = await generateText({
                        model: google(MODEL_CONFIG.fallback),
                        system: systemPrompt,
                        messages: normalizedMessages,
                        tools,
                        toolChoice: 'auto',
                        stopWhen: stepCountIs(MODEL_CONFIG.maxSteps),
                        maxRetries: 1,
                        temperature: MODEL_CONFIG.temperature,
                        abortSignal: abortController.signal,
                    });

                    recordSuccess();

                    const outputText =
                        fallbackResult.text ||
                        (fallbackResult.toolCalls?.length > 0
                            ? `Processed using ${fallbackResult.toolCalls.length} tool(s).`
                            : 'No response text generated.');

                    const validation = validate(outputText, { autoFix: true });
                    logAudit(supabase, traceId, classification.intent, inputText, validation);

                    logger.info('fallback_complete', { model: MODEL_CONFIG.fallback });

                    return createBufferedUIResponse(validation.text, {
                        traceId,
                        status: 'fallback',
                        issues: validation.issues ?? [],
                    });
                } catch (fallbackError) {
                    logger.error('fallback_failed', fallbackError);
                    recordFailure();
                    throw fallbackError;
                }
            }

            throw execError;
        }
    } catch (error) {
        // logger exists in this scope? It does, but keep safe:
        try {
            // eslint-disable-next-line no-undef
            logger.error('handler_failed', error);
        } catch { }

        console.error('[FULL ERROR]', error);

        let status = 500;
        let message = 'System Unavailable';
        let details;

        if (error instanceof z.ZodError) {
            status = 400;
            message = 'Invalid Request';
            details = error.errors;
        } else if (error?.message) {
            details = { message: error.message, type: error?.constructor?.name };
        }

        return new Response(JSON.stringify({ error: message, details, traceId }), {
            status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }
}
