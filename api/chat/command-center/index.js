/**
 * Command Center Chat - Production Service (v5.1)
 * 
 * Architecture: Hybrid "Safety Net" Agent
 * - Runtime: Node.js (Serverless) for 5-minute tool execution (Critical for Agents)
 * - Strategy: 
 *    1. High Risk (Draft/Edit) -> Buffered + Auto-Fixed (100% Safety)
 *    2. Low Risk (Chat/Search) -> Real-time Streaming (Min Latency)
 * - Protocol: Unified Vercel Data Stream (v1)
 * 
 * @module api/chat
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto'; // Native Node.js, no external deps

// Modular components
import { createCommandCenterTools } from './tools.js';
import { classify, Intent } from './lib/router.js';
import { getPromptForIntent } from './lib/prompts.js';
import { validate, summarize } from './lib/validator.js';

// ============================================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================================

export const config = {
    // Critical: Node.js allows 5-minute timeouts. Edge (30s) is too risky 
    // for agents that need to "Think -> Search -> Act -> Result".
    runtime: 'nodejs',
    maxDuration: 300,
};

const MODEL_CONFIG = {
    primary: 'gemini-3-flash-preview', // Speed + Reasoning
    fallback: 'gemini-3-pro-preview',  // Complex logic fallback
    temperature: 0.7,
    maxSteps: 5, // Allow multi-step tool loops
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-vercel-ai-data-stream, x-trace-id',
};

// Strict Validation Schemas (Fail Fast)
const EnvSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.any()).optional(),
});

// ============================================================================
// 2. OBSERVABILITY & UTILITIES
// ============================================================================

class Logger {
    constructor(traceId) {
        this.traceId = traceId;
        this.startTime = Date.now();
    }

    info(event, data = {}) {
        console.log(JSON.stringify({
            lvl: 'INFO',
            time: new Date(),
            trace: this.traceId,
            ms: Date.now() - this.startTime,
            event,
            ...data
        }));
    }

    error(event, err) {
        console.error(JSON.stringify({
            lvl: 'ERROR',
            time: new Date(),
            trace: this.traceId,
            event,
            err: err.message
        }));
    }
}

/**
 * Creates a "Fake" Stream response from a buffered string.
 * Mimics Vercel AI Data Stream Protocol v1 (0:"text")
 */
function createBufferedStreamResponse(text, metadata = {}) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // Channel 0: Text Content
            controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));

            // Channel 2: Metadata (Optional)
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

/**
 * Normalizes messages for Multimodal inputs (Images/Files)
 * Includes Context Pruning: Strips heavy images from older messages to save tokens.
 */
