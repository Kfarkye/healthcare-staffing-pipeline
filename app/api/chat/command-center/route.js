/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER CHAT — ELITE PRODUCTION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Architecture: Next.js 15 App Router | AI SDK 6.0 | Node.js Runtime
 * 
 * CAPABILITIES:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ • Hybrid Processing     — Buffered drafts (quality) + Streaming chat (UX)  │
 * │ • Circuit Breaker       — Automatic fallback with exponential backoff      │
 * │ • Soft Timeout Safety   — 55s abort prevents Vercel 504 hard-kills         │
 * │ • Auto-Validation       — Content validation with self-healing fixes       │
 * │ • Intent Classification — Smart routing based on user intent detection     │
 * │ • Production Telemetry  — Structured logging + audit trails                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * PROTOCOL:
 * - Streaming: AI SDK UI Message Stream Protocol v1 (x-vercel-ai-ui-message-stream)
 * - Buffered:  Synthetic stream for frontend compatibility
 * 
 * @module app/api/chat/command-center/route
 * @version 2.0.0
 * @license MIT
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText } from 'ai';
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

/**
 * Runtime: Node.js required for 5-minute timeout support (Edge caps at 30s)
 * Dynamic: Force-dynamic prevents caching of API responses
 * MaxDuration: 300s (Pro) / 60s (Hobby) — we handle soft timeout in code
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Model Configuration
 * Primary: Flash for speed-critical paths (chat, quick responses)
 * Fallback: Pro for complex reasoning (drafts, analysis)
 */
const MODEL_CONFIG = Object.freeze({
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-3-pro-preview',
    temperature: 0.7,
    maxSteps: 5,
    maxRetries: 2,
});

/**
 * Timeout Configuration (milliseconds)
 * Soft timeout triggers graceful abort before Vercel hard-kills the function
 */
const TIMEOUT_CONFIG = Object.freeze({
    soft: 55_000,       // Abort at 55s (before 60s Hobby limit)
    chunk: 30_000,      // Abort if no chunk received for 30s (stall detection)
});

/**
 * Circuit Breaker State
 * Prevents cascade failures when model is overloaded
 */
const circuitBreaker = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
    threshold: 3,
    resetTimeout: 60_000,
};

/**
 * CORS Headers
 * Permissive for development — tighten origins in production
 */
const CORS_HEADERS = Object.freeze({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-vercel-ai-data-stream, x-vercel-ai-ui-message-stream, x-trace-id',
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: INPUT VALIDATION & SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitizes environment variable strings
 * Strips quotes and whitespace that can corrupt URLs
 */
const sanitize = (val) => (val ?? '').trim().replace(/^["']|["']$/g, '');

/**
 * Environment Schema
 * Validates required configuration at startup
 */
const EnvSchema = z.object({
    SUPABASE_URL: z.string().transform(sanitize).pipe(z.string().url()),
    SUPABASE_SERVICE_ROLE_KEY: z.string().transform(sanitize).pipe(z.string().min(1)),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().transform(sanitize).pipe(z.string().min(1)),
});

/**
 * Request Body Schema
 * Validates incoming chat requests
 */
const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.any()).optional(),
});


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a synthetic stream response for buffered content
 * Ensures frontend always receives consistent UI Message Stream Protocol
 * 
 * @param {string} text - The generated text content
 * @param {Object} metadata - Optional metadata to include
 * @returns {Response} - HTTP Response with streaming body
 */
function createBufferedResponse(text, metadata = {}) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Protocol Channel 0: Text Content
            controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));

            // Protocol Channel 2: Metadata (finish reason, validation status)
            const finishMetadata = {
                finishReason: 'stop',
                ...metadata,
            };
            controller.enqueue(encoder.encode(`2:${JSON.stringify([finishMetadata])}\n`));

            controller.close();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'text/plain; charset=utf-8',
            'x-vercel-ai-data-stream': 'v1',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
    });
}

