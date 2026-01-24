/**
 * Command Center Chat - Vercel Edge Function
 * 
 * Elite Production Implementation:
 * - WaitUntil Pattern for guaranteed audit logs
 * - Abort Signal Propagation (stops AI on disconnect)
 * - Context Truncation (prevents overflow crashes)
 * - Retry with Exponential Backoff + Model Failover
 * 
 * @version 3.0.0
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createCommandCenterTools } from './tools.js';

// ============================================================================
// CONFIG
// ============================================================================

export const config = {
    runtime: 'edge',
    maxDuration: 60,
};

/** Model hierarchy: Pro for quality, Flash for failover */
const MODELS = {
    PRIMARY: 'gemini-3-pro-preview',
    FALLBACK: 'gemini-3-flash-preview',
};

/** Retry configuration */
const RETRY_CONFIG = {
    maxAttempts: 2,
    baseDelayMs: 500,
};

/** Maximum messages to keep in history (prevents context overflow) */
const MAX_HISTORY_LENGTH = 12;

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

AMBIENT AWARENESS:
- Context object contains current dashboard state (active candidate, filters)
- "this person" or "this list" refers to context
- ALWAYS extract Candidate ID and Nova URL from provided data

EMAIL FORMAT:
When drafting emails, use this structure:
[SUBJECT]Your subject line[/SUBJECT]
[BODY]
Email body content...

Best,
[Recruiter Name]
Senior Recruiter, Fulfillment Specialist
[/BODY]

RULES:
- Never ask for data you can look up with tools
- Always show Nova URLs and Candidate IDs when available
- Calculate dates dynamically (don't ask the user)
- Be concise - recruiters are busy`;

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
    // 2. ENVIRONMENT VALIDATION (with sanitization)
    // ========================================================================

    // Strip quotes and whitespace from env vars
    let supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    let supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');
    const googleApiKey = (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');

    console.log('[Config] SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING');
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

    const { messages = [], context, metadata } = body;

    if (!messages.length) {
        return errorResponse('Messages array is required', 400);
    }

    // ========================================================================
    // 4. NORMALIZE & TRUNCATE MESSAGES
    // ========================================================================

    // Ensure all messages have content string format
    const normalizedMessages = messages.map(msg => {
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }
        if (Array.isArray(msg.parts)) {
            const textContent = msg.parts
                .filter(p => p.type === 'text' || p.text)
                .map(p => p.text || '')
                .join('');
            return { role: msg.role, content: textContent };
        }
        return { role: msg.role, content: '' };
    });

    // Truncate to prevent context overflow
    const safeMessages = truncateHistory(normalizedMessages);
    console.log(`[AI] Message count: ${safeMessages.length} (truncated from ${normalizedMessages.length})`);

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

    // ========================================================================
    // 6. EXECUTE WITH RETRY & FAILOVER
    // ========================================================================

    let currentModel = MODELS.PRIMARY;
    let finalError = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
        try {
            // Failover to Flash on retry
            if (attempt > 0) {
                currentModel = MODELS.FALLBACK;
                console.log(`[AI] Failing over to ${currentModel}`);
            }

            console.log(`[AI] Attempt ${attempt + 1}/${RETRY_CONFIG.maxAttempts} with ${currentModel}`);

            const result = await streamText({
                model: google(currentModel),
                system: systemPrompt,
                messages: safeMessages,
                tools,
                maxSteps: 5,
                maxTokens: 2048,
                // CRITICAL: Stop generating if client disconnects (saves costs)
                abortSignal: req.signal,
                onFinish: ({ text, finishReason, usage, warnings, error: finishError }) => {
                    console.log(`[AI] onFinish: ${finishReason}, text length: ${text?.length || 0}`);

                    // Capture any error details
                    if (finishError) {
                        console.error('[AI] onFinish error:', finishError.message || JSON.stringify(finishError));
                    }
                    if (finishReason === 'error' && text?.length === 0) {
                        console.error('[AI] Model returned error with no text - possible safety/filter issue');
                    }
                    if (warnings?.length > 0) {
                        console.warn('[AI] Warnings:', JSON.stringify(warnings));
                    }

                    // Schedule audit log using waitUntil (guaranteed to complete)
                    scheduleAuditLog(ctx, supabase, {
                        function_name: 'command-center',
                        input_message: messages[messages.length - 1]?.content || '',
                        input_metadata: {
                            model_used: currentModel,
                            context_keys: context ? Object.keys(context) : [],
                            message_count: safeMessages.length,
                            ...metadata
                        },
                        output_text: text,
                        finish_reason: finishReason,
                        latency_ms: Date.now() - startTime,
                        output_metadata: { usage },
                    });
                },
                onStepFinish: ({ text, finishReason }) => {
                    console.log(`[AI] onStepFinish: ${finishReason}, text length: ${text?.length || 0}`);
                },
            });

            // Success - return text stream response (simpler, works with native fetch)
            return result.toTextStreamResponse({
                headers: CORS_HEADERS,
            });

        } catch (error) {
            console.warn(`[AI] Attempt ${attempt + 1} failed (${currentModel}):`, error.message);
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

    // Log failure using waitUntil
    scheduleAuditLog(ctx, supabase, {
        function_name: 'command-center',
        input_message: messages[messages.length - 1]?.content || '',
        input_metadata: { model_used: currentModel },
        error_message: finalError?.message,
        latency_ms: Date.now() - startTime,
    });

    return errorResponse(
        'AI Service Unavailable',
        503,
        finalError?.message
    );
}
