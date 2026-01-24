/**
 * Command Center AI - Vercel Edge Function
 * 
 * Production-grade implementation with:
 * - Gemini 3 Pro/Flash model hierarchy
 * - Exponential backoff with jitter
 * - Model failover on overload/rate-limit
 * - Structured audit logging
 * - Context-aware system prompts
 * 
 * @version 2.0.0
 * @author Pipeline Command Center
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createCommandCenterTools } from './tools.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const config = {
    runtime: 'edge',
    maxDuration: 60, // Vercel Pro limit
};

/** Model hierarchy: Pro for quality, Flash for fallback */
const MODELS = {
    PRIMARY: 'gemini-3-flash-preview',
    FALLBACK: 'gemini-3-pro-preview',
};

/** Retry configuration */
const RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 8000,
    jitterFactor: 0.3,
};

/** Error codes that trigger retry/failover */
const RETRYABLE_ERRORS = [
    'overloaded',
    'rate_limit',
    'quota',
    'temporarily_unavailable',
    '503',
    '429',
    'RESOURCE_EXHAUSTED',
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

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

/**
 * Calculate delay with exponential backoff + jitter
 */
function calculateBackoffDelay(attempt) {
    const exponentialDelay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
        RETRY_CONFIG.maxDelayMs
    );
    const jitter = exponentialDelay * RETRY_CONFIG.jitterFactor * Math.random();
    return Math.floor(exponentialDelay + jitter);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error) {
    const message = (error?.message || error?.toString() || '').toLowerCase();
    return RETRYABLE_ERRORS.some(code => message.includes(code.toLowerCase()));
}

/**
 * Create standardized error response
 */
