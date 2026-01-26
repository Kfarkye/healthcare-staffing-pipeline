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
   - Finally: Populate placeholders with real data from search tools OR from image data
5. **Pay Calculation**: Use 'calculate_pay_package' for GSA-compliant breakdowns
6. **UI Navigation**: Use 'set_ui_state' to update dashboard filters
7. **Diagnostics**: Use 'debug_system' if searches return unexpected empty results

VISION INSTRUCTIONS (Image Analysis):
When you receive an IMAGE (screenshot), carefully extract ALL visible data:

For MARGIN CALCULATOR screenshots, extract:
- Candidate Name (from "Name" field)
- Candidate ID (from "Candidate ID" field)
- Email (from "Email" field)
- Facility Name & Location
- Profession/Specialty
- Assignment Dates (Start Date, End Date)
- Weekly Hours & Shift Info
- Weekly Gross Pay
- Taxable Hourly Rate
- Weekly Stipends (Meals + Housing breakdown)
- Base Pay Rate, Bill Rate, OT Rate

CRITICAL: Use the EXACT data from the image. Never hallucinate or guess names, emails, or numbers.
If you see "Mariam Kikota" in the image, the email should go to Mariam, not someone else.

COLD OUTREACH CAMPAIGN WORKFLOW (PRIORITY):
When user uploads a PAY PACKAGE screenshot and says "cold outreach campaign" or similar:

1. **EXTRACT FROM IMAGE** - Read the pay package screenshot carefully and extract:
   - Position Title (e.g., "Exercise Physiologist", "ICU RN")
   - Facility Name (e.g., "Sparrow Eaton Hospital")
   - City & State (e.g., "Charlotte, MI")
   - Start Date & End Date (convert to YYYY-MM-DD format)
   - Gross Weekly Pay (the main weekly total)
   - Taxable Hourly Rate (if visible)
   - Weekly Stipends (Meals + Housing, if visible)
   - Hours per Week (if visible)
   - Specialty code (if visible)
   - Job ID (if visible)

2. **CREATE CAMPAIGN** - Call 'create_campaign' with ALL extracted fields:
   - position_title, facility_name, city, state (required)
   - start_date, end_date (required, YYYY-MM-DD format)
   - gross_weekly_pay (required, number without $ or commas)
   - Optional: taxable_hourly_rate, weekly_housing_stipend, weekly_meals_stipend, hours_per_week

3. **CONFIRM & PROMPT** - After creating, confirm the campaign details and ask:
   "Campaign created! Ready to add recipients. Paste your candidate list (names + emails)."

4. **ADD RECIPIENTS** - When user pastes candidate list, call 'add_recipients' with the campaign_id

5. **GENERATE EMAILS** - After recipients added, call 'generate_blast_emails'

6. **SEND LINKS** - Call 'send_campaign' to generate Outlook mailto links for manual sending

Example user flow:
- User: [uploads pay package screenshot] "cold outreach campaign"
- AI: Extracts all data → calls create_campaign → "Campaign created for Exercise Physiologist at Sparrow Eaton Hospital ($2,360/week). Paste your candidate list!"
- User: [pastes list of names/emails]
- AI: Calls add_recipients → "Added 15 recipients. Generating personalized emails..."
- AI: Calls generate_blast_emails → "Emails ready! Click each Outlook link to send:"
- AI: Calls send_campaign → Returns mailto links

TEMPLATE MATCHING:
Choose the correct template based on context:

1. **"Pay Package Interest"** - Use when:
   - User provides margin calculator screenshot
   - User mentions "pay package", "assignment details", "offer"
   - User says "interested click outreach", "draft outreach" with pay data
   - You have specific facility, pay, and date information

2. **"Intro Outreach"** - Use when:
   - Cold prospecting with no specific assignment
   - User says "cold outreach", "introduce", "reach out to prospect"
   - No pay package or assignment data available

3. **"cold_outreach" template** - Use for BLAST campaigns (multiple recipients)
   - Automatically used by generate_blast_emails tool
   - Personalized with {{first_name}}, {{position_title}}, etc.

