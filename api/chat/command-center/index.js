/**
 * Command Center Chat - Production Service (v5.3)
 * 
 * Architecture: Hybrid "Safety Net" Agent (Node.js)
 * - Reliability: Auto-sanitizes Environment Variables (Fixes "Invalid URL")
 * - Config: Uses correct App Router exports (Fixes 60s Timeout)
 * - Safety: Implements Soft Timeout (55s) to prevent platform hard-crashes
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
// 1. APP ROUTER CONFIGURATION (CRITICAL)
// ============================================================================

// Next.js App Router IGNORES 'export const config'. You must use named exports.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Note: On Hobby Plan, maxDuration is capped at 60s regardless of this setting.
export const maxDuration = 300;

const MODEL_CONFIG = {
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-1.5-pro',
    temperature: 0.7,
    maxSteps: 5,
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-vercel-ai-data-stream, x-trace-id',
};

// ============================================================================
// 2. ROBUST VALIDATION & SANITIZATION
// ============================================================================

// Helper: Strips quotes and whitespace from env vars (Fixes "Invalid URL" crash)
const cleanEnv = (val) => (val || '').trim().replace(/^["']|["']$/g, '');

const EnvSchema = z.object({
    // Transform input BEFORE validation to fix quotes issue
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
            err: err.message || err
        }));
    }
}

/**
 * Creates a "Fake" Stream response for buffered content.
 * Protocol: Vercel AI Data Stream v1 (0:"text")
 */
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
        if (typeof msg.content === 'string') return { role: msg.role, content: msg.content };

        // Handle Multimodal Content
        if (Array.isArray(msg.content)) {
            const content = msg.content.map(part => {
                if (part.type === 'text') return { type: 'text', text: part.text };

                // Context Pruning: Remove old images to save tokens/time
                if (part.type === 'image' || (part.type === 'file' && part.mimeType?.startsWith('image/'))) {
                    if (index !== lastIndex) return { type: 'text', text: '[Image from previous turn]' };

                    const mime = part.mimeType || 'image/jpeg';
                    const dataUrl = part.data?.startsWith('data:')
                        ? part.data
                        : `data:${mime};base64,${part.data || part.image}`;
                    return { type: 'image', image: dataUrl };
                }
                return null;
            }).filter(Boolean);
            return { role: msg.role, content };
        }
        return msg;
    });
}

// ============================================================================
// 4. MAIN HANDLER (POST)
// ============================================================================

export async function POST(req) {
    const traceId = randomUUID();
    const logger = new Logger(traceId);

    // 1. CORS Preflight
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    try {
        // 2. Validate Environment (Safe against dirty .env inputs)
        const env = EnvSchema.parse(process.env);

        // 3. Parse Request
        let json;
        try {
            json = await req.json();
        } catch (e) {
            throw new z.ZodError([{ code: 'invalid_type', path: ['body'], message: 'Invalid JSON body' }]);
        }
        const { messages, context } = RequestSchema.parse(json);

        // 4. Infrastructure
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }, // CRITICAL: Prevents Node process hang
            global: { headers: { 'x-trace-id': traceId } }
        });
        const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });

        // 5. Classification
        const normalizedMsgs = normalizeMessages(messages);
        const lastMsg = normalizedMsgs.findLast(m => m.role === 'user');
        const inputContent = Array.isArray(lastMsg.content)
            ? lastMsg.content.find(p => p.type === 'text')?.text || ''
            : lastMsg.content;

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

        // 6. SAFETY: Software Timeout (55s)
        // This aborts the AI call before Vercel kills the whole function (Hobby Limit: 60s)
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), 55000);

        try {
            // ====================================================================
            // STRATEGY A: BUFFERED (Drafts/Edits)
            // ====================================================================
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

                // Auto-Fix Pipeline
                const validation = validate(result.text, { autoFix: true });

                if (validation.text !== result.text) {
                    logger.info('auto_fixed', { issues: validation.issues.map(i => i.code) });
                }

                // Audit Log (Awaited for reliability)
                await logAudit(supabase, traceId, classification.intent, inputContent, validation);

                return createBufferedStreamResponse(validation.text, {
                    status: validation.valid ? 'clean' : 'flagged',
                    issues: validation.issues
                });
            }

            // ====================================================================
            // STRATEGY B: STREAMING (Chat/Search)
            // ====================================================================
            else {
                logger.info('strategy_streaming');

                const result = await streamText({
                    model: google(MODEL_CONFIG.primary),
                    system: systemPrompt,
                    messages: normalizedMsgs,
                    tools,
                    toolChoice,
                    maxSteps: MODEL_CONFIG.maxSteps,
                    abortSignal: timeoutController.signal,
                    onFinish: async ({ text }) => {
                        clearTimeout(timeoutId);
                        const validation = validate(text);
                        await logAudit(supabase, traceId, classification.intent, inputContent, validation);
                        logger.info('stream_finish', { validation_issues: validation.issues.length });
                    }
                });

                return result.toDataStreamResponse({ headers: CORS_HEADERS });
            }
        } catch (execError) {
            clearTimeout(timeoutId);
            throw execError;
        }

    } catch (error) {
        logger.error('handler_failed', error);

        let status = 500;
        let message = 'System Unavailable';
        let details = undefined;

        if (error instanceof z.ZodError) {
            status = 400;
            message = 'Configuration Error';
            details = error.errors;
        } else if (error.name === 'AbortError') {
            status = 504;
            message = 'Request timed out (Limit: 55s). Try a simpler query.';
        }

        return new Response(JSON.stringify({ error: message, details, traceId }), {
            status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }
}

// Helper: Audit Logging
async function logAudit(supabase, traceId, intent, input, validation) {
    try {
        await supabase.from('ai_audit_logs').insert({
            function_name: 'command-center',
            trace_id: traceId,
            intent: intent,
            input_message: (input || '').slice(0, 500),
            output_text: validation.text,
            validation_issues: validation.issues.length,
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn(`[Audit Fail] ${traceId}`, e.message);
    }
}

// Default export for Vercel API Routes (Pages Router compatibility)
export default async function handler(req, res) {
    return POST(req);
}