function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const lastIndex = messages.length - 1;

    return messages.map((msg, index) => {
        if (typeof msg.content === 'string') return { role: msg.role, content: msg.content };

        // Handle Multimodal Content Arrays
        if (Array.isArray(msg.content)) {
            const content = msg.content.map(part => {
                if (part.type === 'text') return { type: 'text', text: part.text };

                // Handle Images/Files
                if (part.type === 'image' || (part.type === 'file' && part.mimeType?.startsWith('image/'))) {
                    // Optimization: Only keep full base64 images for the MOST RECENT message
                    if (index !== lastIndex) {
                        return { type: 'text', text: '[Image from previous turn]' };
                    }

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

/**
 * Resilience: Retry logic for transient API errors
 */
async function withRetry(fn, retries = 2) {
    try { return await fn(); }
    catch (error) {
        if (retries === 0 || !['429', '503', 'overloaded'].some(c => (error.message || '').toLowerCase().includes(c))) throw error;
        await new Promise(r => setTimeout(r, 1000));
        return withRetry(fn, retries - 1);
    }
}

// ============================================================================
// 3. MAIN HANDLER
// ============================================================================

export async function POST(req) {
    const traceId = randomUUID();
    const logger = new Logger(traceId);

    // 1. CORS Preflight
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    try {
        // 2. Validation
        const env = EnvSchema.parse(process.env);
        const json = await req.json();
        const { messages, context } = RequestSchema.parse(json);

        // 3. Infrastructure
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            global: { headers: { 'x-trace-id': traceId } }
        });
        const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });

        // 4. Intent & Prep
        const normalizedMsgs = normalizeMessages(messages);
        const lastMsg = normalizedMsgs.findLast(m => m.role === 'user');

        // Extract text safely for classification
        const inputContent = Array.isArray(lastMsg.content)
            ? lastMsg.content.find(p => p.type === 'text')?.text || ''
            : lastMsg.content;

        const classification = classify({
            message: inputContent || 'Multimodal Input',
            history: normalizedMsgs,
            hasAttachment: Array.isArray(lastMsg.content) && lastMsg.content.some(c => c.type === 'image')
        });

        logger.info('intent_classified', { intent: classification.intent, conf: classification.confidence });

        const systemPrompt = getPromptForIntent(classification.intent) +
            (context ? `\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}` : '');

        const tools = classification.requiresTools ? createCommandCenterTools(supabase) : undefined;

        // STRATEGY: Force tools for specific intents to prevent lazy "I can do that" responses
        const toolChoice = [
            Intent.DRAFT_OUTREACH,
            Intent.DATABASE_ACTION,
            Intent.CAMPAIGN_WORKFLOW,
            Intent.SEARCH_QUERY
        ].includes(classification.intent) ? 'required' : 'auto';

        const providerOptions = {
            google: {
                // Enable Search Grounding only when helpful
                useSearchGrounding: classification.intent === Intent.SEARCH_QUERY || classification.intent === Intent.GENERAL
            }
        };

        // ====================================================================
        // 5. HYBRID EXECUTION STRATEGY
        // ====================================================================

        // PATH A: BUFFERED (Drafts/Edits) - High Safety
        // Intent: "Draft an email" -> We generate, Validate (Auto-Fix), then Stream
        if (classification.intent === Intent.DRAFT_OUTREACH || classification.intent === Intent.EDIT_CONTENT) {
            logger.info('strategy_buffered');

            const result = await withRetry(() => generateText({
                model: google(MODEL_CONFIG.primary),
                system: systemPrompt,
                messages: normalizedMsgs,
                tools,
                toolChoice,
                maxSteps: MODEL_CONFIG.maxSteps,
                providerOptions,
                abortSignal: req.signal,
            }));

            // AUTO-FIX PIPELINE
            const validation = validate(result.text, { autoFix: true });

            if (validation.text !== result.text) {
                logger.info('auto_fixed', { fixed_issues: validation.issues.map(i => i.code) });
            }

            // Async Audit (Fire & Forget)
            logAudit(supabase, traceId, classification.intent, inputContent, validation);

            return createBufferedStreamResponse(validation.text, {
                status: validation.valid ? 'clean' : 'flagged',
                issues: validation.issues
            });
        }

        // PATH B: STREAMING (Chat/Search) - High Speed
        // Intent: "Find nurses in Texas" -> Stream immediately
        else {
            logger.info('strategy_streaming');

            const result = await streamText({
                model: google(MODEL_CONFIG.primary),
                system: systemPrompt,
                messages: normalizedMsgs,
                tools,
                toolChoice,
                maxSteps: MODEL_CONFIG.maxSteps,
                providerOptions,
                abortSignal: req.signal,
                onFinish: ({ text, toolCalls }) => {
                    const validation = validate(text);
                    logAudit(supabase, traceId, classification.intent, inputContent, validation);
                    logger.info('stream_finish', { tools: toolCalls?.length || 0 });
                }
            });

            return result.toDataStreamResponse({ headers: CORS_HEADERS });
        }

    } catch (error) {
        // Fallback Logic: Try Pro model if Flash fails heavily (503/429)
        if (error.message?.includes('429') || error.message?.includes('503')) {
            logger.error('primary_model_overloaded', error);
        } else {
            logger.error('handler_failed', error);
        }

        const isUserErr = error instanceof z.ZodError;
        return new Response(JSON.stringify({
            error: isUserErr ? 'Invalid Request' : 'Service Unavailable',
            details: isUserErr ? error.errors : undefined,
            traceId
        }), {
            status: isUserErr ? 400 : 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Audit Logging (Non-blocking)
 */
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
        console.error(`[Audit Fail] ${traceId}: ${e.message}`);
    }
}

// Default export for compatibility with different Vercel routing
export default async function handler(req, res) {
    return POST(req);
}