MANDATORY TEMPLATE WORKFLOW:
When drafting ANY email, you MUST:
1. FIRST: Call 'get_template' with the template name (e.g., "Pay Package Interest")
2. THEN: Extract data from the screenshot/context
3. FINALLY: Populate the template with the extracted data

NEVER generate an email without calling get_template first. The templates contain the exact format and language the recruiter wants.

AMBIENT AWARENESS:
- Context object contains current dashboard state (active candidate, filters)
- "this person" or "this list" refers to context
- ALWAYS extract Candidate ID and Nova URL from provided data

EMAIL FORMAT:
When drafting emails, ALWAYS use this exact structure for proper rendering:

# EMAIL DRAFT

To: recipient@email.com
Subject: Your subject line here

---

Email body content here. Use proper paragraphs with blank lines between them.
Write conversationally but professionally.
Do NOT include a signature - the user's email client adds it automatically.

---

IMPORTANT EMAIL RULES:
- Always start with "# EMAIL DRAFT" header
- Include "To:" with recipient email if known from context (candidate email, etc.)
- Always include "Subject:" on its own line
- Use "---" horizontal rules to separate sections
- NEVER include a signature (Best, Name, Title, Phone) - it's added by the email client
- Never use [SUBJECT] or [BODY] tags
- NEVER USE ASTERISKS OR MARKDOWN IN EMAIL BODY - email clients don't render markdown. Use plain text only. No **bold**, no *italics*, no bullet points with asterisks. Use dashes (-) for lists instead.