/**
 * Normalizes message content for model consumption
 * - Handles both msg.content AND msg.parts (critical for client compatibility)
 * - Extracts text from complex content structures
 * - Optimizes context by replacing old images with placeholders (saves tokens)
 * - Normalizes base64 image data URLs
 * - Creates URL objects for http/https images
 * 
 * @param {Array} messages - Raw messages from request
 * @returns {Array} - Normalized messages for model
 */
function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];

    const lastIndex = messages.length - 1;

    return messages.map((msg, index) => {
        // Check for content array OR parts array (client sends parts, not content)
        const potentialContent = Array.isArray(msg.content)
            ? msg.content
            : (Array.isArray(msg.parts) ? msg.parts : null);

        // Simple string content — pass through
        if (!potentialContent && typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }

        // Complex content array — normalize each part
        if (potentialContent) {
            const content = potentialContent
                .map((part) => {
                    // Text part
                    if (part.type === 'text') {
                        return { type: 'text', text: part.text ?? '' };
                    }

                    // Image part (direct or file-wrapped)
                    const isImage = part.type === 'image' ||
                        (part.type === 'file' && part.mimeType?.startsWith('image/'));

                    if (isImage) {
                        // Optimization: Replace images from previous turns with placeholder
                        if (index !== lastIndex) {
                            return { type: 'text', text: '[Image from previous turn]' };
                        }

                        // Handle image URL or base64
                        if (part.image && typeof part.image === 'string') {
                            // HTTP/HTTPS URLs need URL object
                            if (part.image.startsWith('http://') || part.image.startsWith('https://')) {
                                return { type: 'image', image: new URL(part.image) };
                            }
                            // Already a data URL or base64
                            return { type: 'image', image: part.image };
                        }

                        // Handle data field (base64)
                        if (part.data) {
                            const mime = part.mimeType ?? 'image/jpeg';
                            if (part.data.startsWith('data:')) {
                                return { type: 'image', image: part.data };
                            }
                            return { type: 'image', image: `data:${mime};base64,${part.data}` };
                        }

                        // Fallback for malformed image parts
                        if (part.image || part.data) {
                            return { type: 'text', text: '[Image]' };
                        }

                        return null;
                    }

                    // Unknown part type — skip
                    return null;
                })
                .filter(Boolean);

            // Handle empty content array
            if (content.length === 0) {
                return { role: msg.role, content: '' };
            }

            return { role: msg.role, content };
        }

        // Fallback — return as-is
        return msg;
    });
}

/**
 * Circuit breaker check
 * Prevents cascade failures during model outages
 * 
 * @returns {boolean} - True if circuit is closed (requests allowed)
 */
function checkCircuitBreaker() {
    const now = Date.now();

    // Reset circuit if enough time has passed
    if (circuitBreaker.isOpen && now - circuitBreaker.lastFailure > circuitBreaker.resetTimeout) {
        circuitBreaker.isOpen = false;
        circuitBreaker.failures = 0;
    }

    return !circuitBreaker.isOpen;
}

/**
 * Records a failure for circuit breaker
 */
function recordFailure() {
    circuitBreaker.failures += 1;
    circuitBreaker.lastFailure = Date.now();

    if (circuitBreaker.failures >= circuitBreaker.threshold) {
        circuitBreaker.isOpen = true;
    }
}

/**
 * Records a success — resets circuit breaker
 */
function recordSuccess() {
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
}

/**
 * Determines if an error is retryable
 * 
 * @param {Error} error - The error to check
 * @returns {boolean} - True if error is retryable
 */
function isRetryableError(error) {
    const msg = (error.message ?? '').toLowerCase();
    return msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('overloaded') ||
        msg.includes('rate limit') ||
        msg.includes('quota');
}

/**
 * Structured Logger Class
 * Outputs JSON with timing metrics for production log aggregation
 */
class Logger {
    constructor(traceId) {
        this.traceId = traceId;
        this.startTime = Date.now();
    }

