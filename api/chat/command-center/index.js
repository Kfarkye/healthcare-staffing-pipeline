/**
 * Command Center Chat - Vercel Edge Function
 * 
 * Architecture Notes (per official docs):
 * - Uses providerOptions.google.thinkingConfig for Gemini 3 thinking mode
 * - Uses stopWhen: stepCountIs(N) for multi-step tool execution
 * - Safety settings configured for healthcare context
 * - No temperature override for Gemini 3 (docs recommend default 1.0)
 * 
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 * @see https://ai.google.dev/gemini-api/docs/function-calling#best-practices
 * 
 * @version 4.0.0 - Full rewrite with documented patterns
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText, stepCountIs } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createCommandCenterTools } from './tools.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const config = {
    runtime: 'edge',
    maxDuration: 60,
};

/** 
 * Model hierarchy
 * @see https://ai.google.dev/gemini-api/docs/models/
 */
const MODELS = {
    PRIMARY: 'gemini-3-flash-preview',
    FALLBACK: 'gemini-3-pro-preview',
};

/** Retry configuration */
const RETRY_CONFIG = {
    maxAttempts: 2,
    baseDelayMs: 500,
};

/** Maximum messages to keep in history (prevents context overflow) */
const MAX_HISTORY_LENGTH = 12;

/** Maximum tool execution steps */
const MAX_TOOL_STEPS = 5;

/**
 * Safety Settings for Healthcare Context
 * Set to BLOCK_ONLY_HIGH to prevent false positives on medical terminology
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai#safety-settings
 */
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
];

/**
 * Thinking Configuration for Gemini 3 Models
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai#thinking
 */
const THINKING_CONFIG = {
    thinkingLevel: 'high',
    includeThoughts: false, // Don't expose internal reasoning to user
};

/** System prompt */
const SYSTEM_PROMPT = `You are the 'Pipeline Command Center' AI, an elite recruiter assistant for Aya Healthcare.

IDENTITY:
- Persona: Senior Recruiter, Fulfillment Specialist
- Direct Line: 858-529-7267 Ext: 17017
- Style: Professional, efficient, action-oriented

CAPABILITIES:
1. **Executive Reporting**: Use 'get_pipeline_brief' for pipeline summaries
2. **Candidate Search**: Use 'search_all_candidates' (DEFAULT) or 'search_prospects' for new candidates only
3. **Extension Management**: Use 'search_travel_list' for active travelers and extensions
4. **Template Workflow**: 
   - First: Call 'list_email_templates' to discover templates
   - Then: Call 'get_template' with matched template name
   - Finally: Populate placeholders with real data from search tools
5. **Pay Calculation**: Use 'calculate_pay_package' for GSA-compliant breakdowns
6. **UI Navigation**: Use 'set_ui_state' to update dashboard filters
7. **Diagnostics**: Use 'debug_system' if searches return unexpected empty results

AMBIENT AWARENESS:
- Context object contains current dashboard state (active candidate, filters)
- "this person" or "this list" refers to context
- ALWAYS extract Candidate ID and Nova URL from provided data

EMAIL FORMAT:
When drafting emails, ALWAYS use this exact structure for proper rendering:

# EMAIL DRAFT

**To:** recipient@email.com
**Subject:** Your subject line here

---

Email body content here. Use proper paragraphs with blank lines between them.
Write conversationally but professionally.
Do NOT include a signature - the user's email client adds it automatically.

---

IMPORTANT EMAIL RULES:
- Always start with "# EMAIL DRAFT" header
- Include "**To:**" with recipient email if known from context (candidate email, etc.)
- Always include "**Subject:**" on its own line
- Use "---" horizontal rules to separate sections
- NEVER include a signature (Best, Name, Title, Phone) - it's added by the email client
- Never use [SUBJECT] or [BODY] tags

RULES:
- Never ask for data you can look up with tools
- Always show Nova URLs and Candidate IDs when available
- Calculate dates dynamically (don't ask the user)
- Be concise - recruiters are busy
- CRITICAL: After any tool calls, you MUST write a final user-facing response summarizing the results. Never end with just tool calls.`;

// ============================================================================
// UTILITIES
// ============================================================================

