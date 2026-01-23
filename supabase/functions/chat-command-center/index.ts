import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const googleApiKey = Deno.env.get('GEMINI_API_KEY')!;

    // Model fallback strategy: Pro -> Flash
    const MODEL_PRIMARY = 'gemini-3-pro-preview';
    const MODEL_FALLBACK = 'gemini-3-flash-preview';

    const ToolName = {
        SEARCH_PROSPECTS: 'search_prospects',
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
        SEARCH_ALL_CANDIDATES: 'search_all_candidates'
    };

    try {
        const { message, history, attachment, conversation_id: message_conversation_id, context, metadata } = await req.json();
        const startTime = Date.now();
        let accumulatedToolCalls: any[] = [];
        console.log(`[Command] Processing: "${message}" ${context ? '(with ambient context)' : ''}`);

        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        // Helper to write audit log
        const logToAudit = async (outputText: string | null, finishReason: string | null, errorMessage: string | null = null, errorDetails: any = null) => {
            try {
                const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
                await supabase.from('ai_audit_logs').insert({
                    user_id: userData?.user?.id || null,
                    function_name: 'chat-command-center',
                    input_message: message,
                    input_metadata: { has_attachment: !!attachment, context_keys: context ? Object.keys(context) : [] },
                    output_text: outputText,
                    finish_reason: finishReason,
                    tool_calls: accumulatedToolCalls,
                    latency_ms: Date.now() - startTime,
                    error_message: errorMessage,
                    error_details: errorDetails
                });
            } catch (e) {
                console.warn('[Audit] Failed to write audit log:', e);
            }
        };

        if (!message) throw new Error('Message is required');

        const tools = [{
            function_declarations: [
                {
                    name: ToolName.SEARCH_PROSPECTS,
                    description: "Search for NEW candidates (prospects) who are not yet on assignment. For active travelers, use search_all_candidates.",
                    parameters: {
                        type: "object",
                        properties: {
                            specialty: { type: "string" },
                            home_state: { type: "string" },
                            status: { type: "string", enum: ['New', 'Contacted', 'Interested', 'Passive', 'Rotation'] },
                            name_contains: { type: "string" }
                        }
                    }
                },
                {
                    name: ToolName.SEARCH_ALL_CANDIDATES,
                    description: "Search for ANY candidate by name - searches both prospects AND active travelers (engagements). Use this as the DEFAULT when looking up a person by name.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Name to search for" }
                        },
                        required: ["name"]
                    }
                },
                {
                    name: ToolName.GET_PROSPECT_DETAILS,
                    description: "Get full profile for a specific candidate.",
                    parameters: {
                        type: "object",
                        properties: {
                            candidate_id: { type: "number" },
                            name: { type: "string" }
                        }
                    }
                },
                {
                    name: ToolName.CALCULATE_PAY,
                    description: "Calculate weekly gross pay breakdown.",
                    parameters: {
                        type: "object",
                        properties: {
                            target_gross: { type: "number" },
                            state: { type: "string" },
                            city: { type: "string" },
                            specialty: { type: "string" },
                            hours: { type: "number" }
                        },
                        required: ["target_gross", "state", "city", "specialty"]
                    }
                },
                {
                    name: ToolName.LIST_EMAIL_TEMPLATES,
                    description: "List outreach templates.",
                    parameters: { type: "object", properties: {} }
                },
                {
                    name: ToolName.DRAFT_EMAIL,
                    description: "Draft an email using a template.",
                    parameters: {
                        type: "object",
                        properties: {
                            template_id: { type: "string" },
                            candidate_data: { type: "object" }
                        },
                        required: ["template_id", "candidate_data"]
                    }
                },
                {
                    name: ToolName.CREATE_FOLLOW_UP,
                    description: "Schedule a follow-up.",
                    parameters: {
                        type: "object",
                        properties: {
                            candidate_id: { type: "number" },
                            scheduled_date: { type: "string" },
                            follow_up_type: { type: "string", enum: ["active", "rotation"] },
                            notes: { type: "string" }
                        },
                        required: ["candidate_id", "scheduled_date", "follow_up_type"]
                    }
                },
                {
                    name: ToolName.CALCULATE_PAY_PACKAGE,
                    description: "Calculate official GSA-compliant pay package from Target Gross.",
                    parameters: {
                        type: "object",
                        properties: {
                            target_gross: { type: "number", description: "Target weekly gross pay (e.g., 2500)" },
                            state: { type: "string", description: "Job state (e.g., 'CA', 'TX')" },
                            city: { type: "string" },
                            specialty: { type: "string" },
                            hours: { type: "number", description: "Hours per week (default 36)" }
                        },
                        required: ["target_gross", "state"]
                    }
                },
                {
                    name: ToolName.SEARCH_KNOWLEDGE,
                    description: "Search corporate knowledge (benefits, insurance, policies, FAQs).",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "The benefit or policy to look up." },
                            category: { type: "string", enum: ['benefits', 'faq', 'policies'] }
                        },
                        required: ["query"]
                    }
                },
                {
                    name: ToolName.GOOGLE_SEARCH,
                    description: "Web search for grounding.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string" } },
                        required: ["query"]
                    }
                },
                {
                    name: ToolName.SAVE_CERTIFICATION,
                    description: "Save candidate certification details extracted from screenshots or documents.",
                    parameters: {
                        type: "object",
                        properties: {
                            candidate_id: { type: "number" },
                            cert_name: { type: "string", description: "CER, CRCST, CIS, BLS, etc." },
                            hspa_id: { type: "string" },
                            issued_at: { type: "string", description: "YYYY-MM-DD" },
                            expires_at: { type: "string", description: "YYYY-MM-DD" },
                            is_verified: { type: "boolean" }
                        },
                        required: ["candidate_id", "cert_name"]
                    }
                },
                {
                    name: ToolName.UPDATE_NEGOTIATION,
                    description: "Update candidate negotiation details (target gross, take home, etc.).",
                    parameters: {
                        type: "object",
                        properties: {
                            candidate_id: { type: "number" },
                            target_gross: { type: "number" },
                            target_take_home: { type: "number" },
                            rto_requested: { type: "boolean" },
                            notes: { type: "string" }
                        },
                        required: ["candidate_id"]
                    }
                },
                {
                    name: ToolName.GET_PIPELINE_BRIEF,
                    description: "Get an executive summary of the entire candidate pipeline (counts by status/specialty).",
                    parameters: { type: "object", properties: {} }
                },
                {
                    name: ToolName.SET_UI_STATE,
                    description: "Update the dashboard UI state (filter by specialty, status, or search).",
                    parameters: {
                        type: "object",
                        properties: {
                            filter_specialty: { type: "string" },
                            filter_status: { type: "string" },
                            search_term: { type: "string" },
                            view_mode: { type: "string", enum: ['kanban', 'ranking', 'list'] }
                        }
                    }
                },
                {
                    name: ToolName.SEARCH_TRAVEL_LIST,
                    description: "Search the recruiter's active Travel assignment book. Use this for questions about currently working travelers, their facilities, margins, or contract dates.",
                    parameters: {
                        type: "object",
                        properties: {
                            facility_contains: { type: "string", description: "Search by facility name (partial match)" },
                            candidate_name: { type: "string", description: "Search by candidate name (partial match)" },
                            cleared_status: { type: "string", description: "Filter by compliance status" }
                        }
                    }
                },
                {
                    name: ToolName.GET_TEMPLATE,
                    description: "Retrieve an editorial template from the Template Registry. Use this when the user asks to 'draft' or 'send' a standard communication like Extension Request, Margin Approval, or Cold Outreach.",
                    parameters: {
                        type: "object",
                        properties: {
                            category: { type: "string", enum: ['active', 'prospect', 'retention'], description: "Template category based on candidate status." },
                            template_name: { type: "string", description: "E.g., 'extension_request', 'margin_approval', 'cold_outreach'." }
                        },
                        required: ["category", "template_name"]
                    }
                },
                {
                    name: ToolName.ADD_PROSPECT,
                    description: "Add a new candidate/prospect to the database. Use this when the user explicitly asks to 'add' or 'create' a new person.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Full name of the candidate" },
                            specialty: { type: "string", description: "Primary nursing specialty (e.g. ICU, ER, OR)" },
                            email: { type: "string", description: "Email address (optional)" },
                            phone: { type: "string", description: "Phone number (optional)" },
                            home_state: { type: "string", description: "Two-letter state code (e.g. CA, TX)" },
                            status: { type: "string", enum: ['New', 'Contacted', 'Interested', 'Profile Updates', 'Submittal Ready', 'Submitted'], description: "Initial status (default: New)" },
                            notes: { type: "string", description: "Initial notes or context" },
                            candidate_id: { type: "number", description: "The unique ID from Nova (e.g., 1576542)" },
                            nova_url: { type: "string", description: "The full profile URL from Nova" }
                        },
                        required: ["name"]
                    }
                },
                {
                    name: ToolName.GENERATE_SUBMITTAL_HIGHLIGHTS,
                    description: "Generate a formatted 'Submittal Highlights' summary for a candidate. Use when the user asks to create or draft submittal highlights, a candidate brief, or a profile summary.",
                    parameters: {
                        type: "object",
                        properties: {
                            candidate_id: { type: "number", description: "Candidate ID to look up" },
                            name: { type: "string", description: "Candidate name to search for" },
                            certifications: { type: "array", items: { type: "string" }, description: "Override certifications list" },
                            profession: { type: "string", description: "Profession type (e.g., RN, CMA, SPT)" }
                        }
                    }
                }
            ]
        }];

        const systemInstruction = {
            parts: [{
                text: `You are the 'Pipeline Command Center' AI (Kofi Farkye, Senior Recruiter, Fulfillment Specialist, P: 858-529-7267 Ext: 17017, Aya Healthcare). 

AMBIENT AWARENESS:
- You are aware of the user's dashboard view via the 'context' object (active candidate, current filters).
- If the user asks about 'this person' or 'this list', refer to the context.
- ALWAYS extract the **Candidate ID** (e.g., 1576542) and **Nova URL** from provided links or text.
- When adding or updating a candidate, ENSURE these fields are populated.
- When queried about a candidate, prioritize showing their ID and Nova URL if available.

Pillars of Operation:
1. Executive Reporting: Use 'get_pipeline_brief' to summarize the recruiter's entire world.
2. AI-Driven Navigation: Use 'set_ui_state' to instantly update the recruiter's dashboard based on their commands.
3. Rapid Extension: You are the master of the "Working List". When asked about extensions, use the 'search_travel_list' tool.

DYNAMIC TEMPLATE GROUNDING:
When the user asks to draft, send, or compose ANY standard communication, you MUST:
1. FIRST call 'list_email_templates' to discover available templates (returns template_key, name, category, description).
2. Call 'get_template' with the matching template_key from step 1.
3. Call 'search_travel_list' to fetch the REAL candidate data (specifically 'current_end_date') if needed.
4. COMPUTE DATES:
   - If the user specifies a duration (e.g., "13 weeks"), ADD that duration to the 'current_end_date' to find the 'Proposed Extension Dates'.
   - Format: "[Duration] (Starting [Current End Date + 1 day] - Ending [Calculated Date])"
5. Replace all {{placeholders}} in the template with the real data and your calculated dates.
6. Present the FULLY POPULATED template.

Template Categories: active (extensions), prospect (outreach/licensing), retention (reassignments), margin (pay approvals).

EMAIL OUTPUT FORMAT:
When drafting any email, you MUST wrap the email content in tags for the One-Click Outlook button:
[SUBJECT]Your subject line here[/SUBJECT]
[BODY]
Your email body here...

Best,
Kofi Farkye
Senior Recruiter, Fulfillment Specialist
[/BODY]

This allows the 'Open in Outlook' button to extract ONLY the email content, not your conversational explanation.

SIGNATURE:
Best,
Kofi Farkye
Senior Recruiter, Fulfillment Specialist`
            }]
        };

        const userParts: any[] = [{ text: message }];
        if (attachment) {
            // Normalize MIME types for Gemini. .eml is often message/rfc822 which Gemini doesn't support directly.
            // Mapping it to text/plain allows Gemini to parse the email content as text.
            let mimeType = attachment.mimeType;
            if (mimeType === 'message/rfc822' || mimeType.includes('email') || attachment.base64.startsWith('RnJvbTo')) { // 'From:' in base64
                mimeType = 'text/plain';
            }

            // Fallback for types Gemini doesn't support but are essentially text
            const textTypes = ['application/json', 'application/xml', 'text/csv', 'text/html'];
            if (textTypes.includes(mimeType)) {
                mimeType = 'text/plain';
            }

            userParts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: attachment.base64
                }
            });
        }

        let contents = [
            ...history,
            { role: 'user', parts: userParts }
        ];

        let iteration = 0;
        const maxIterations = 10;

        while (iteration < maxIterations) {
            iteration++;

            // Retry wrapper with exponential backoff and model fallback
            const callGeminiWithRetry = async (payload: any, model: string = MODEL_PRIMARY, maxRetries = 3): Promise<any> => {
                const safetySettings = [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
                ];

                // SANITIZE CONTENTS: Gemini only accepts 'role' and 'parts'. 
                // Any extra fields (metadata, id, thought) in history objects will trigger a 400 error.
                const sanitizedContents = payload.contents.map((m: any) => ({
                    role: m.role,
                    parts: m.parts.map((p: any) => {
                        const part: any = {};
                        if (p.text) part.text = p.text;
                        if (p.inlineData) part.inlineData = p.inlineData;
                        if (p.functionCall) part.functionCall = p.functionCall;
                        if (p.functionResponse) part.functionResponse = p.functionResponse;
                        // CRITICAL: Gemini 3 requires thought_signature to be preserved on ALL parts
                        if (p.thought_signature) part.thought_signature = p.thought_signature;
                        if (p.thoughtSignature) part.thought_signature = p.thoughtSignature; // camelCase fallback
                        if (p.thought !== undefined) part.thought = p.thought; // Preserve thought boolean
                        return part;
                    })
                }));

                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    console.log(`[Command] API Call attempt ${attempt + 1}/${maxRetries + 1} using ${model}`);

                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...payload,
                            contents: sanitizedContents,
                            safetySettings,
                            generationConfig: {
                                thinkingConfig: {
                                    includeThoughts: false,
                                    thinkingLevel: "high"
                                }
                            }
                        })
                    });

                    console.log(`[Command] API Response Status: ${response.status} ${response.statusText}`);

                    const result = await response.json();

                    // Log full response structure for debugging
                    if (result.error) {
                        console.error(`[Command] API Error:`, JSON.stringify(result.error, null, 2));
                    } else {
                        console.log(`[Command] API Success - Candidates: ${result.candidates?.length || 0}, FinishReason: ${result.candidates?.[0]?.finishReason || 'N/A'}`);
                    }

                    // Check for retryable errors
                    const isOverloaded = result.error?.message?.includes('overloaded') ||
                        result.error?.message?.includes('rate limit') ||
                        result.error?.message?.includes('quota') ||
                        result.error?.code === 503 ||
                        result.error?.code === 429;

                    if (result.error && isOverloaded && attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                        console.log(`[Command] Retry ${attempt + 1}/${maxRetries} after ${delay}ms (${result.error.message})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // If primary model exhausted retries due to overload, try fallback
                    if (result.error && isOverloaded && model === MODEL_PRIMARY) {
                        console.log(`[Command] Primary model exhausted, falling back to ${MODEL_FALLBACK}`);
                        return callGeminiWithRetry(payload, MODEL_FALLBACK, 2);
                    }

                    return result;
                }
            };

            const result = await callGeminiWithRetry({ contents, tools, system_instruction: systemInstruction });
            if (result.error) throw new Error(result.error.message || 'Gemini API failed');
            if (!result.candidates?.[0]) throw new Error('No AI response.');

            const content = result.candidates[0].content;
            const finishReason = result.candidates[0]?.finishReason || 'UNKNOWN';

            // Handle known problematic finish reasons
            if (finishReason === 'MALFORMED_FUNCTION_CALL') {
                console.error('[Command] MALFORMED_FUNCTION_CALL detected. Content:', JSON.stringify(content, null, 2));
                console.log('[Command] Attempting recovery with fallback model...');

                // Try fallback model with a text-only recovery prompt
                const recoveryContents = [
                    ...contents,
                    { role: 'user', parts: [{ text: 'Please provide a helpful text response. Do not call any functions.' }] }
                ];

                const fallbackResult = await callGeminiWithRetry(
                    { contents: recoveryContents, tools: [], system_instruction: systemInstruction },
                    MODEL_FALLBACK,
                    1
                );

                if (fallbackResult.candidates?.[0]?.content?.parts?.[0]?.text) {
                    console.log('[Command] Fallback recovery successful');
                    await logToAudit(fallbackResult.candidates[0].content.parts[0].text, 'STOP', null, {
                        original_error: 'MALFORMED_FUNCTION_CALL',
                        recovery_model: MODEL_FALLBACK
                    });
                    return new Response(JSON.stringify({
                        text: fallbackResult.candidates[0].content.parts[0].text,
                        history: contents,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                // If fallback also fails, return graceful error
                console.error('[Command] Fallback recovery also failed');
                await logToAudit(null, finishReason, 'Model attempted malformed function call, fallback failed', { content });
                return new Response(JSON.stringify({
                    text: "I encountered an issue processing that request. Could you try rephrasing with more specific details?",
                    history: contents,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
                console.warn(`[Command] Response blocked: ${finishReason}`);
                await logToAudit(null, finishReason, `Response blocked: ${finishReason}`, {});
                return new Response(JSON.stringify({
                    text: "I couldn't complete that request due to content guidelines. Please try rephrasing.",
                    history: contents,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            if (!content || !content.parts) {
                await logToAudit(null, finishReason, 'Empty content or safety block', { finishReason });
                return new Response(JSON.stringify({
                    text: "I'm sorry, I'm unable to process that request due to my safety guidelines or a technical glitch. Could you try rephrasing?",
                    history: contents,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            contents.push(content);

            const toolCalls = content.parts.filter((p: any) => p.functionCall);
            // Log tool calls for audit
            toolCalls.forEach((tc: any) => accumulatedToolCalls.push({ name: tc.functionCall.name, args: tc.functionCall.args }));
            if (toolCalls.length === 0) {
                // SAVE TO CHAT HISTORY (Persistence)
                try {
                    const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
                    if (userData?.user) {
                        const convId = attachment?.candidate_id || message_conversation_id || 'general';
                        await supabase.from('chat_history').upsert({
                            user_id: userData.user.id,
                            conversation_id: String(convId),
                            messages: contents,
                            metadata: metadata || {},
                            last_message_at: new Date().toISOString()
                        }, { onConflict: 'user_id, conversation_id' });
                    }
                } catch (e) {
                    console.warn('Failed to persist chat history:', e);
                }

                const parts = content.parts || [];
                const thoughtPart = parts.find((p: any) => p.thought);
                const textPart = parts.find((p: any) => p.text && !p.thought);

                const finalResponse = {
                    text: textPart?.text || '',
                    thought: thoughtPart?.text || '',
                    history: contents,
                };

                const finishReason = result.candidates?.[0]?.finishReason || 'STOP';
                const usage = result.usageMetadata || {};

                await logToAudit(finalResponse.text, finishReason, null, {
                    thought: finalResponse.thought,
                    usage_metadata: usage
                });

                return new Response(JSON.stringify(finalResponse), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            if (iteration === maxIterations) break;

            const toolResponses = await Promise.all(toolCalls.map(async (part: any) => {
                const { name, args } = part.functionCall;
                // CRITICAL: Gemini 3 returns thought_signature at PART level, not inside functionCall
                const thoughtSignature = part.thought_signature || part.thoughtSignature;
                console.log(`[Command] Tool ${name}: thought_signature=${!!thoughtSignature}`);
                let resultData;
                try {
                    switch (name) {
                        case ToolName.SEARCH_PROSPECTS: {
                            let query = supabase.from('prospects').select('*');
                            if (args.specialty) query = query.ilike('specialty', `%${args.specialty}%`);
                            if (args.home_state) query = query.eq('home_state', args.home_state.toUpperCase());
                            if (args.status) query = query.eq('status', args.status);
                            if (args.name_contains) query = query.ilike('name', `%${args.name_contains}%`);
                            const { data, error } = await query.limit(10);
                            resultData = error ? { error: error.message } : (data?.length ? data : { message: "No candidates found." });
                            break;
                        }
                        case ToolName.SEARCH_ALL_CANDIDATES: {
                            // Search prospects
                            const { data: prospects, error: pErr } = await supabase
                                .from('prospects')
                                .select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url')
                                .ilike('name', `%${args.name}%`)
                                .limit(10);

                            // Search engagements (active travelers) via joined prospects
                            const { data: engagements, error: eErr } = await supabase
                                .from('engagements')
                                .select(`
                                    id,
                                    prospect_id,
                                    specialty,
                                    facility_name,
                                    start_date,
                                    end_date,
                                    extension_stage,
                                    bill_rate,
                                    prospects!inner(candidate_id, name, email, phone, nova_url, home_state)
                                `)
                                .ilike('prospects.name', `%${args.name}%`)
                                .limit(10);

                            const activeTravelers = (engagements || []).map((e: any) => ({
                                engagement_id: e.id,
                                candidate_id: e.prospects?.candidate_id,
                                name: e.prospects?.name,
                                email: e.prospects?.email,
                                phone: e.prospects?.phone,
                                nova_url: e.prospects?.nova_url,
                                specialty: e.specialty,
                                facility_name: e.facility_name,
                                start_date: e.start_date,
                                end_date: e.end_date,
                                extension_stage: e.extension_stage,
                                source: 'active_traveler'
                            }));

                            resultData = {
                                prospects: prospects || [],
                                active_travelers: activeTravelers,
                                total_found: (prospects?.length || 0) + activeTravelers.length
                            };

                            if (pErr || eErr) {
                                resultData.error = pErr?.message || eErr?.message;
                            }
                            break;
                        }
                        case ToolName.GET_PROSPECT_DETAILS: {
                            let query = supabase.from('prospects').select('*');
                            if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
                            else if (args.name) query = query.ilike('name', `%${args.name}%`);
                            const { data, error } = await query.maybeSingle();
                            resultData = error ? { error: error.message } : (data || { message: "Not found" });
                            break;
                        }
                        case ToolName.LIST_EMAIL_TEMPLATES: {
                            // Query the communication_templates table
                            const { data, error } = await supabase
                                .from('communication_templates')
                                .select('name, category, description')
                                .eq('is_active', true)
                                .order('category');
                            resultData = error
                                ? { error: error.message }
                                : (data?.length ? data : { message: "No templates found." });
                            break;
                        }
                        case ToolName.SEARCH_KNOWLEDGE: {
                            const { data, error } = await supabase
                                .from('knowledge_base')
                                .select('*')
                                .or(`title.ilike.%${args.query}%,content.ilike.%${args.query}%`)
                                .limit(5);
                            resultData = error ? { error: error.message } : (data?.length ? data : { message: "No relevant knowledge found. Try using google_search for external info." });
                            break;
                        }
                        case ToolName.CALCULATE_PAY: {
                            const { data, error } = await supabase.rpc('calculate_pay_package', {
                                p_target_gross: args.target_gross,
                                p_hours_per_week: args.hours || 36,
                                p_state: args.state.toUpperCase(),
                                p_city: args.city,
                                p_profession: 'RN',
                                p_specialty: args.specialty || 'General',
                                p_job_id: 'generated'
                            });
                            if (error) throw error;

                            resultData = JSON.stringify({
                                action: 'PAY_BREAKDOWN',
                                data: {
                                    ...data,
                                    hours: args.hours || 36,
                                    specialty: args.specialty
                                }
                            });
                            break;
                        }
                        case ToolName.CALCULATE_PAY_PACKAGE: {
                            const { target_gross, state, city, specialty, hours } = args;
                            const { data, error } = await supabase.rpc('calculate_pay_package', {
                                p_target_gross: target_gross,
                                p_hours_per_week: hours || 36,
                                p_state: state.toUpperCase(),
                                p_city: city,
                                p_profession: 'RN',
                                p_specialty: specialty || 'General',
                                p_job_id: 'generated'
                            });
                            if (error) throw error;
                            resultData = JSON.stringify({
                                action: 'PAY_PACKAGE_GENERATED',
                                data: { ...data, hours: hours || 36, specialty: specialty }
                            });
                            break;
                        }
                        case ToolName.DRAFT_EMAIL:
                            resultData = { template_used: args.template_id, note: "Drafted." };
                            break;
                        case ToolName.CREATE_FOLLOW_UP: {
                            const { data: userData } = await supabase.auth.getUser();
                            const { data, error } = await supabase.from('follow_ups').insert({
                                candidate_id: args.candidate_id,
                                recruiter_id: userData?.user?.id || '00000000-0000-0000-0000-000000000000',
                                follow_up_type: args.follow_up_type || 'active',
                                scheduled_date: args.scheduled_date,
                                notes: args.notes
                            }).select();
                            resultData = error ? { error: error.message } : data;
                            break;
                        }
                        case ToolName.SAVE_CERTIFICATION: {
                            const { data, error } = await supabase
                                .from('certifications')
                                .upsert([{
                                    candidate_id: args.candidate_id,
                                    cert_name: args.cert_name,
                                    hspa_id: args.hspa_id,
                                    issued_at: args.issued_at,
                                    expires_at: args.expires_at,
                                    is_verified: args.is_verified,
                                    updated_at: new Date().toISOString()
                                }]);
                            if (error) throw error;

                            // Log activity
                            await supabase.from('candidate_activities').insert([{
                                candidate_id: args.candidate_id,
                                type: 'Cert Upload',
                                content: `Verified certification saved: ${args.cert_name} (Expires: ${args.expires_at})`,
                                metadata: { cert_name: args.cert_name, is_verified: args.is_verified }
                            }]);

                            resultData = { status: 'success', cert: args.cert_name };
                            break;
                        }
                        case ToolName.UPDATE_NEGOTIATION: {
                            const updateData: any = {};
                            if (args.target_gross !== undefined) updateData.target_gross = args.target_gross;
                            if (args.target_take_home !== undefined) updateData.target_take_home = args.target_take_home;
                            if (args.rto_requested !== undefined) updateData.rto_requested = args.rto_requested;
                            if (args.notes) updateData.notes = args.notes;

                            const { data, error } = await supabase
                                .from('prospects')
                                .update(updateData)
                                .eq('candidate_id', args.candidate_id);
                            if (error) throw error;

                            // Log activity
                            await supabase.from('candidate_activities').insert([{
                                candidate_id: args.candidate_id,
                                type: 'Negotiation',
                                content: `Negotiation updated: Target Take-Home: $${args.target_take_home || 'N/A'}. RTO: ${args.rto_requested ? 'Yes' : 'No'}.`,
                                metadata: args
                            }]);

                            resultData = { status: 'success', candidate_id: args.candidate_id };
                            break;
                        }
                        case ToolName.GET_PIPELINE_BRIEF: {
                            const { data: statusCounts } = await supabase.rpc('get_prospect_status_counts');
                            const { data: topSpecialties } = await supabase.rpc('get_top_specialties');

                            let briefData;
                            // Fallback if RPCs don't exist yet
                            if (!statusCounts || !topSpecialties) {
                                const { data: all } = await supabase.from('prospects').select('status, specialty');
                                const counts: any = {};
                                const specs: any = {};
                                all?.forEach((p: any) => {
                                    counts[p.status] = (counts[p.status] || 0) + 1;
                                    specs[p.specialty] = (specs[p.specialty] || 0) + 1;
                                });
                                briefData = { counts, top_specialties: Object.entries(specs).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5) };
                            } else {
                                briefData = { statusCounts, topSpecialties };
                            }

                            resultData = JSON.stringify({
                                action: 'PIPELINE_BRIEF',
                                data: briefData
                            });
                            break;
                        }
                        case ToolName.SET_UI_STATE: {
                            resultData = {
                                action: 'UI_STATE_UPDATE',
                                state: {
                                    filter_specialty: args.filter_specialty,
                                    filter_status: args.filter_status,
                                    search_term: args.search_term,
                                    view_mode: args.view_mode
                                }
                            };
                            break;
                        }
                        case ToolName.GOOGLE_SEARCH:
                            resultData = { message: "Grounded Google Search simulating results for: " + args.query };
                            break;
                        case ToolName.SEARCH_TRAVEL_LIST: {
                            let query = supabase.from('travel_candidates').select('*');
                            if (args.facility_contains) {
                                query = query.ilike('facility', `%${args.facility_contains}%`);
                            }
                            if (args.candidate_name) {
                                query = query.ilike('candidate_name', `%${args.candidate_name}%`);
                            }
                            if (args.cleared_status) {
                                query = query.ilike('cleared_status', `%${args.cleared_status}%`);
                            }
                            const { data: travelData, error: travelError } = await query.limit(20);
                            if (travelError) {
                                resultData = { error: travelError.message };
                            } else {
                                resultData = {
                                    count: travelData?.length || 0,
                                    travelers: travelData || []
                                };
                            }
                            break;
                        }
                        case ToolName.GET_TEMPLATE: {
                            const { data: templateData, error: templateError } = await supabase
                                .from('communication_templates')
                                .select('subject_template, body_template, required_variables, description')
                                .eq('category', args.category)
                                .eq('name', args.template_name)
                                .eq('is_active', true)
                                .maybeSingle();

                            if (templateError) {
                                resultData = { error: templateError.message };
                            } else if (!templateData) {
                                resultData = { error: `Template '${args.template_name}' not found in category '${args.category}'.` };
                            } else {
                                resultData = {
                                    action: 'TEMPLATE_RETRIEVED',
                                    template: {
                                        subject: templateData.subject_template,
                                        body: templateData.body_template,
                                        required_variables: templateData.required_variables,
                                        description: templateData.description
                                    },
                                    instructions: 'Populate the {{placeholders}} using data from search_travel_list or get_prospect_details tools. Do NOT ask the user for data you can look up.'
                                };
                            }
                            break;
                        }
                        case ToolName.ADD_PROSPECT: {

                            const validStatuses = ['New', 'Contacted', 'Interested', 'Profile Updates', 'Submittal Ready', 'Submitted', 'Archived'];
                            const inputStatus = args.status || 'New';
                            // Normalize input: capitalize first letter of each word to match enum if possible, or fallback
                            // Actually, let's just find the best match case-insensitive
                            const matchedStatus = validStatuses.find(s => s.toLowerCase() === inputStatus.toLowerCase()) || 'New';

                            const { data: prospectData, error: prospectError } = await supabase
                                .from('prospects')
                                .insert({
                                    candidate_id: Math.floor(Date.now() / 1000), // Simple unique ID generation
                                    name: args.name,
                                    specialty: args.specialty,
                                    email: args.email,
                                    phone: args.phone,
                                    home_state: args.home_state,
                                    status: matchedStatus,
                                    notes: args.notes,
                                    recruiter: 'Kofi Farkye' // Default recruiter
                                })
                                .select()
                                .single();

                            if (prospectError) {
                                resultData = { error: prospectError.message };
                            } else {
                                resultData = {
                                    action: 'PROSPECT_ADDED',
                                    prospect: prospectData,
                                    message: `Successfully added ${args.name} to the pipeline.`
                                };
                            }
                            break;
                        }
                        case ToolName.GENERATE_SUBMITTAL_HIGHLIGHTS: {
                            // Fetch candidate data if ID or name provided
                            let candidateData: any = null;
                            if (args.candidate_id || args.name) {
                                let query = supabase.from('prospects').select('*');
                                if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
                                else if (args.name) query = query.ilike('name', `%${args.name}%`);
                                const { data } = await query.maybeSingle();
                                candidateData = data;
                            }

                            // Get certifications from args or candidate
                            const certs = args.certifications || (candidateData?.certifications as string[]) || [];
                            const profession = args.profession || candidateData?.specialty || 'Healthcare Professional';
                            const candidateName = candidateData?.name || args.name || 'Unknown';

                            // Build highlights
                            const titleLine = certs.length > 0 ? certs.join(' | ') : profession;
                            const experienceLine = candidateData?.specialty
                                ? `Experience in ${candidateData.specialty}`
                                : 'Healthcare experience';
                            const proficiencies = ['Patient Intake', 'Vitals Monitoring', 'Acute Care Settings'];
                            const tenureLine = 'Tenure information available on request';

                            // Build markdown
                            const lines = [
                                `• **${titleLine}**`,
                                `• ${experienceLine}`,
                                `• **Highly Proficient In:**`,
                                ...proficiencies.map(p => `  - ${p}`),
                                `• ${tenureLine}`
                            ];

                            resultData = {
                                action: 'SUBMITTAL_HIGHLIGHTS_GENERATED',
                                candidate_name: candidateName,
                                highlights: lines.join('\n'),
                                raw: { titleLine, experienceLine, proficiencies, tenureLine }
                            };
                            break;
                        }
                        default:
                            resultData = { error: "Tool not implemented" };
                    }
                } catch (e: any) {
                    resultData = { error: e.message };
                }
                // Include thought_signature if present (required for Gemini 3)
                const response: any = { functionResponse: { name, response: { content: resultData } } };
                if (thoughtSignature) response.thought_signature = thoughtSignature;
                return response;
            }));

            contents.push({ role: 'function', parts: toolResponses });
        }

        return new Response(JSON.stringify({
            role: 'model',
            parts: [{ text: "I've searched several times but am having trouble finding that specific data. Could you try providing more details?" }]
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[Command] Edge Function Crash:', error);
        // Log error to audit (best effort, may fail if supabase isn't initialized)
        try {
            await supabase.from('ai_audit_logs').insert({
                function_name: 'chat-command-center',
                error_message: error.message,
                error_details: { stack: error.stack }
            });
        } catch { } // Silent fail on audit log
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
