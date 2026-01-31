import { createClient } from 'npm:@supabase/supabase-js@2';

// ============================================================================
// CORS
// ============================================================================
const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function requireEnv(name: string): string {
    const v = Deno.env.get(name);
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
}

function safeUpper2(s?: string) {
    if (!s) return s;
    return s.trim().toUpperCase();
}

function replacePlaceholders(template: string, vars: Record<string, unknown>) {
    // Supports {{key}} and ignores unknown keys (replaces with empty string)
    return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
        const val = (vars as any)[key];
        if (val === null || val === undefined) return '';
        return String(val);
    });
}

function asArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

// ============================================================================
// MAIN
// ============================================================================
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse({ text: 'Method Not Allowed', thought: '', history: [] }, 405);

    // Keep supabase nullable so catch never throws by referencing an uninitialized const
    let supabase: ReturnType<typeof createClient> | null = null;

    // Standardize response shape everywhere to stop client retry storms
    const respond = (text: string, history: any[] = [], thought = '', status = 200) =>
        jsonResponse({ text, thought, history }, status);

    // Tool Names
    const ToolName = {
        SEARCH_PROSPECTS: 'search_prospects',
        SEARCH_ALL_CANDIDATES: 'search_all_candidates',
        GET_PROSPECT_DETAILS: 'get_prospect_details',
        CALCULATE_PAY: 'calculate_pay',
        LIST_EMAIL_TEMPLATES: 'list_email_templates',
        DRAFT_EMAIL: 'draft_email',
        CREATE_FOLLOW_UP: 'create_follow_up',
        SEARCH_KNOWLEDGE: 'search_knowledge',
        GOOGLE_SEARCH: 'google_search',
        SAVE_CERTIFICATION: 'save_certification',
        UPDATE_NEGOTIATION: 'update_negotiation',
        GET_PIPELINE_BRIEF: 'get_pipeline_brief',
        SET_UI_STATE: 'set_ui_state',
        SEARCH_TRAVEL_LIST: 'search_travel_list',
        GET_TEMPLATE: 'get_template',
        ADD_PROSPECT: 'add_prospect',
        CALCULATE_PAY_PACKAGE: 'calculate_pay_package',
        GENERATE_SUBMITTAL_HIGHLIGHTS: 'generate_submittal_highlights',
    } as const;

    // Model fallback strategy: Pro -> Flash
    const MODEL_PRIMARY = 'gemini-3-pro-preview';
    const MODEL_FALLBACK = 'gemini-3-flash-preview';

    try {
        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '') || '';

        // Env + clients INSIDE try (so failures are caught and returned cleanly)
        const supabaseUrl = requireEnv('SUPABASE_URL');
        const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
        supabase = createClient(supabaseUrl, supabaseKey);

        const googleApiKey = requireEnv('GEMINI_API_KEY');

        // ------------------------------------------------------------------------
        // Parse request
        // ------------------------------------------------------------------------
        const body = await req.json().catch(() => ({}));
        const message: string = body?.message ?? '';
        const history = asArray<any>(body?.history);
        const attachment = body?.attachment ?? null;
        const messageConversationId = body?.conversation_id ?? null;
        const context = body?.context ?? null;
        const metadata = body?.metadata ?? null;

        if (!message) return respond('Message is required', history, '', 400);

        // Generate request_id for tracing
        const requestId = crypto.randomUUID();
        const startTime = Date.now();
        const accumulatedToolCalls: any[] = [];

        console.log(`[Command] [${requestId}] Processing: "${message}" ${context ? '(with ambient context)' : ''}`);

        // Helper to write audit log (best effort)
        const logToAudit = async (
            outputText: string | null,
            finishReason: string | null,
            errorMessage: string | null = null,
            errorDetails: any = null,
        ) => {
            if (!supabase) return;
            try {
                const { data: userData } = token
                    ? await supabase.auth.getUser(token)
                    : { data: { user: null } };

                await supabase.from('ai_audit_logs').insert({
                    user_id: userData?.user?.id || null,
                    function_name: 'chat-command-center',
                    input_message: message,
                    input_metadata: {
                        has_attachment: !!attachment,
                        context_keys: context ? Object.keys(context) : [],
                        request_id: requestId,
                    },
                    output_text: outputText,
                    finish_reason: finishReason,
                    tool_calls: accumulatedToolCalls,
                    latency_ms: Date.now() - startTime,
                    error_message: errorMessage,
                    error_details: errorDetails,
                });
            } catch (e) {
                console.warn('[Audit] Failed to write audit log:', e);
            }
        };

        // ------------------------------------------------------------------------
        // Tools declarations (Gemini)
        // ------------------------------------------------------------------------
        const tools = [
            {
                function_declarations: [
                    {
                        name: ToolName.SEARCH_PROSPECTS,
                        description:
                            'Search for NEW candidates (prospects) who are not yet on assignment. For active travelers, use search_all_candidates.',
                        parameters: {
                            type: 'object',
                            properties: {
                                specialty: { type: 'string' },
                                home_state: { type: 'string' },
                                status: {
                                    type: 'string',
                                    enum: ['New', 'Contacted', 'Interested', 'Passive', 'Rotation'],
                                },
                                name_contains: { type: 'string' },
                            },
                        },
                    },
                    {
                        name: ToolName.SEARCH_ALL_CANDIDATES,
                        description:
                            'Search for ANY candidate by name - searches both prospects AND active travelers (engagements). Use this as the DEFAULT when looking up a person by name.',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Name to search for' },
                            },
                            required: ['name'],
                        },
                    },
                    {
                        name: ToolName.GET_PROSPECT_DETAILS,
                        description: 'Get full profile for a specific candidate.',
                        parameters: {
                            type: 'object',
                            properties: {
                                candidate_id: { type: 'number' },
                                name: { type: 'string' },
                            },
                        },
                    },
                    {
                        name: ToolName.CALCULATE_PAY,
                        description: 'Calculate weekly gross pay breakdown.',
                        parameters: {
                            type: 'object',
                            properties: {
                                target_gross: { type: 'number' },
                                state: { type: 'string' },
                                city: { type: 'string' },
                                specialty: { type: 'string' },
                                hours: { type: 'number' },
                            },
                            required: ['target_gross', 'state', 'city', 'specialty'],
                        },
                    },
                    {
                        name: ToolName.CALCULATE_PAY_PACKAGE,
                        description: 'Calculate official GSA-compliant pay package from Target Gross.',
                        parameters: {
                            type: 'object',
                            properties: {
                                target_gross: { type: 'number', description: 'Target weekly gross pay (e.g., 2500)' },
                                state: { type: 'string', description: "Job state (e.g., 'CA', 'TX')" },
                                city: { type: 'string' },
                                specialty: { type: 'string' },
                                hours: { type: 'number', description: 'Hours per week (default 36)' },
                            },
                            required: ['target_gross', 'state'],
                        },
                    },
                    {
                        name: ToolName.LIST_EMAIL_TEMPLATES,
                        description:
                            "List outreach templates. Returns template_key (same as name), name, category, description.",
                        parameters: { type: 'object', properties: {} },
                    },
                    {
                        name: ToolName.GET_TEMPLATE,
                        description:
                            "Retrieve an editorial template from the Template Registry by category + template_name (template_key).",
                        parameters: {
                            type: 'object',
                            properties: {
                                category: {
                                    type: 'string',
                                    enum: ['active', 'prospect', 'retention'],
                                    description: 'Template category based on candidate status.',
                                },
                                template_name: { type: 'string', description: "Template key (usually same as 'name')" },
                            },
                            required: ['category', 'template_name'],
                        },
                    },
                    {
                        name: ToolName.DRAFT_EMAIL,
                        description:
                            'Draft an email using a template_id (template name/key) and candidate_data. Replaces {{placeholders}}.',
                        parameters: {
                            type: 'object',
                            properties: {
                                template_id: { type: 'string' },
                                candidate_data: { type: 'object' },
                            },
                            required: ['template_id', 'candidate_data'],
                        },
                    },
                    {
                        name: ToolName.CREATE_FOLLOW_UP,
                        description: 'Schedule a follow-up.',
                        parameters: {
                            type: 'object',
                            properties: {
                                candidate_id: { type: 'number' },
                                scheduled_date: { type: 'string' },
                                follow_up_type: { type: 'string', enum: ['active', 'rotation'] },
                                notes: { type: 'string' },
                            },
                            required: ['candidate_id', 'scheduled_date', 'follow_up_type'],
                        },
                    },
                    {
                        name: ToolName.SEARCH_KNOWLEDGE,
                        description: 'Search corporate knowledge (benefits, insurance, policies, FAQs).',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'The benefit or policy to look up.' },
                                category: { type: 'string', enum: ['benefits', 'faq', 'policies'] },
                            },
                            required: ['query'],
                        },
                    },
                    {
                        name: ToolName.GOOGLE_SEARCH,
                        description:
                            'Web search for grounding (not implemented here; returns a structured "not available" response).',
                        parameters: {
                            type: 'object',
                            properties: { query: { type: 'string' } },
                            required: ['query'],
                        },
                    },
                    {
                        name: ToolName.SAVE_CERTIFICATION,
                        description: 'Save candidate certification details extracted from screenshots or documents.',
                        parameters: {
                            type: 'object',
                            properties: {
                                candidate_id: { type: 'number' },
                                cert_name: { type: 'string', description: 'CER, CRCST, CIS, BLS, etc.' },
                                hspa_id: { type: 'string' },
                                issued_at: { type: 'string', description: 'YYYY-MM-DD' },
                                expires_at: { type: 'string', description: 'YYYY-MM-DD' },
                                is_verified: { type: 'boolean' },
                            },
                            required: ['candidate_id', 'cert_name'],
                        },
                    },
                    {
                        name: ToolName.UPDATE_NEGOTIATION,
                        description: 'Update candidate negotiation details (target gross, take home, etc.).',
                        parameters: {
                            type: 'object',
                            properties: {
                                candidate_id: { type: 'number' },
                                target_gross: { type: 'number' },
                                target_take_home: { type: 'number' },
                                rto_requested: { type: 'boolean' },
                                notes: { type: 'string' },
                            },
                            required: ['candidate_id'],
                        },
                    },
                    {
                        name: ToolName.GET_PIPELINE_BRIEF,
                        description: 'Get an executive summary of the entire candidate pipeline (counts by status/specialty).',
                        parameters: { type: 'object', properties: {} },
                    },
                    {
                        name: ToolName.SET_UI_STATE,
                        description:
                            "Update the dashboard UI state (filter/view). Only call when user explicitly requests filtering, searching, or view changes.",
                        parameters: {
                            type: 'object',
                            properties: {
                                filter_specialty: { type: 'string' },
                                filter_status: { type: 'string' },
                                search_term: { type: 'string' },
                                view_mode: { type: 'string', enum: ['kanban', 'ranking', 'list'] },
                            },
                        },
                    },
                    {
                        name: ToolName.SEARCH_TRAVEL_LIST,
                        description:
                            "Search the recruiter's active Travel assignment book. Use this for questions about currently working travelers, their facilities, margins, or contract dates.",
                        parameters: {
                            type: 'object',
                            properties: {
                                facility_contains: { type: 'string', description: 'Search by facility name (partial match)' },
                                candidate_name: { type: 'string', description: 'Search by candidate name (partial match)' },
                                cleared_status: { type: 'string', description: 'Filter by compliance status' },
                            },
                        },
                    },
                    {
                        name: ToolName.ADD_PROSPECT,
                        description:
                            "Add a new candidate/prospect to the database. Honors provided candidate_id and nova_url when supplied.",
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Full name of the candidate' },
                                specialty: { type: 'string', description: 'Primary specialty (e.g. ICU, ER, OR)' },
                                email: { type: 'string', description: 'Email address (optional)' },
                                phone: { type: 'string', description: 'Phone number (optional)' },
                                home_state: { type: 'string', description: 'Two-letter state code (e.g. CA, TX)' },
                                status: {
                                    type: 'string',
                                    enum: ['New', 'Contacted', 'Interested', 'Profile Updates', 'Submittal Ready', 'Submitted'],
                                },
                                notes: { type: 'string' },
                                candidate_id: { type: 'number', description: 'The unique ID from Nova (e.g., 1576542)' },
                                nova_url: { type: 'string', description: 'The full profile URL from Nova' },
                            },
                            required: ['name'],
                        },
                    },
                    {
                        name: ToolName.GENERATE_SUBMITTAL_HIGHLIGHTS,
                        description:
                            "Generate a formatted 'Submittal Highlights' summary for a candidate (candidate brief/profile summary).",
                        parameters: {
                            type: 'object',
                            properties: {
                                candidate_id: { type: 'number' },
                                name: { type: 'string' },
                                certifications: { type: 'array', items: { type: 'string' } },
                                profession: { type: 'string' },
                            },
                        },
                    },
                ],
            },
        ];

        // ------------------------------------------------------------------------
        // System instruction: remove slash commands and tighten tool-use contracts
        // ------------------------------------------------------------------------
        const systemInstruction = {
            parts: [
                {
                    text: `
You are the "Pipeline Command Center" AI for Kofi Farkye (Aya Healthcare).

HARD RULES:
- Natural language only. Do not propose slash commands or shortcut syntax.
- Do not call any tool more than once per user message.
- Do not call set_ui_state unless the user explicitly requests filters/search/view changes.
- If you don't know the correct template_name, call list_email_templates. Otherwise call get_template directly.

RECRUITER WORKFLOW RULES:
1. DEFAULT BEHAVIOR: If user pastes a screenshot with no instructions (or just "reply", "draft"), draft a reply to the conversation shown. Assume "draft reply" by default.
2. TONE MATCHING: Read the candidate's message tone and match it. If they're casual, be casual. If they use "lol" or emojis, mirror that energy. Never sound more formal than the candidate.
3. CERTS: When context involves onboarding, submissions, or new assignments, proactively ask the candidate to send their certifications. Don't mention expiration dates or compliance issues unless specifically asked.
4. TIME-OFF: When asking about availability, ask about time-off requests, NOT start dates. "Any time-off requests for this contract?" is better than "When can you start?"
5. AYA APP: NEVER ask candidates to update or send their resume. Always direct them to update their profile in the Aya app — that's what gets sent to facilities. Say "Could you update your profile in the Aya app?" not "Send me your updated resume."
6. CONCISE: Keep drafts short. Recruiters send dozens of messages daily. No fluff, no over-explaining.
7. NO COMPLIANCE TALK: Don't mention license expirations, compliance deadlines, or regulatory issues unless the recruiter specifically brings it up. Just ask for certs.
8. MATCH ENERGY ALWAYS: If the candidate is excited, be excited back. If stressed, be reassuring. If brief, be brief. Mirror their communication style.

CANDIDATE LOOKUP:
- When a candidate name appears, call search_all_candidates immediately.
- Always include Candidate ID and nova_url when available.

TEMPLATE USAGE:
- list_email_templates returns template_key (same as name), name, category, description.
- get_template expects { category, template_name } where template_name == template_key.
- Replace {{placeholders}} using real candidate data or tool results.

INTERESTED CLICK TEMPLATES:
- working_traveler_interest: For travelers CURRENTLY ON ASSIGNMENT who clicked Interested (seeking next placement)
- reengaged_traveler_interest: For travelers who were PREVIOUSLY INACTIVE and clicked Interested (returning to travel)

PREDICTIVE ACTION (AUTO-DETECT):
When you receive an IMAGE/SCREENSHOT with minimal or no text:
1. TEXT MESSAGE/CHAT: Extract name, search for profile, draft contextual reply matching their tone
2. PAY PACKAGE: Extract details, draft outreach email
3. CERTIFICATION/LICENSE DOC: Save details, ask for copies to be sent (no expiration warnings)
4. INTERESTED CLICK: Use appropriate template based on traveler status
5. DEFAULT: If unclear, draft a friendly reply to whatever conversation is shown

EMAIL OUTPUT FORMAT (when drafting an email):
[SUBJECT]...[/SUBJECT]
[BODY]
...
Best,
Kofi Farkye
Senior Recruiter, Fulfillment Specialist
[/BODY]
          `.trim(),
                },
            ],
        };

        // ------------------------------------------------------------------------
        // Build user parts (attachments)
        // ------------------------------------------------------------------------
        const userParts: any[] = [{ text: message }];

        if (attachment?.base64) {
            // Normalize MIME types for Gemini; treat emails and common text payloads as text/plain
            let mimeType: string = attachment.mimeType || 'application/octet-stream';

            if (
                mimeType === 'message/rfc822' ||
                mimeType.includes('email') ||
                (typeof attachment.base64 === 'string' && attachment.base64.startsWith('RnJvbTo')) // "From:" in base64
            ) {
                mimeType = 'text/plain';
            }

            const textTypes = ['application/json', 'application/xml', 'text/csv', 'text/html'];
            if (textTypes.includes(mimeType)) mimeType = 'text/plain';

            userParts.push({
                inlineData: {
                    mimeType,
                    data: attachment.base64,
                },
            });
        }

        let contents: any[] = [...history, { role: 'user', parts: userParts }];

        // ------------------------------------------------------------------------
        // Gemini call wrapper with retries + fallback
        // ------------------------------------------------------------------------
        const callGeminiWithRetry = async (payload: any, model = MODEL_PRIMARY, maxRetries = 3): Promise<any> => {
            const safetySettings = [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
            ];

            // SANITIZE CONTENTS: Gemini accepts role + parts only
            const sanitizedContents = payload.contents.map((m: any) => ({
                role: m.role,
                parts: (m.parts || []).map((p: any) => {
                    const part: any = {};
                    if (p.text) part.text = p.text;
                    if (p.inlineData) part.inlineData = p.inlineData;
                    if (p.functionCall) part.functionCall = p.functionCall;
                    if (p.functionResponse) part.functionResponse = p.functionResponse;
                    if (p.thought_signature) part.thought_signature = p.thought_signature;
                    if (p.thoughtSignature) part.thought_signature = p.thoughtSignature;
                    if (p.thought !== undefined) part.thought = p.thought;
                    return part;
                }),
            }));

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                console.log(`[Command] Gemini attempt ${attempt + 1}/${maxRetries + 1} using ${model}`);

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...payload,
                            contents: sanitizedContents,
                            safetySettings,
                            generationConfig: {
                                thinkingConfig: {
                                    includeThoughts: false,
                                    thinkingLevel: 'high',
                                },
                            },
                        }),
                    },
                );

                const result = await response.json();
                console.log(`[Command] Gemini status: ${response.status} ${response.statusText}`);

                const msg = result?.error?.message || '';
                const isOverloaded =
                    msg.includes('overloaded') ||
                    msg.includes('rate limit') ||
                    msg.includes('quota') ||
                    result?.error?.code === 503 ||
                    result?.error?.code === 429;

                if (result.error && isOverloaded && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`[Command] Retry after ${delay}ms (${msg})`);
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }

                if (result.error && isOverloaded && model === MODEL_PRIMARY) {
                    console.log(`[Command] Fallback to ${MODEL_FALLBACK}`);
                    return callGeminiWithRetry(payload, MODEL_FALLBACK, 2);
                }

                return result;
            }
        };

        // ------------------------------------------------------------------------
        // Tool execution loop
        // ------------------------------------------------------------------------
        const maxIterations = 8;
        const MAX_UNIQUE_TOOLS = 4; // Allow multi-tool chains but cap total
        const toolCallHistory: Array<{ name: string; argsHash: string }> = [];
        const usedToolNamesThisTurn = new Map<string, number>(); // name -> count

        // Helper to detect repeated name+args (iteration breaker)
        const hashArgs = (args: any) => JSON.stringify(args || {});
        const isRepeatedCall = (name: string, args: any) => {
            const argsHash = hashArgs(args);
            const lastTwo = toolCallHistory.slice(-2);
            return lastTwo.length === 2 && lastTwo.every(h => h.name === name && h.argsHash === argsHash);
        };

        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            const result = await callGeminiWithRetry({ contents, tools, system_instruction: systemInstruction });

            if (result?.error) {
                await logToAudit(null, 'ERROR', result.error.message || 'Gemini API failed', result.error);
                return respond('Gemini API failed', contents, '', 502);
            }

            const candidate = result?.candidates?.[0];
            if (!candidate?.content?.parts) {
                await logToAudit(null, 'EMPTY', 'No AI response', result);
                return respond('No AI response', contents, '', 502);
            }

            const finishReason: string = candidate.finishReason || 'UNKNOWN';
            const content = candidate.content;

            // Handle MALFORMED_FUNCTION_CALL deterministically
            if (finishReason === 'MALFORMED_FUNCTION_CALL') {
                console.error('[Command] MALFORMED_FUNCTION_CALL', JSON.stringify(content, null, 2));

                const recoveryContents = [
                    ...contents,
                    { role: 'user', parts: [{ text: 'Return a helpful text response. Do not call any functions.' }] },
                ];

                const fallbackResult = await callGeminiWithRetry(
                    { contents: recoveryContents, tools: [], system_instruction: systemInstruction },
                    MODEL_FALLBACK,
                    1,
                );

                const fallbackText =
                    fallbackResult?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text ||
                    'I hit a formatting issue. Re-send the request in one sentence.';

                await logToAudit(fallbackText, 'RECOVERY', null, { original_finish_reason: finishReason });
                return respond(fallbackText, recoveryContents);
            }

            if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
                await logToAudit(null, finishReason, `Blocked: ${finishReason}`, {});
                return respond("I couldn't complete that request due to content guidelines.", contents);
            }

            contents.push(content);

            const toolCalls = (content.parts || []).filter((p: any) => p.functionCall);
            toolCalls.forEach((tc: any) => accumulatedToolCalls.push({ name: tc.functionCall.name, args: tc.functionCall.args }));

            // No tool calls: return final text response
            if (toolCalls.length === 0) {
                const parts = content.parts || [];
                const thoughtPart = parts.find((p: any) => p.thought);
                const textPart = parts.find((p: any) => p.text && !p.thought);

                const finalText = (textPart?.text || '').trim() || 'Done.';
                const finalThought = (thoughtPart?.text || '').trim();

                // Persist chat history (best effort) - STRIP inlineData to avoid row bloat
                try {
                    if (supabase) {
                        const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
                        if (userData?.user) {
                            const convId = attachment?.candidate_id || messageConversationId || 'general';
                            // Strip inlineData from contents before persistence
                            const safeContents = contents.map((m: any) => ({
                                role: m.role,
                                parts: (m.parts || []).map((p: any) => {
                                    if (p.inlineData) {
                                        return { text: `[Attachment: ${p.inlineData.mimeType || 'file'}]` };
                                    }
                                    if (p.functionCall) return { functionCall: { name: p.functionCall.name } };
                                    if (p.functionResponse) return { functionResponse: { name: p.functionResponse.name, summary: 'ok' } };
                                    return p.text ? { text: p.text } : {};
                                }).filter((p: any) => Object.keys(p).length > 0),
                            }));
                            await supabase.from('chat_history').upsert(
                                {
                                    user_id: userData.user.id,
                                    conversation_id: String(convId),
                                    messages: safeContents,
                                    metadata: metadata || {},
                                    last_message_at: new Date().toISOString(),
                                },
                                { onConflict: 'user_id, conversation_id' },
                            );
                        }
                    }
                } catch (e) {
                    console.warn('Failed to persist chat history:', e);
                }

                await logToAudit(finalText, finishReason, null, { usage_metadata: result.usageMetadata || {} });
                return respond(finalText, contents, finalThought);
            }

            // Smart tool filtering: allow chains, block loops, cap total
            // Check for iteration breaker: same name+args 2x in a row = force text response
            for (const tc of toolCalls) {
                const name = tc.functionCall.name;
                const args = tc.functionCall.args;
                if (isRepeatedCall(name, args)) {
                    console.warn(`[Command] [${requestId}] Iteration breaker: ${name} repeated with same args`);
                    const forcedContents = [
                        ...contents,
                        { role: 'user', parts: [{ text: 'Provide the final answer now. Do not call any functions.' }] },
                    ];
                    const forced = await callGeminiWithRetry({ contents: forcedContents, tools: [], system_instruction: systemInstruction }, MODEL_FALLBACK, 1);
                    const forcedText = forced?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || 'Done.';
                    await logToAudit(forcedText, 'ITERATION_BREAK', null, { repeated_tool: name });
                    return respond(String(forcedText).trim(), forcedContents);
                }
                toolCallHistory.push({ name, argsHash: hashArgs(args) });
            }

            // Allow up to MAX_UNIQUE_TOOLS unique tool types, but each tool can be called once per iteration
            const dedupedToolCalls = toolCalls.filter((part: any) => {
                const name = part.functionCall.name;
                const currentCount = usedToolNamesThisTurn.get(name) || 0;
                // Allow if: tool not used this iteration AND total unique tools < MAX
                if (currentCount === 0 && usedToolNamesThisTurn.size < MAX_UNIQUE_TOOLS) {
                    usedToolNamesThisTurn.set(name, 1);
                    return true;
                }
                return false;
            });

            const toolResponses = await Promise.all(
                dedupedToolCalls.map(async (part: any) => {
                    const { name, args } = part.functionCall;
                    const thoughtSignature = part.thought_signature || part.thoughtSignature;

                    let resultData: any = null;

                    try {
                        if (!supabase) throw new Error('Supabase client not initialized');

                        switch (name) {
                            case ToolName.SEARCH_PROSPECTS: {
                                let query = supabase.from('prospects').select('*');
                                if (args.specialty) query = query.ilike('specialty', `%${args.specialty}%`);
                                if (args.home_state) query = query.eq('home_state', safeUpper2(args.home_state));
                                if (args.status) query = query.eq('status', args.status);
                                if (args.name_contains) query = query.ilike('name', `%${args.name_contains}%`);

                                const { data, error } = await query.limit(10);
                                resultData = error ? { error: error.message } : { prospects: data || [] };
                                break;
                            }

                            case ToolName.SEARCH_ALL_CANDIDATES: {
                                const nameQuery = String(args.name || '').trim();
                                const { data: prospects, error: pErr } = await supabase
                                    .from('prospects')
                                    .select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url')
                                    .ilike('name', `%${nameQuery}%`)
                                    .limit(10);

                                const { data: engagements, error: eErr } = await supabase
                                    .from('engagements')
                                    .select(
                                        `
                    id,
                    prospect_id,
                    specialty,
                    facility_name,
                    start_date,
                    end_date,
                    extension_stage,
                    bill_rate,
                    prospects!inner(candidate_id, name, email, phone, nova_url, home_state)
                  `,
                                    )
                                    .ilike('prospects.name', `%${nameQuery}%`)
                                    .limit(10);

                                const activeTravelers = (engagements || []).map((e: any) => ({
                                    engagement_id: e.id,
                                    candidate_id: e.prospects?.candidate_id,
                                    name: e.prospects?.name,
                                    email: e.prospects?.email,
                                    phone: e.prospects?.phone,
                                    nova_url: e.prospects?.nova_url,
                                    home_state: e.prospects?.home_state,
                                    specialty: e.specialty,
                                    facility_name: e.facility_name,
                                    start_date: e.start_date,
                                    end_date: e.end_date,
                                    extension_stage: e.extension_stage,
                                    source: 'active_traveler',
                                }));

                                resultData = {
                                    prospects: prospects || [],
                                    active_travelers: activeTravelers,
                                    total_found: (prospects?.length || 0) + activeTravelers.length,
                                    error: pErr || eErr ? pErr?.message || eErr?.message : null,
                                };
                                break;
                            }

                            case ToolName.GET_PROSPECT_DETAILS: {
                                let query = supabase.from('prospects').select('*');
                                if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
                                else if (args.name) query = query.ilike('name', `%${args.name}%`);

                                const { data, error } = await query.maybeSingle();
                                resultData = error ? { error: error.message } : { prospect: data || null };
                                break;
                            }

                            case ToolName.LIST_EMAIL_TEMPLATES: {
                                const { data, error } = await supabase
                                    .from('communication_templates')
                                    .select('name, category, description')
                                    .eq('is_active', true)
                                    .order('category');

                                if (error) resultData = { error: error.message, templates: [] };
                                else {
                                    const templates = (data || []).map((t: any) => ({
                                        template_key: t.name,
                                        name: t.name,
                                        category: t.category,
                                        description: t.description,
                                    }));
                                    resultData = { templates };
                                }
                                break;
                            }

                            case ToolName.GET_TEMPLATE: {
                                const { data, error } = await supabase
                                    .from('communication_templates')
                                    .select('subject_template, body_template, required_variables, description')
                                    .eq('category', args.category)
                                    .eq('name', args.template_name)
                                    .eq('is_active', true)
                                    .maybeSingle();

                                if (error) resultData = { error: error.message };
                                else if (!data) resultData = { error: `Template not found: ${args.category}/${args.template_name}` };
                                else {
                                    resultData = {
                                        template: {
                                            subject: data.subject_template,
                                            body: data.body_template,
                                            required_variables: data.required_variables,
                                            description: data.description,
                                        },
                                    };
                                }
                                break;
                            }

                            case ToolName.DRAFT_EMAIL: {
                                // Fetch template by name (template_id)
                                const { data, error } = await supabase
                                    .from('communication_templates')
                                    .select('subject_template, body_template')
                                    .eq('name', args.template_id)
                                    .eq('is_active', true)
                                    .maybeSingle();

                                if (error) {
                                    resultData = { error: error.message };
                                    break;
                                }
                                if (!data) {
                                    resultData = { error: `Template not found: ${args.template_id}` };
                                    break;
                                }

                                const candidateData = (args.candidate_data || {}) as Record<string, unknown>;
                                const subject = replacePlaceholders(data.subject_template || '', candidateData);
                                const body = replacePlaceholders(data.body_template || '', candidateData);

                                resultData = {
                                    drafted: true,
                                    subject,
                                    body,
                                    formatted: `[SUBJECT]${subject}[/SUBJECT]\n[BODY]\n${body}\n\nBest,\nKofi Farkye\nSenior Recruiter, Fulfillment Specialist\n[/BODY]`,
                                };
                                break;
                            }

                            case ToolName.CREATE_FOLLOW_UP: {
                                const { data: userData } = token
                                    ? await supabase.auth.getUser(token)
                                    : { data: { user: null } };

                                const recruiterId = userData?.user?.id || '00000000-0000-0000-0000-000000000000';

                                const { data, error } = await supabase
                                    .from('follow_ups')
                                    .insert({
                                        candidate_id: args.candidate_id,
                                        recruiter_id: recruiterId,
                                        follow_up_type: args.follow_up_type,
                                        scheduled_date: args.scheduled_date,
                                        notes: args.notes || null,
                                    })
                                    .select()
                                    .single();

                                resultData = error ? { error: error.message } : { follow_up: data };
                                break;
                            }

                            case ToolName.SEARCH_KNOWLEDGE: {
                                const q = String(args.query || '').trim();
                                const { data, error } = await supabase
                                    .from('knowledge_base')
                                    .select('*')
                                    .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
                                    .limit(5);

                                resultData = error ? { error: error.message, results: [] } : { results: data || [] };
                                break;
                            }

                            case ToolName.GOOGLE_SEARCH: {
                                // Explicitly not implemented here to avoid fake grounding
                                resultData = {
                                    error: 'google_search is not implemented in this Edge Function',
                                    query: args.query,
                                };
                                break;
                            }

                            case ToolName.CALCULATE_PAY: {
                                const { data, error } = await supabase.rpc('calculate_pay_package', {
                                    p_target_gross: args.target_gross,
                                    p_hours_per_week: args.hours || 36,
                                    p_state: safeUpper2(args.state),
                                    p_city: args.city,
                                    p_profession: 'RN',
                                    p_specialty: args.specialty || 'General',
                                    p_job_id: 'generated',
                                });

                                resultData = error
                                    ? { error: error.message }
                                    : { action: 'PAY_BREAKDOWN', data: { ...(data || {}), hours: args.hours || 36 } };
                                break;
                            }

                            case ToolName.CALCULATE_PAY_PACKAGE: {
                                const { data, error } = await supabase.rpc('calculate_pay_package', {
                                    p_target_gross: args.target_gross,
                                    p_hours_per_week: args.hours || 36,
                                    p_state: safeUpper2(args.state),
                                    p_city: args.city,
                                    p_profession: 'RN',
                                    p_specialty: args.specialty || 'General',
                                    p_job_id: 'generated',
                                });

                                resultData = error
                                    ? { error: error.message }
                                    : { action: 'PAY_PACKAGE_GENERATED', data: { ...(data || {}), hours: args.hours || 36 } };
                                break;
                            }

                            case ToolName.SAVE_CERTIFICATION: {
                                const { error } = await supabase.from('certifications').upsert([
                                    {
                                        candidate_id: args.candidate_id,
                                        cert_name: args.cert_name,
                                        hspa_id: args.hspa_id || null,
                                        issued_at: args.issued_at || null,
                                        expires_at: args.expires_at || null,
                                        is_verified: args.is_verified ?? false,
                                        updated_at: new Date().toISOString(),
                                    },
                                ]);

                                if (error) throw error;

                                await supabase.from('candidate_activities').insert([
                                    {
                                        candidate_id: args.candidate_id,
                                        type: 'Cert Upload',
                                        content: `Certification saved: ${args.cert_name}${args.expires_at ? ` (Expires: ${args.expires_at})` : ''}`,
                                        metadata: { cert_name: args.cert_name, is_verified: args.is_verified ?? false },
                                    },
                                ]);

                                resultData = { status: 'success', cert: args.cert_name };
                                break;
                            }

                            case ToolName.UPDATE_NEGOTIATION: {
                                const updateData: any = {};
                                if (args.target_gross !== undefined) updateData.target_gross = args.target_gross;
                                if (args.target_take_home !== undefined) updateData.target_take_home = args.target_take_home;
                                if (args.rto_requested !== undefined) updateData.rto_requested = args.rto_requested;
                                if (args.notes) updateData.notes = args.notes;

                                const { error } = await supabase.from('prospects').update(updateData).eq('candidate_id', args.candidate_id);
                                if (error) throw error;

                                await supabase.from('candidate_activities').insert([
                                    {
                                        candidate_id: args.candidate_id,
                                        type: 'Negotiation',
                                        content: `Negotiation updated`,
                                        metadata: args,
                                    },
                                ]);

                                resultData = { status: 'success', candidate_id: args.candidate_id };
                                break;
                            }

                            case ToolName.GET_PIPELINE_BRIEF: {
                                // RPC preferred, fallback to raw counts
                                const { data: statusCounts } = await supabase.rpc('get_prospect_status_counts').catch(() => ({ data: null }));
                                const { data: topSpecialties } = await supabase.rpc('get_top_specialties').catch(() => ({ data: null }));

                                if (statusCounts && topSpecialties) {
                                    resultData = { action: 'PIPELINE_BRIEF', data: { statusCounts, topSpecialties } };
                                    break;
                                }

                                const { data: all } = await supabase.from('prospects').select('status, specialty');
                                const counts: Record<string, number> = {};
                                const specs: Record<string, number> = {};

                                (all || []).forEach((p: any) => {
                                    counts[p.status] = (counts[p.status] || 0) + 1;
                                    specs[p.specialty] = (specs[p.specialty] || 0) + 1;
                                });

                                const top = Object.entries(specs)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 8)
                                    .map(([specialty, count]) => ({ specialty, count }));

                                resultData = { action: 'PIPELINE_BRIEF', data: { counts, top_specialties: top } };
                                break;
                            }

                            case ToolName.SET_UI_STATE: {
                                resultData = {
                                    action: 'UI_STATE_UPDATE',
                                    state: {
                                        filter_specialty: args.filter_specialty || null,
                                        filter_status: args.filter_status || null,
                                        search_term: args.search_term || null,
                                        view_mode: args.view_mode || null,
                                    },
                                };
                                break;
                            }

                            case ToolName.SEARCH_TRAVEL_LIST: {
                                let query = supabase.from('travel_candidates').select('*');

                                if (args.facility_contains) query = query.ilike('facility', `%${args.facility_contains}%`);
                                if (args.candidate_name) query = query.ilike('candidate_name', `%${args.candidate_name}%`);
                                if (args.cleared_status) query = query.ilike('cleared_status', `%${args.cleared_status}%`);

                                const { data, error } = await query.limit(20);
                                resultData = error ? { error: error.message } : { count: (data || []).length, travelers: data || [] };
                                break;
                            }

                            case ToolName.ADD_PROSPECT: {
                                const validStatuses = ['New', 'Contacted', 'Interested', 'Profile Updates', 'Submittal Ready', 'Submitted', 'Archived'];
                                const inputStatus = String(args.status || 'New');
                                const matchedStatus = validStatuses.find((s) => s.toLowerCase() === inputStatus.toLowerCase()) || 'New';

                                const candidateId = Number.isFinite(args.candidate_id) ? Number(args.candidate_id) : Math.floor(Date.now() / 1000);

                                const { data, error } = await supabase
                                    .from('prospects')
                                    .insert({
                                        candidate_id: candidateId,
                                        name: args.name,
                                        specialty: args.specialty || null,
                                        email: args.email || null,
                                        phone: args.phone || null,
                                        home_state: safeUpper2(args.home_state) || null,
                                        status: matchedStatus,
                                        notes: args.notes || null,
                                        recruiter: 'Kofi Farkye',
                                        nova_url: args.nova_url || null,
                                    })
                                    .select()
                                    .single();

                                resultData = error ? { error: error.message } : { action: 'PROSPECT_ADDED', prospect: data };
                                break;
                            }

                            case ToolName.GENERATE_SUBMITTAL_HIGHLIGHTS: {
                                let candidateData: any = null;

                                if (args.candidate_id || args.name) {
                                    let query = supabase.from('prospects').select('*');
                                    if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
                                    else query = query.ilike('name', `%${args.name}%`);
                                    const { data } = await query.maybeSingle();
                                    candidateData = data;
                                }

                                const certs: string[] = args.certifications || candidateData?.certifications || [];
                                const profession = args.profession || candidateData?.specialty || 'Healthcare Professional';
                                const candidateName = candidateData?.name || args.name || 'Unknown';

                                const titleLine = certs.length ? certs.join(' | ') : profession;
                                const experienceLine = candidateData?.specialty ? `Experience in ${candidateData.specialty}` : 'Healthcare experience';

                                const lines = [
                                    `• ${titleLine}`,
                                    `• ${experienceLine}`,
                                    `• Highly Proficient In: Patient Intake, Vitals Monitoring, Acute Care Settings`,
                                ];

                                resultData = {
                                    action: 'SUBMITTAL_HIGHLIGHTS_GENERATED',
                                    candidate_name: candidateName,
                                    highlights: lines.join('\n'),
                                };
                                break;
                            }

                            default: {
                                resultData = { error: `Tool not implemented: ${name}` };
                            }
                        }
                    } catch (e: any) {
                        resultData = { error: e?.message || String(e) };
                    }

                    const responsePart: any = {
                        functionResponse: {
                            name,
                            response: { content: resultData },
                        },
                    };

                    if (thoughtSignature) responsePart.thought_signature = thoughtSignature;
                    return responsePart;
                }),
            );

            contents.push({ role: 'function', parts: toolResponses });
        }

        // If we hit maxIterations, force a clean text response (no tools)
        const finalNudge = [
            ...contents,
            { role: 'user', parts: [{ text: 'Provide the final user-facing answer now. Do not call any functions.' }] },
        ];

        const forced = await callGeminiWithRetry({ contents: finalNudge, tools: [], system_instruction: systemInstruction }, MODEL_FALLBACK, 1);
        const forcedText = forced?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || 'Done.';

        await logToAudit(forcedText, 'FORCED_STOP', null, {});
        return respond(String(forcedText).trim(), finalNudge);
    } catch (error: any) {
        console.error('[Command] Edge Function Crash:', error);

        // Best-effort audit logging if supabase exists
        try {
            if (supabase) {
                await supabase.from('ai_audit_logs').insert({
                    function_name: 'chat-command-center',
                    error_message: error?.message || String(error),
                    error_details: { stack: error?.stack || null },
                });
            }
        } catch {
            // silent
        }

        return jsonResponse(
            {
                text: error?.message || 'Internal error',
                thought: '',
                history: [],
            },
            500,
        );
    }
});