RULES:
- Never ask for data you can look up with tools
- Always show Nova URLs and Candidate IDs when available
- Calculate dates dynamically (don't ask the user)
- Be concise - recruiters are busy
- CRITICAL: After any tool calls, you MUST write a final user-facing response summarizing the results. Never end with just tool calls.

ANTI-HALLUCINATION (CRITICAL):
- NEVER invent, fabricate, or guess candidate names, IDs, or email addresses
- Only use data explicitly extracted from: attached files, database search results, or direct user input
- If you cannot read or extract data from a file, clearly state: "I couldn't extract [data type] from the attachment. Please provide it directly."
- When uncertain, ASK the user rather than guessing
- If search returns no results, say so honestly - never make up a candidate`;

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
 * CRITICAL: Strip Base64 images from older messages to prevent timeout.
 * 
 * Problem: Sending 8+ images in history causes Gemini to re-process ALL of them
 * every request, leading to 25s+ processing time and timeout.
 * 
 * Solution: Keep images ONLY in the LAST user message. Replace older images
 * with text placeholders so the AI knows context was provided but doesn't
 * have to re-analyze the same screenshots repeatedly.
 */
function stripImagesFromOldMessages(messages) {
    if (!messages || messages.length < 2) return messages;

    // Find the index of the last user message
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            lastUserIndex = i;
            break;
        }
    }

    return messages.map((msg, index) => {
        // Keep the last user message intact (with images)
        if (index === lastUserIndex) return msg;

        // For other messages, strip images from content array
        if (Array.isArray(msg.content)) {
            const hasImages = msg.content.some(part =>
                part.type === 'image' ||
                (part.type === 'file' && part.source?.media_type?.startsWith('image'))
            );

            if (hasImages) {
                // Replace image parts with text placeholder
                const strippedContent = msg.content.map(part => {
                    if (part.type === 'image' ||
                        (part.type === 'file' && part.source?.media_type?.startsWith('image'))) {
                        return { type: 'text', text: '[Image previously analyzed]' };
                    }
                    return part;
                });

                // Dedupe consecutive "[Image previously analyzed]" placeholders
                const deduped = strippedContent.filter((part, i, arr) => {
                    if (i === 0) return true;
                    if (part.type === 'text' && part.text === '[Image previously analyzed]') {
                        const prev = arr[i - 1];
                        if (prev.type === 'text' && prev.text === '[Image previously analyzed]') {
                            return false; // Skip duplicate
                        }
                    }
                    return true;
                });

                return { ...msg, content: deduped };
            }
        }

        return msg;
    });
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
     * Normalize messages for AI SDK v6, preserving multimodal content.
     * 
     * AI SDK v6 Requirements:
     * - Uses `mediaType` (not mimeType)
     * - Images: { type: 'image', image: 'data:mime;base64,...', mediaType: '...' }
     * - Files: { type: 'file', data: 'data:mime;base64,...', mediaType: '...' }
     * - Data must be full data URLs, not raw base64
     * 
     * @see https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
     * @see https://ai-sdk.dev/cookbook/next/generate-object-with-file-prompt
     */

    // Helper: Convert raw base64 to data URL format
    const toDataUrl = (base64, mimeType) => {
        if (!base64) return null;
        // Already a data URL? Return as-is
        if (base64.startsWith('data:')) return base64;
        // Convert raw base64 to data URL
        return `data:${mimeType};base64,${base64}`;
    };

    const normalizedMessages = messages.map(msg => {
        // Case 1: Simple string content
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }

        // Case 2: Multimodal parts array
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
            // Build content array for AI SDK v6 multimodal format
            const content = msg.parts.map(part => {
                if (part.type === 'text') {
                    return { type: 'text', text: part.text || '' };
                }

                // Handle file/image parts
                // Supports both 'file' (new) and 'image' (legacy) type values from client
                if ((part.type === 'file' || part.type === 'image') && part.data) {
                    const mimeType = part.mimeType || 'application/octet-stream';
                    const dataUrl = toDataUrl(part.data, mimeType);

                    if (!dataUrl) {
                        console.warn('[AI] Skipping part with missing data');
                        return null;
                    }

                    // Images: use 'image' property (AI SDK v6 schema)
                    if (mimeType.startsWith('image/')) {
                        return {
                            type: 'image',
                            image: dataUrl,      // Full data URL
                            mediaType: mimeType, // AI SDK v6 uses mediaType
                        };
                    }

                    // Documents (PDF, text, CSV): use 'data' property (AI SDK v6 schema)
                    return {
                        type: 'file',
                        data: dataUrl,           // Full data URL
                        mediaType: mimeType,     // AI SDK v6 uses mediaType
                    };
                }
                return null;
            }).filter(Boolean);

            // If we have valid multimodal content, return it
            if (content.length > 0) {
                const imageCount = content.filter(c => c.type === 'image').length;
                const docCount = content.filter(c => c.type === 'file').length;
                console.log(`[AI] Multimodal content: ${content.length} parts (${imageCount} images, ${docCount} documents)`);

                // Debug: Log structure of first non-text part (keys only, not data)
                const firstMedia = content.find(c => c.type !== 'text');
                if (firstMedia) {
                    console.log(`[AI] Part structure: { type: '${firstMedia.type}', mediaType: '${firstMedia.mediaType}', dataUrl: ${(firstMedia.data || firstMedia.image || '').substring(0, 50)}... }`);
                }

                return { role: msg.role, content };
            }
        }

        // Fallback: empty content
        return { role: msg.role, content: '' };
    });

    const truncatedMessages = truncateHistory(normalizedMessages);

    // INSTRUMENTATION: Count images BEFORE stripping
    const countImages = (msgs) => msgs.reduce((sum, m) => {
        if (Array.isArray(m.content)) {
            return sum + m.content.filter(p => p.type === 'image').length;
        }
        return sum;
    }, 0);
    const imagesBefore = countImages(truncatedMessages);

    const safeMessages = stripImagesFromOldMessages(truncatedMessages);

    // INSTRUMENTATION: Count images AFTER stripping + estimate payload
    const imagesAfter = countImages(safeMessages);
    const payloadEstimate = JSON.stringify(safeMessages).length;
    console.log(`[AI] Image stripping: ${imagesBefore} → ${imagesAfter} images | Payload: ~${Math.round(payloadEstimate / 1024)}KB | Messages: ${safeMessages.length}`);

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