function errorResponse(message, status = 500, details = null) {
    const body = { error: message };
    if (details && process.env.NODE_ENV !== 'production') {
        body.details = details;
    }
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Write audit log (fire-and-forget, non-blocking)
 */
async function writeAuditLog(supabase, logData) {
    try {
        await supabase.from('ai_audit_logs').insert(logData);
    } catch (e) {
        console.warn('[Audit] Failed to write log:', e.message);
    }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default async function handler(req) {
    const startTime = Date.now();

    // ========================================================================
    // 1. PREFLIGHT & METHOD CHECK
    // ========================================================================

    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405);
    }

    // ========================================================================
    // 2. ENVIRONMENT VALIDATION
    // ========================================================================

    let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    // Sanitize: remove quotes, whitespace
    supabaseUrl = supabaseUrl.trim().replace(/^["']|["']$/g, '');
    supabaseKey = supabaseKey.trim().replace(/^["']|["']$/g, '');

    // Debug logging for env var diagnostics
    console.log('[Config] SUPABASE_URL:', supabaseUrl ? `"${supabaseUrl.substring(0, 30)}..."` : 'MISSING');
    console.log('[Config] SUPABASE_KEY:', supabaseKey ? 'set (hidden)' : 'MISSING');
    console.log('[Config] GOOGLE_API_KEY:', googleApiKey ? 'set' : 'MISSING');

    if (!supabaseUrl || !supabaseKey) {
        console.error('[Config] Missing Supabase configuration. Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')).join(', '));
        return errorResponse('Server configuration error: database', 500);
    }

    if (!googleApiKey) {
        console.error('[Config] Missing Google API Key');
        return errorResponse('Server configuration error: AI provider', 500);
    }

    // ========================================================================
    // 3. REQUEST PARSING
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
    // 4. CLIENT INITIALIZATION
    // ========================================================================

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract user from auth header if present
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let userId = null;

    if (token) {
        try {
            const { data: userData } = await supabase.auth.getUser(token);
            userId = userData?.user?.id || null;
        } catch (e) {
            console.warn('[Auth] Failed to get user:', e.message);
        }
    }

    // ========================================================================
    // 5. PREPARE AI REQUEST
    // ========================================================================

    const tools = createCommandCenterTools(supabase);

    // Transform messages from parts-based format to AI SDK content format
    const normalizedMessages = messages.map(msg => {
        // If already has content string, use it
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }
        // If has parts array (UI Message format), extract text
        if (Array.isArray(msg.parts)) {
            const textContent = msg.parts
                .filter(p => p.type === 'text' || p.text)
                .map(p => p.text || '')
                .join('');
            return { role: msg.role, content: textContent };
        }
        // Fallback
        return { role: msg.role, content: '' };
    });

    // Inject context into system prompt if present
    let systemPrompt = SYSTEM_PROMPT;
    if (context && Object.keys(context).length > 0) {
        systemPrompt += `\n\nCURRENT CONTEXT:\n${JSON.stringify(context, null, 2)}`;
    }

    // ========================================================================
    // 6. EXECUTE WITH RETRY & FAILOVER
    // ========================================================================

    let lastError = null;
    let modelUsed = MODELS.PRIMARY;
    let attemptCount = 0;

    const executeWithModel = async (model) => {
        const google = createGoogleGenerativeAI({ apiKey: googleApiKey });

        for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
            attemptCount++;

            try {
                console.log(`[AI] Attempt ${attempt + 1}/${RETRY_CONFIG.maxAttempts} with ${model}`);
                console.log(`[AI] Message count: ${normalizedMessages.length}`);
                console.log(`[AI] Messages:`, JSON.stringify(normalizedMessages.map(m => ({ role: m.role, contentLen: m.content?.length || 0 }))));

                const result = await streamText({
                    model: google(model),
                    system: systemPrompt,
                    messages: normalizedMessages,
                    tools,
                    maxSteps: 10,
                    onFinish: async ({ text, finishReason, usage, error: finishError }) => {
                        console.log(`[AI] onFinish called: ${finishReason}, text length: ${text?.length || 0}`);
                        if (finishError) {
                            console.error(`[AI] onFinish error:`, finishError.message || finishError);
                        }
                        // Async audit log - non-blocking
                        writeAuditLog(supabase, {
                            user_id: userId,
                            function_name: 'command-center-vercel',
                            input_message: messages[messages.length - 1]?.content || '',
                            input_metadata: {
                                context_keys: context ? Object.keys(context) : [],
                                model_used: model,
                                attempt_count: attemptCount,
                                ...metadata
                            },
                            output_text: text,
                            finish_reason: finishReason,
                            latency_ms: Date.now() - startTime,
                            output_metadata: { usage, error: finishError?.message },
                        });
                    },
                    onError: (error) => {
                        console.error(`[AI] onError callback:`, error.message || error);
                    },
                    onStepFinish: ({ text, finishReason }) => {
                        console.log(`[AI] onStepFinish: ${finishReason}, text length: ${text?.length || 0}`);
                    },
                });

                console.log(`[AI] streamText returned successfully`);
                modelUsed = model;
                return result;

            } catch (error) {
                lastError = error;
                console.error(`[AI] Attempt ${attempt + 1} failed:`, error.message);

                // Check if retryable
                if (isRetryableError(error) && attempt < RETRY_CONFIG.maxAttempts - 1) {
                    const delay = calculateBackoffDelay(attempt);
                    console.log(`[AI] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Not retryable or exhausted retries
                throw error;
            }
        }
    };

    try {
        // Try primary model first
        let result;
        try {
            result = await executeWithModel(MODELS.PRIMARY);
        } catch (primaryError) {
            // If primary fails with overload, try fallback
            if (isRetryableError(primaryError)) {
                console.log(`[AI] Primary model exhausted, failing over to ${MODELS.FALLBACK}`);
                result = await executeWithModel(MODELS.FALLBACK);
            } else {
                throw primaryError;
            }
        }

        // Success - return streaming response
        return result.toTextStreamResponse();

    } catch (error) {
        console.error('[AI] All attempts failed:', error.message);

        // Log failure to audit
        writeAuditLog(supabase, {
            user_id: userId,
            function_name: 'command-center-vercel',
            input_message: messages[messages.length - 1]?.content || '',
            input_metadata: {
                context_keys: context ? Object.keys(context) : [],
                model_attempted: modelUsed,
                total_attempts: attemptCount,
                ...metadata
            },
            error_message: error.message,
            error_details: { stack: error.stack },
            latency_ms: Date.now() - startTime,
        });

        // Return user-friendly error
        const isOverload = isRetryableError(error);
        return errorResponse(
            isOverload
                ? 'AI service is temporarily busy. Please try again in a moment.'
                : 'Failed to process your request. Please try again.',
            isOverload ? 503 : 500
        );
    }
}