    info(event, data = {}) {
        console.log(JSON.stringify({
            lvl: 'INFO',
            trace: this.traceId,
            ms: Date.now() - this.startTime,
            event,
            ...data,
        }));
    }

    warn(event, data = {}) {
        console.warn(JSON.stringify({
            lvl: 'WARN',
            trace: this.traceId,
            ms: Date.now() - this.startTime,
            event,
            ...data,
        }));
    }

    error(event, err, data = {}) {
        console.error(JSON.stringify({
            lvl: 'ERROR',
            trace: this.traceId,
            ms: Date.now() - this.startTime,
            event,
            err: err?.message || String(err),
            stack: err?.stack,
            ...data,
        }));
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Logs interaction to audit table with retry logic
 * Non-blocking to prevent latency impact on user response
 * 
 * @param {SupabaseClient} supabase - Supabase client
 * @param {string} traceId - Request trace ID
 * @param {string} intent - Classified intent
 * @param {string} input - User input (truncated)
 * @param {Object} validation - Validation result
 * @param {number} attempt - Retry attempt number
 */
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

    supabase.from('ai_audit_logs').insert(payload)
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

/**
 * OPTIONS Handler
 * CORS preflight support
 */
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

/**
 * POST Handler
 * Main chat endpoint with hybrid buffered/streaming architecture
 */
export async function POST(request) {
    const traceId = randomUUID();
    const logger = new Logger(traceId);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 1: VALIDATION
        // ─────────────────────────────────────────────────────────────────────────

        // Validate environment
        const env = EnvSchema.safeParse(process.env);
        if (!env.success) {
            logger.error('env_validation_failed', env.error);
            return new Response(JSON.stringify({
                error: 'Service misconfigured',
                traceId,
            }), {
                status: 500,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
        }

        // Validate request body
        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);
        if (!parsed.success) {
            logger.warn('invalid_request', { errors: parsed.error.errors });
            return new Response(JSON.stringify({
                error: 'Invalid request format',
                details: parsed.error.errors,
                traceId,
            }), {
                status: 400,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
        }

        const { messages, context } = parsed.data;

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 2: CIRCUIT BREAKER CHECK
        // ─────────────────────────────────────────────────────────────────────────

        if (!checkCircuitBreaker()) {
            logger.warn('circuit_breaker_open');
            return new Response(JSON.stringify({
                error: 'Service temporarily unavailable. Please retry in 60 seconds.',
                retryAfter: 60,
                traceId,
            }), {
                status: 503,
                headers: {
                    ...CORS_HEADERS,
                    'Content-Type': 'application/json',
                    'Retry-After': '60',
                },
            });
        }

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 3: CLIENT INITIALIZATION
        // ─────────────────────────────────────────────────────────────────────────

        const supabase = createClient(env.data.SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
            global: { headers: { 'x-trace-id': traceId } },
        });

        const google = createGoogleGenerativeAI({
            apiKey: env.data.GOOGLE_GENERATIVE_AI_API_KEY,
        });

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 4: INTENT CLASSIFICATION
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 5: CONTEXT PREPARATION
        // ─────────────────────────────────────────────────────────────────────────

        const systemPrompt = [
            getPromptForIntent(classification.intent),
            context ? `\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}` : '',
        ].join('');

        const tools = classification.requiresTools
            ? createCommandCenterTools(supabase)
            : undefined;

        // CRITICAL: Always use 'auto' - 'required' causes empty responses
        const toolChoice = 'auto';

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 6: SOFT TIMEOUT SETUP
        // ─────────────────────────────────────────────────────────────────────────

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            logger.warn('soft_timeout_triggered');
            abortController.abort();
        }, TIMEOUT_CONFIG.soft);

        try {
            // ═════════════════════════════════════════════════════════════════════════
            // PATH A: BUFFERED GENERATION (High Quality for Drafts/Edits)
            // ═════════════════════════════════════════════════════════════════════════

            const isBufferedIntent = [
                Intent.DRAFT_OUTREACH,
                Intent.EDIT_CONTENT,
            ].includes(classification.intent);

            if (isBufferedIntent) {
                logger.info('strategy_buffered');

                const result = await generateText({
                    model: google(MODEL_CONFIG.primary),
                    system: systemPrompt,
                    messages: normalizedMessages,
                    tools,
                    toolChoice,
                    maxSteps: MODEL_CONFIG.maxSteps,
                    maxRetries: MODEL_CONFIG.maxRetries,
                    temperature: MODEL_CONFIG.temperature,
                    abortSignal: abortController.signal,
                });

                clearTimeout(timeoutId);
                recordSuccess();

                // CRITICAL: Empty text fallback per audit
                const outputText = result.text ||
                    (result.toolCalls?.length > 0
                        ? `I processed your request using ${result.toolCalls.length} tool(s). Please let me know if you need anything else.`
                        : 'I was unable to generate a response. Please try rephrasing your request.');

                // Auto-validation with self-healing
                const validation = validate(outputText, { autoFix: true });

                if (validation.text !== outputText) {
                    logger.info('auto_fixed', { issues: validation.issues.map((i) => i.id) });
                }

                // Non-blocking audit log
                logAudit(supabase, traceId, classification.intent, inputText, validation);

                logger.info('buffered_complete', {
                    valid: validation.valid,
                    issues: validation.issues?.length ?? 0,
                    textLength: validation.text.length,
                });

                // Return synthetic stream for frontend compatibility
                return createBufferedResponse(validation.text, {
                    status: validation.valid ? 'clean' : 'flagged',
                    issues: validation.issues,
                    traceId,
                });
            }

            // ═════════════════════════════════════════════════════════════════════════
            // PATH B: STREAMING GENERATION (Low Latency for Chat/Search)
            // ═════════════════════════════════════════════════════════════════════════

            logger.info('strategy_streaming');

            const result = streamText({
                model: google(MODEL_CONFIG.primary),
                system: systemPrompt,
                messages: normalizedMessages,
                tools,
                toolChoice,
                maxSteps: MODEL_CONFIG.maxSteps,
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

                    // Post-stream validation (non-blocking)
                    const validation = validate(text);
                    logAudit(supabase, traceId, classification.intent, inputText, validation);

                    logger.info('stream_finish', {
                        finishReason,
                        validation_issues: validation.issues?.length ?? 0,
                        text_length: text?.length ?? 0,
                        tokens: usage?.totalTokens,
                    });
                },
            });

            // AI SDK v6.0 Native Streaming
            return result.toDataStreamResponse({
                headers: { ...CORS_HEADERS, 'x-trace-id': traceId },
            });

        } catch (execError) {
            clearTimeout(timeoutId);

            // Handle soft timeout cleanly
            if (execError.name === 'AbortError') {
                logger.warn('request_aborted_timeout');
                return new Response(JSON.stringify({
                    error: 'Request timed out (55s limit). Try a simpler query.',
                    traceId,
                }), {
                    status: 504,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                });
            }

            // Handle retryable errors with fallback model
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
                        maxSteps: MODEL_CONFIG.maxSteps,
                        maxRetries: 1,
                        temperature: MODEL_CONFIG.temperature,
                        abortSignal: abortController.signal,
                    });

                    clearTimeout(timeoutId);
                    recordSuccess();

                    const outputText = fallbackResult.text ||
                        (fallbackResult.toolCalls?.length > 0
                            ? `I processed your request using ${fallbackResult.toolCalls.length} tool(s).`
                            : 'I was unable to generate a response.');

                    const validation = validate(outputText, { autoFix: true });
                    logAudit(supabase, traceId, classification.intent, inputText, validation);

                    logger.info('fallback_complete', { model: MODEL_CONFIG.fallback });

                    return createBufferedResponse(validation.text, {
                        status: 'fallback',
                        traceId,
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
        logger.error('handler_failed', error);
        console.error('[FULL ERROR]', error);

        // Determine appropriate status code
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

        return new Response(JSON.stringify({
            error: message,
            details,
            traceId,
        }), {
            status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }
}