/** CORS Headers */
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Create JSON error response */
function errorResponse(message, status = 500, details = null) {
    return new Response(JSON.stringify({ error: message, details }), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

/** Check if error is retryable */
function isRetryableError(error) {
    const msg = error?.message?.toLowerCase() || '';
    return /429|503|overloaded|rate.?limit|quota|temporarily.?unavailable/.test(msg);
}

/** 
 * Protects against context window overflow by keeping only recent history.
 * Keeps first message (system context) and last N messages.
 */
function truncateHistory(messages, maxLimit = MAX_HISTORY_LENGTH) {
    if (!messages || messages.length <= maxLimit) return messages;
    return [messages[0], ...messages.slice(-maxLimit + 1)];
}

/** 
 * CRITICAL: Use Edge Context's waitUntil to keep background tasks alive.
 * Without this, audit logs are killed when response stream closes.
 */
function scheduleAuditLog(ctx, supabase, data) {
    const logPromise = supabase.from('ai_audit_logs')
        .insert({
            ...data,
            created_at: new Date().toISOString(),
        })
        .then(({ error }) => {
            if (error) console.error('[Audit] DB Error:', error.message);
        })
        .catch((err) => console.error('[Audit] Net Error:', err));

    // Use waitUntil if available (Vercel Edge), otherwise fire-and-forget
    if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(logPromise);
    }
}

/**
 * Serialize tool results for synthesis prompt
 * Handles errors and undefined results gracefully
 */
function serializeToolResults(toolResults) {
    if (!toolResults?.length) return '';

    return toolResults.map(tr => {
        // Handle explicit error from tool
        if (tr.result?.error) {
            return `Tool: ${tr.toolName}\nStatus: Failed\nError: ${tr.result.error}`;
        }

        // Handle undefined/null (tool returned void)
        if (tr.result === undefined || tr.result === null) {
            return `Tool: ${tr.toolName}\nStatus: Complete\nResult: No data returned`;
        }

        // Normal result
        return `Tool: ${tr.toolName}\nResult: ${JSON.stringify(tr.result, null, 2)}`;
    }).join('\n\n');
}

// ============================================================================
// HANDLER
// ============================================================================

export default async function handler(req, ctx) {
    const startTime = Date.now();

    // ========================================================================
    // 1. CORS PREFLIGHT
    // ========================================================================

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
        return errorResponse('Method Not Allowed', 405);
    }

    // ========================================================================
    // 2. ENVIRONMENT VALIDATION
    // ========================================================================

    // Strip quotes and whitespace from env vars
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
    const googleApiKey = (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');

    console.log('[Config] SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING');
    console.log('[Config] SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'set' : 'MISSING');
    console.log('[Config] GOOGLE_API_KEY:', googleApiKey ? 'set' : 'MISSING');

    if (!supabaseUrl || !googleApiKey) {
        return errorResponse('Server Configuration Error - Missing API Keys', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========================================================================
    // 3. PARSE & VALIDATE REQUEST
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
    // 4. NORMALIZE & TRUNCATE MESSAGES (with Multimodal Support)
    // ========================================================================

    /**
     * Normalize messages for AI SDK, preserving multimodal content.
     * 
     * Supports two formats:
     * 1. Simple: { role, content: string }
     * 2. Multimodal: { role, parts: [{ type: 'text', text }, { type: 'image', mimeType, data }] }
     * 
     * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai#multi-modal
     */
    const normalizedMessages = messages.map(msg => {
        // Case 1: Simple string content
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }

        // Case 2: Multimodal parts array
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
            // Build content array for AI SDK multimodal format
            const content = msg.parts.map(part => {
                if (part.type === 'text') {
                    return { type: 'text', text: part.text || '' };
                }
                if (part.type === 'image' && part.data) {
                    // Gemini expects base64 image data
                    return {
                        type: 'image',
                        image: part.data, // Base64 string (without data: prefix)
                        mimeType: part.mimeType || 'image/png',
                    };
                }
                return null;
            }).filter(Boolean);

            // If we have valid multimodal content, return it
            if (content.length > 0) {
                console.log(`[AI] Multimodal message: ${content.length} parts (${content.filter(c => c.type === 'image').length} images)`);
                return { role: msg.role, content };
            }
        }

        // Fallback: empty content
        return { role: msg.role, content: '' };
    });

    const safeMessages = truncateHistory(normalizedMessages);
    console.log(`[AI] Message count: ${safeMessages.length} (from ${normalizedMessages.length})`);

    // ========================================================================
    // 5. PREPARE AI REQUEST
    // ========================================================================

    const google = createGoogleGenerativeAI({ apiKey: googleApiKey });
    const tools = createCommandCenterTools(supabase);

    // Inject context into system prompt
    let systemPrompt = SYSTEM_PROMPT;
    if (context && Object.keys(context).length > 0) {
        systemPrompt += `\n\nCURRENT CONTEXT:\n${JSON.stringify(context, null, 2)}`;
    }

    /**
     * Provider Options for Gemini 3
     * @see https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai#provider-options
     */
    const providerOptions = {
        google: {
            thinkingConfig: THINKING_CONFIG,
            safetySettings: SAFETY_SETTINGS,
        },
    };

    // ========================================================================
    // 6. EXECUTE WITH RETRY & FAILOVER
    // ========================================================================

    let currentModel = MODELS.PRIMARY;
    let finalError = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
        try {
            // Failover to Pro on retry
            if (attempt > 0) {
                currentModel = MODELS.FALLBACK;
                console.log(`[AI] Failing over to ${currentModel}`);
            }

            console.log(`[AI] Attempt ${attempt + 1}/${RETRY_CONFIG.maxAttempts} with ${currentModel}`);

            // ================================================================
            // PHASE 1: Tool Execution with generateText
            // Uses stopWhen per AI SDK docs for multi-step execution
            // ================================================================

            let phase1Result;

            try {
                phase1Result = await generateText({
                    model: google(currentModel),
                    system: systemPrompt,
                    messages: safeMessages,
                    tools,
                    stopWhen: stepCountIs(MAX_TOOL_STEPS),
                    maxTokens: 4096,
                    providerOptions,
                    abortSignal: req.signal,
                });

                const { text, finishReason, toolCalls, toolResults, steps } = phase1Result;

                console.log(`[AI] Phase 1 complete: reason=${finishReason}, text=${text?.length || 0} chars, tools=${toolCalls?.length || 0}, steps=${steps?.length || 0}`);

                // Log tool execution details
                if (toolCalls?.length > 0) {
                    console.log('[AI] Tools called:', toolCalls.map(tc => tc.toolName).join(', '));
                }
                if (toolResults?.length > 0) {
                    const resultStatus = toolResults.map(tr =>
                        `${tr.toolName}: ${tr.result?.error ? 'ERROR' : 'OK'}`
                    );
                    console.log('[AI] Tool results:', resultStatus.join(', '));
                }

            } catch (toolError) {
                console.error('[AI] Phase 1 failed:', toolError.message);

                // Fallback: respond without tools
                console.log('[AI] Falling back to no-tool response...');

                const fallbackResult = await streamText({
                    model: google(currentModel),
                    system: systemPrompt + '\n\nNOTE: Tools are temporarily unavailable. Respond as best you can without them.',
                    messages: safeMessages,
                    maxTokens: 4096,
                    providerOptions,
                    abortSignal: req.signal,
                });

                return fallbackResult.toTextStreamResponse({ headers: CORS_HEADERS });
            }

            // ================================================================
            // SUCCESS PATH: Return response based on Phase 1 result
            // ================================================================

            const { text, finishReason, toolResults } = phase1Result;

            // CASE A: Model generated text directly (with or without tools)
            if (text && text.length > 0) {
                console.log('[AI] Returning direct text response');

                // Log to audit
                scheduleAuditLog(ctx, supabase, {
                    function_name: 'command-center',
                    input_message: messages[messages.length - 1]?.content || '',
                    input_metadata: { model: currentModel, phase: 'direct' },
                    output_text: text,
                    finish_reason: finishReason,
                    latency_ms: Date.now() - startTime,
                });

                // Stream-like response for client consistency
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode(text));
                        controller.close();
                    }
                });

                return new Response(stream, {
                    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
                });
            }

            // CASE B: Tools executed but no final text - run synthesis
            if (toolResults && toolResults.length > 0) {
                console.log('[AI] Running Phase 2 synthesis...');

                const toolSummary = serializeToolResults(toolResults);

                const synthesisMessages = [
                    ...safeMessages,
                    {
                        role: 'assistant',
                        content: `I executed the following tools:\n\n${toolSummary}`
                    },
                    {
                        role: 'user',
                        content: 'Please provide a clear, user-friendly summary of these results.'
                    }
                ];

                const synthesisResult = await streamText({
                    model: google(currentModel),
                    system: systemPrompt,
                    messages: synthesisMessages,
                    // NO tools - forces text response
                    maxTokens: 2048,
                    providerOptions,
                    abortSignal: req.signal,
                    onFinish: ({ text: synthText, finishReason: synthReason }) => {
                        console.log(`[AI] Synthesis complete: ${synthReason}, ${synthText?.length || 0} chars`);
                        scheduleAuditLog(ctx, supabase, {
                            function_name: 'command-center',
                            input_message: messages[messages.length - 1]?.content || '',
                            input_metadata: { model: currentModel, phase: 'synthesis', tools: toolResults.length },
                            output_text: synthText,
                            finish_reason: synthReason,
                            latency_ms: Date.now() - startTime,
                        });
                    },
                });

                return synthesisResult.toTextStreamResponse({ headers: CORS_HEADERS });
            }

            // CASE C: No text and no tools - shouldn't happen
            console.warn('[AI] Empty response - no text, no tools');
            return new Response('I apologize, but I was unable to process your request. Please try again.', {
                headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
            });

        } catch (error) {
            console.warn(`[AI] Attempt ${attempt + 1} failed:`, error.message);
            finalError = error;

            // If user disconnected, stop immediately
            if (error.name === 'AbortError') break;

            // If retryable and we have attempts left, wait and retry
            if (isRetryableError(error) && attempt < RETRY_CONFIG.maxAttempts - 1) {
                const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
                console.log(`[AI] Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            break;
        }
    }

    // ========================================================================
    // 7. ERROR HANDLING
    // ========================================================================

    console.error('[AI] All attempts failed:', finalError?.message);

    scheduleAuditLog(ctx, supabase, {
        function_name: 'command-center',
        input_message: messages[messages.length - 1]?.content || '',
        input_metadata: { model: currentModel },
        error_message: finalError?.message,
        latency_ms: Date.now() - startTime,
    });

    return errorResponse(
        'AI Service Unavailable',
        503,
        finalError?.message
    );
}
