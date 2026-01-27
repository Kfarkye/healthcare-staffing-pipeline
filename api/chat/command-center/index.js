/**
 * Command Center Chat - Vercel Edge Function (v5.0 Agentic Architecture)
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  User Request                                                       │
 * │       ↓                                                             │
 * │  ┌─────────────┐                                                    │
 * │  │   ROUTER    │ ← Classifies intent (edit, draft, search, etc.)   │
 * │  └─────────────┘                                                    │
 * │       ↓                                                             │
 * │  ┌─────────────┐                                                    │
 * │  │   PROMPTS   │ ← Loads specialized persona for the intent        │
 * │  └─────────────┘                                                    │
 * │       ↓                                                             │
 * │  ┌─────────────┐                                                    │
 * │  │   GEMINI    │ ← Executes with focused prompt + relevant tools   │
 * │  └─────────────┘                                                    │
 * │       ↓                                                             │
 * │  ┌─────────────┐                                                    │
 * │  │  VALIDATOR  │ ← Catches placeholders, banned phrases            │
 * │  └─────────────┘                                                    │
 * │       ↓                                                             │
 * │  User Response                                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * @version 5.0.0 - Agentic Architecture
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText } from 'ai';
import { createClient } from '@supabase/supabase-js';

// Modular components
import { createCommandCenterTools } from './tools.js';
import { classify, describeIntent, Intent } from './lib/router.js';
import { getPromptForIntent, RECRUITER_IDENTITY } from './lib/prompts.js';
import { validate, summarize } from './lib/validator.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const config = {
    runtime: 'edge',
    maxDuration: 60,
};

/** Model configuration */
const MODEL_CONFIG = {
    primary: 'gemini-3-flash-preview',
    fallback: 'gemini-3-pro-preview',
    temperature: 0.7,  // Lower than default 1.0 for more consistent behavior
    maxTokens: 4096,
};

/** Safety Settings for Healthcare Context */
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
];

/** Thinking Configuration for Gemini 3 */
const THINKING_CONFIG = {
    thinkingLevel: 'high',
    includeThoughts: false,
};

/** Message history limits */
const MAX_HISTORY_LENGTH = 12;
const MAX_TOOL_STEPS = 5;

// ============================================================================
// UTILITIES
// ============================================================================

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function errorResponse(message, status = 500, details = null) {
    return new Response(JSON.stringify({ error: message, details }), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

function isRetryableError(error) {
    const msg = error?.message?.toLowerCase() || '';
    return /429|503|overloaded|rate.?limit|quota|temporarily.?unavailable/.test(msg);
}

/**
 * Extract the last user message text for routing
 */
function getLastUserMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            const content = messages[i].content;
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) {
                const textPart = content.find(p => p.type === 'text');
                return textPart?.text || '';
            }
        }
    }
    return '';
}

/**
 * Check if messages contain attachments
 */
function hasAttachments(messages) {
    const lastUser = messages.findLast(m => m.role === 'user');
    if (!lastUser || !Array.isArray(lastUser.content)) return false;
    return lastUser.content.some(p => p.type === 'image' || p.type === 'file');
}

/**
 * Truncate history to prevent context overflow
 */
function truncateHistory(messages, maxLimit = MAX_HISTORY_LENGTH) {
    if (!messages || messages.length <= maxLimit) return messages;
    return [messages[0], ...messages.slice(-maxLimit + 1)];
}

/**
 * Strip base64 images from older messages to prevent timeout
 */
function stripImagesFromOldMessages(messages) {
    if (!messages || messages.length < 2) return messages;

    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            lastUserIndex = i;
            break;
        }
    }

    return messages.map((msg, index) => {
        if (index === lastUserIndex) return msg;

        if (Array.isArray(msg.content)) {
            const hasImages = msg.content.some(part =>
                part.type === 'image' ||
                (part.type === 'file' && part.mediaType?.startsWith('image'))
            );

            if (hasImages) {
                const strippedContent = msg.content.map(part => {
                    if (part.type === 'image' || (part.type === 'file' && part.mediaType?.startsWith('image'))) {
                        return { type: 'text', text: '[Image previously analyzed]' };
                    }
                    return part;
                });
                return { ...msg, content: strippedContent };
            }
        }

        return msg;
    });
}

