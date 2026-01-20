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
        SET_UI_STATE: 'set_ui_state'
    };

    try {
        const { message, history, attachment, conversation_id: message_conversation_id, context } = await req.json();
        const startTime = Date.now();
        let accumulatedToolCalls: any[] = [];
        console.log(`[Command] Processing: "${message}" ${context ? '(with ambient context)' : ''}`);

        // Helper to write audit log
        const logToAudit = async (outputText: string | null, finishReason: string | null, errorMessage: string | null = null, errorDetails: any = null) => {
            try {
                const { data: userData } = await supabase.auth.getUser();
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
                    description: "Search for candidates (prospects) in the database.",
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
                }
            ]
        }];

        const systemInstruction = {
            parts: [{
                text: `You are the 'Pipeline Command Center' AI (Kofi Farkye, Senior Recruiter, Aya Healthcare). 

AMBIENT AWARENESS:
- You are aware of the user's dashboard view via the 'context' object (active candidate, current filters).
- If the user asks about 'this person' or 'this list', refer to the context.

Pillars of Operation:
1. Executive Reporting: Use 'get_pipeline_brief' to summarize the recruiter's entire world.
2. AI-Driven Navigation: Use 'set_ui_state' to instantly update the recruiter's dashboard based on their commands.
3. Pay & Cert Accuracy: OCR and extract data from attachments to update negotiations and certifications (Diamond Standard).

Email Outreach Quality (THE RADIANT STANDARD):
- COLD OUTREACH (Initial): You MUST strictly follow the 'Aya Editorial Standard' template below. No drift allowed.
- CANDIDATE RESPONSE (Follow-up): Do NOT use the rigid template. Be conversational, direct, and address their specific points. Refer to previous pay/job details naturally. Only include the '3 Questions' footer if they remain unanswered.

AYA EDITORIAL STANDARD (For Cold Outreach):
FORMAT:
Subject: [Position Name] – [Facility Name] | $[Gross Weekly Pay]/week

Hi [Candidate First Name],

[Hook - e.g., Thanks for your interest in the position at Facility Name. Here's the full breakdown — this looks like an excellent match for your background:]

Facility: [Facility Name]
Location: [City, State]
Assignment Dates: [Start Date] – [End Date]
Shifts & Hours: [Shift - e.g., Day/Night/Mid] ([Hours] hours/week)

Pay Package:
Taxable Hourly Rate: $[Rate]/hr
Meals & Housing Stipend: $[Stipend]/week
Total Gross Weekly Pay: $[Gross Weekly]

[Closing - e.g., This role is moving quickly — I can get you submitted today if everything looks good.]

To move forward, just confirm:
- Are you available to start [Start Date]?
- Do you have any time-off requests during the contract?
- Is your Aya profile current (work history, certs, skills checklist)?

Thank you!`
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

            // Retry wrapper with exponential backoff
            const callGeminiWithRetry = async (payload: any, maxRetries = 3): Promise<any> => {
                const safetySettings = [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
                ];

                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    console.log(`[Command] API Call attempt ${attempt + 1}/${maxRetries + 1}`);

                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${googleApiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...payload,
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
                        result.error?.code === 503 ||
                        result.error?.code === 429;

                    if (result.error && isOverloaded && attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                        console.log(`[Command] Retry ${attempt + 1}/${maxRetries} after ${delay}ms (${result.error.message})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
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
                await logToAudit(null, finishReason, 'Model attempted malformed function call', { content });
                return new Response(JSON.stringify({
                    text: "I tried to call a tool but encountered an issue. Could you rephrase your request with more details? For example, try 'Draft reply for [Candidate Name]'.",
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
                    const { data: userData } = await supabase.auth.getUser();
                    if (userData?.user) {
                        const convId = attachment?.candidate_id || message_conversation_id || 'general';
                        await supabase.from('chat_history').upsert({
                            user_id: userData.user.id,
                            conversation_id: String(convId),
                            messages: contents,
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
                        case ToolName.GET_PROSPECT_DETAILS: {
                            let query = supabase.from('prospects').select('*');
                            if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
                            else if (args.name) query = query.ilike('name', `%${args.name}%`);
                            const { data, error } = await query.maybeSingle();
                            resultData = error ? { error: error.message } : (data || { message: "Not found" });
                            break;
                        }
                        case ToolName.LIST_EMAIL_TEMPLATES: {
                            const { data, error } = await supabase.from('email_templates').select('id, name, category, description').eq('is_active', true);
                            resultData = error ? { error: error.message } : (data?.length ? data : [
                                { id: 'initial_outreach', description: 'Initial outreach' },
                                { id: 'reengagement', description: 'Check-in' }
                            ]);
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
                                p_profession: 'RN'
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
                        default:
                            resultData = { error: "Tool not implemented" };
                    }
                } catch (e: any) {
                    resultData = { error: e.message };
                }
                return { functionResponse: { name, response: { content: resultData } } };
            }));

            contents.push({ role: 'user', parts: toolResponses });
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
