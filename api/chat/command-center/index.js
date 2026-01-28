/**
 * Command Center Chat - Production Service (v5.4)
 * 
 * Architecture: Hybrid "Safety Net" Agent
 * - Runtime: Node.js (Pages Router config)
 * - Strategy: Buffered for Drafts, Streaming for Chat
 * - Safety: Soft Timeout (55s), Auto-fix placeholders
 * 
 * NOTE: This file is in /api/ which uses PAGES ROUTER, not App Router.
 * - Use `export const config` for runtime settings
 * - Body is auto-parsed, use `req.body` not `req.json()`
 * 
 * @module api/chat/command-center
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

// Modular components
import { createCommandCenterTools } from './tools.js';
import { classify, Intent } from './lib/router.js';
import { getPromptForIntent } from './lib/prompts.js';
import { validate } from './lib/validator.js';

// ============================================================================
// 1. PAGES ROUTER CONFIGURATION
// ============================================================================

// CRITICAL: Pages Router uses this syntax, NOT named exports
export const config = {
    api: {
        bodyParser: true, // Let Vercel parse JSON for us
        responseLimit: false, // No response size limit for streaming
    },
    // Note: maxDuration only works on Pro plan. Hobby is capped at 60s.
    maxDuration: 300,
};

const MODEL_CONFIG = {
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-1.5-pro',
    temperature: 0.7,
    maxSteps: 5,
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================================================
// 2. VALIDATION & SANITIZATION
// ============================================================================

const cleanEnv = (val) => (val || '').trim().replace(/^["']|["']$/g, '');

const EnvSchema = z.object({
    SUPABASE_URL: z.string().transform(cleanEnv).pipe(z.string().url()),
    SUPABASE_SERVICE_ROLE_KEY: z.string().transform(cleanEnv).pipe(z.string().min(1)),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().transform(cleanEnv).pipe(z.string().min(1)),
});

const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.any()).optional(),
});

// ============================================================================
// 3. UTILITIES
// ============================================================================

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
            ...data
        }));
    }

    error(event, err) {
        console.error(JSON.stringify({
            lvl: 'ERROR',
            trace: this.traceId,
            event,
            err: err?.message || String(err)
        }));
    }
}

function createBufferedStreamResponse(text, metadata = {}) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
            if (Object.keys(metadata).length > 0) {
                controller.enqueue(encoder.encode(`2:${JSON.stringify([metadata])}\n`));
            }
            controller.close();
        }
    });

    return new Response(stream, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'x-vercel-ai-data-stream': 'v1' }
    });
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const lastIndex = messages.length - 1;

    return messages.map((msg, index) => {
        // Simple text content - pass through
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }

        // Multimodal content array
        if (Array.isArray(msg.content)) {
            const content = msg.content.map(part => {
                // Text part
                if (part.type === 'text') {
                    return { type: 'text', text: part.text || '' };
                }

                // Image or File with image mimeType
                if (part.type === 'image' || (part.type === 'file' && part.mimeType?.startsWith('image/'))) {
                    // Context Pruning: Replace old images with placeholder text
                    if (index !== lastIndex) {
                        return { type: 'text', text: '[Image from previous turn]' };
                    }

                    // Handle URL-based images
                    if (part.image && typeof part.image === 'string') {
                        if (part.image.startsWith('http://') || part.image.startsWith('https://')) {
                            return { type: 'image', image: new URL(part.image) };
                        }
                        // Already a data URL or base64
                        return { type: 'image', image: part.image };
                    }

                    // Handle base64 data
                    if (part.data) {
                        const mime = part.mimeType || 'image/jpeg';
                        if (part.data.startsWith('data:')) {
                            return { type: 'image', image: part.data };
                        }
                        // Raw base64 - prefix with data URL
                        return { type: 'image', image: `data:${mime};base64,${part.data}` };
                    }

                    // Fallback: skip invalid image parts
                    return null;
                }

                // Unknown part type - skip
                return null;
            }).filter(Boolean);

            // If all parts were filtered out, return empty string content
            if (content.length === 0) {
                return { role: msg.role, content: '' };
            }

            return { role: msg.role, content };
        }

        // Unknown format - pass through
        return msg;
    });
}

// ============================================================================
// 4. MAIN HANDLER (Pages Router Style)
// ============================================================================

export default async function handler(req, res) {
    const traceId = randomUUID();
    const logger = new Logger(traceId);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 2. Validate Environment
        const env = EnvSchema.parse(process.env);

        // 3. Parse Request (Pages Router auto-parses JSON into req.body)
        const { messages, context } = RequestSchema.parse(req.body);

        // 4. Infrastructure
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
            global: { headers: { 'x-trace-id': traceId } }
        });
        const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });

        // 5. Classification
        const normalizedMsgs = normalizeMessages(messages);
        const lastMsg = normalizedMsgs.findLast(m => m.role === 'user');
        const inputContent = Array.isArray(lastMsg?.content)
            ? lastMsg.content.find(p => p.type === 'text')?.text || ''
            : lastMsg?.content || '';

        const classification = classify({
            message: inputContent || 'Multimodal Input',
            history: normalizedMsgs,
        });

        logger.info('intent_classified', { intent: classification.intent });

        const systemPrompt = getPromptForIntent(classification.intent) +
            (context ? `\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}` : '');

        const tools = classification.requiresTools ? createCommandCenterTools(supabase) : undefined;

        const toolChoice = [
            Intent.DRAFT_OUTREACH,
            Intent.DATABASE_ACTION,
            Intent.CAMPAIGN_WORKFLOW,
            Intent.SEARCH_QUERY
        ].includes(classification.intent) ? 'required' : 'auto';

        // 6. Soft Timeout (55s)
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), 55000);

        try {
            // ================================================================
            // STRATEGY A: BUFFERED (Drafts/Edits)
            // ================================================================
            if (classification.intent === Intent.DRAFT_OUTREACH || classification.intent === Intent.EDIT_CONTENT) {
                logger.info('strategy_buffered');

                const result = await generateText({
                    model: google(MODEL_CONFIG.primary),
                    system: systemPrompt,
                    messages: normalizedMsgs,
                    tools,
                    toolChoice,
                    maxSteps: MODEL_CONFIG.maxSteps,
                    abortSignal: timeoutController.signal,
                });

                clearTimeout(timeoutId);

                const validation = validate(result.text, { autoFix: true });

                if (validation.text !== result.text) {
                    logger.info('auto_fixed', { issues: validation.issues.map(i => i.code) });
                }

                logAudit(supabase, traceId, classification.intent, inputContent, validation);

                // Return as buffered stream for useChat compatibility
                const response = createBufferedStreamResponse(validation.text, {
                    status: validation.valid ? 'clean' : 'flagged',
                    issues: validation.issues
                });

                // Convert Web Response to Node.js response
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.setHeader('x-vercel-ai-data-stream', 'v1');
                res.status(200);

                const reader = response.body.getReader();
                const pump = async () => {
                    const { done, value } = await reader.read();
                    if (done) {
                        res.end();
                        return;
                    }
                    res.write(value);
                    await pump();
                };
                await pump();
                return;
            }

            // ================================================================
            // STRATEGY B: STREAMING (Chat/Search)
            // ================================================================
            else {
                logger.info('strategy_streaming');

                const result = streamText({
                    model: google(MODEL_CONFIG.primary),
                    system: systemPrompt,
                    messages: normalizedMsgs,
                    tools,
                    toolChoice,
                    maxSteps: MODEL_CONFIG.maxSteps,
                    abortSignal: timeoutController.signal,
                });

                // Manual Data Stream Protocol for Pages Router + useChat compatibility
                // Protocol: 0:"text chunk"\n (each chunk is JSON-stringified)
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.setHeader('x-vercel-ai-data-stream', 'v1');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.status(200);

                let fullText = '';

                try {
                    // Stream text chunks in Data Stream Protocol format
                    for await (const textPart of result.textStream) {
                        fullText += textPart;
                        // Data Stream Protocol: 0 is the text channel
                        res.write(`0:${JSON.stringify(textPart)}\n`);
                    }

                    clearTimeout(timeoutId);

                    // Log and audit after stream completes
                    const validation = validate(fullText);
                    logAudit(supabase, traceId, classification.intent, inputContent, validation);
                    logger.info('stream_finish', { validation_issues: validation.issues.length });

                } catch (streamError) {
                    // Send error in Data Stream Protocol format
                    res.write(`3:${JSON.stringify(streamError.message || 'Stream error')}\n`);
                    logger.error('stream_error', streamError);
                }

                res.end();
                return;
            }
        } catch (execError) {
            clearTimeout(timeoutId);
            throw execError;
        }

    } catch (error) {
        logger.error('handler_failed', error);

        // Log full error for debugging
        console.error('[FULL ERROR]', error);
        console.error('[STACK]', error?.stack);

        let status = 500;
        let message = 'System Unavailable';
        let details = undefined;
        let errorType = error?.constructor?.name || 'Unknown';

        if (error instanceof z.ZodError) {
            status = 400;
            message = 'Invalid Request';
            details = error.errors;
            errorType = 'ZodError';
        } else if (error?.name === 'AbortError') {
            status = 504;
            message = 'Request timed out (55s limit). Try a simpler query.';
            errorType = 'AbortError';
        } else if (error?.message) {
            // Include actual error message for debugging
            details = {
                message: error.message,
                type: errorType,
                // Only include stack in non-production for security
                ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
            };
        }

        return res.status(status).json({ error: message, details, traceId, errorType });
    }
}

// Helper: Audit Logging (Fire and forget)
function logAudit(supabase, traceId, intent, input, validation) {
    supabase.from('ai_audit_logs').insert({
        function_name: 'command-center',
        trace_id: traceId,
        intent: intent,
        input_message: (input || '').slice(0, 500),
        output_text: validation.text,
        validation_issues: validation.issues.length,
        created_at: new Date().toISOString()
    }).then(() => { }).catch(e => console.warn(`[Audit Fail] ${traceId}`, e.message));
}