/**
 * Normalize messages for AI SDK
 */
function normalizeMessages(messages) {
    const toDataUrl = (base64, mimeType) => {
        if (!base64) return null;
        if (base64.startsWith('data:')) return base64;
        return `data:${mimeType};base64,${base64}`;
    };

    return messages.map(msg => {
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }

        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
            const content = msg.parts.map(part => {
                if (part.type === 'text') {
                    return { type: 'text', text: part.text || '' };
                }

                if ((part.type === 'file' || part.type === 'image') && part.data) {
                    const mimeType = part.mimeType || 'application/octet-stream';
                    const dataUrl = toDataUrl(part.data, mimeType);

                    if (!dataUrl) return null;

                    if (mimeType.startsWith('image/')) {
                        return { type: 'image', image: dataUrl, mediaType: mimeType };
                    }
                    return { type: 'file', data: dataUrl, mediaType: mimeType };
                }
                return null;
            }).filter(Boolean);

            if (content.length > 0) {
                return { role: msg.role, content };
            }
        }

        return { role: msg.role, content: '' };
    });
}

/**
 * Log to audit table (fire-and-forget)
 */
function scheduleAuditLog(ctx, supabase, data) {
    const logPromise = supabase.from('ai_audit_logs')
        .insert({ ...data, created_at: new Date().toISOString() })
        .then(({ error }) => {
            if (error) console.error('[Audit] DB Error:', error.message);
        })
        .catch((err) => console.error('[Audit] Net Error:', err));

    if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(logPromise);
    }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default async function handler(req, ctx) {
    const startTime = Date.now();

    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
        return errorResponse('Method Not Allowed', 405);
    }

    // ========================================================================
    // 1. ENVIRONMENT SETUP
    // ========================================================================

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
    const googleApiKey = (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');

    if (!supabaseUrl || !googleApiKey) {
        return errorResponse('Server Configuration Error', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const google = createGoogleGenerativeAI({ apiKey: googleApiKey });

    // ========================================================================
    // 2. PARSE REQUEST
    // ========================================================================

    let body;
    try {
        body = await req.json();
    } catch (e) {
        return errorResponse('Invalid JSON body', 400);
    }

    const { messages = [], context } = body;
    if (!messages.length) {
        return errorResponse('Messages array is required', 400);
    }

    // ========================================================================
    // 3. ROUTE: Classify Intent
    // ========================================================================

    const lastMessage = getLastUserMessage(messages);
    const hasFiles = hasAttachments(messages);

    const classification = classify({
        message: lastMessage,
        hasAttachment: hasFiles,
        history: messages,
    });

    console.log(`[Router] Intent: ${classification.intent} (confidence: ${classification.confidence.toFixed(2)})`);
    console.log(`[Router] ${describeIntent(classification.intent)}`);

    // ========================================================================
    // 4. LOAD SPECIALIZED PROMPT
    // ========================================================================

    const systemPrompt = getPromptForIntent(classification.intent);

    // Inject current context if available
    let finalPrompt = systemPrompt;
    if (context && Object.keys(context).length > 0) {
        finalPrompt += `\n\nCURRENT CONTEXT:\n${JSON.stringify(context, null, 2)}`;
    }

    // ========================================================================
    // 5. PREPARE MESSAGES
    // ========================================================================

    const normalizedMessages = normalizeMessages(messages);
    const truncatedMessages = truncateHistory(normalizedMessages);
    const safeMessages = stripImagesFromOldMessages(truncatedMessages);

    console.log(`[AI] Messages: ${safeMessages.length}, Intent: ${classification.intent}`);

    // ========================================================================
    // 6. CONFIGURE TOOLS BASED ON INTENT
    // ========================================================================

    // Only load tools for intents that need them
    const tools = classification.requiresTools
        ? createCommandCenterTools(supabase)
        : undefined;

    // Enable grounded search for general queries and search intents
    const useGrounding = classification.intent === Intent.GENERAL ||
        classification.intent === Intent.SEARCH_QUERY;

    const providerOptions = {
        google: {
            thinkingConfig: THINKING_CONFIG,
            safetySettings: SAFETY_SETTINGS,
            useSearchGrounding: useGrounding,
        },
    };

    // ========================================================================
    // 7. EXECUTE AI CALL
    // ========================================================================

    try {
        // For tool-heavy intents, use generateText for multi-step execution
        if (classification.requiresTools && classification.intent !== Intent.EDIT_CONTENT) {
            const result = await generateText({
                model: google(MODEL_CONFIG.primary),
                system: finalPrompt,
                messages: safeMessages,
                tools,
                maxSteps: MAX_TOOL_STEPS,
                maxTokens: MODEL_CONFIG.maxTokens,
                temperature: MODEL_CONFIG.temperature,
                providerOptions,
                abortSignal: req.signal,
            });

            let responseText = result.text || '';

            // If tools were called but no text, synthesize a response
            if (!responseText && result.toolResults?.length > 0) {
                const toolSummary = result.toolResults.map(tr =>
                    `${tr.toolName}: ${JSON.stringify(tr.result)}`
                ).join('\n');

                const synthesisResult = await generateText({
                    model: google(MODEL_CONFIG.primary),
                    system: finalPrompt,
                    messages: [
                        ...safeMessages,
                        { role: 'assistant', content: `Tool results:\n${toolSummary}` },
                        { role: 'user', content: 'Summarize these results clearly.' },
                    ],
                    maxTokens: 1024,
                    temperature: MODEL_CONFIG.temperature,
                    providerOptions,
                });

                responseText = synthesisResult.text || 'Operation completed.';
            }

            // VALIDATE OUTPUT
            const validation = validate(responseText);
            console.log(`[Validator] ${summarize(validation)}`);

            // Audit
            scheduleAuditLog(ctx, supabase, {
                function_name: 'command-center',
                input_message: lastMessage,
                input_metadata: {
                    intent: classification.intent,
                    confidence: classification.confidence,
                    model: MODEL_CONFIG.primary,
                },
                output_text: validation.text,
                validation_issues: validation.issues.length,
                latency_ms: Date.now() - startTime,
            });

            // Return validated response
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(validation.text));
                    controller.close();
                }
            });

            return new Response(stream, {
                headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        // For editing and simple responses, use streamText for better UX
        // Note: DRAFT_OUTREACH is handled in the generateText branch above (requiresTools = true)
        const streamResult = await streamText({
            model: google(MODEL_CONFIG.primary),
            system: finalPrompt,
            messages: safeMessages,
            maxTokens: MODEL_CONFIG.maxTokens,
            temperature: MODEL_CONFIG.temperature,
            providerOptions,
            abortSignal: req.signal,
            onFinish: async ({ text }) => {
                // Validate and log after stream completes
                const validation = validate(text);
                console.log(`[Validator] ${summarize(validation)}`);

                scheduleAuditLog(ctx, supabase, {
                    function_name: 'command-center',
                    input_message: lastMessage,
                    input_metadata: {
                        intent: classification.intent,
                        confidence: classification.confidence,
                        model: MODEL_CONFIG.primary,
                    },
                    output_text: text,
                    validation_issues: validation.issues.length,
                    latency_ms: Date.now() - startTime,
                });
            },
        });

        return streamResult.toTextStreamResponse({ headers: CORS_HEADERS });

    } catch (error) {
        console.error('[AI] Error:', error.message);

        // Retry with fallback model if retryable
        if (isRetryableError(error)) {
            console.log(`[AI] Retrying with ${MODEL_CONFIG.fallback}...`);

            try {
                const fallbackResult = await streamText({
                    model: google(MODEL_CONFIG.fallback),
                    system: finalPrompt,
                    messages: safeMessages,
                    maxTokens: MODEL_CONFIG.maxTokens,
                    temperature: MODEL_CONFIG.temperature,
                    providerOptions,
                    abortSignal: req.signal,
                });

                return fallbackResult.toTextStreamResponse({ headers: CORS_HEADERS });
            } catch (fallbackError) {
                console.error('[AI] Fallback failed:', fallbackError.message);
            }
        }

        scheduleAuditLog(ctx, supabase, {
            function_name: 'command-center',
            input_message: lastMessage,
            error_message: error.message,
            latency_ms: Date.now() - startTime,
        });

        return errorResponse('AI Service Unavailable', 503, error.message);
    }
}
