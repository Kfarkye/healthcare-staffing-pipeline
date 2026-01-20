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
        GOOGLE_SEARCH: 'google_search'
    };

    try {
        const { message, history = [], attachment, conversation_id: message_conversation_id } = await req.json();

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
                }
            ]
        }];

        const systemInstruction = {
            parts: [{
                text: `You are the 'Pipeline Command Center' AI (Kofi Farkye, Senior Recruiter, Aya Healthcare). Professional, high-speed, direct, warm. No robotic preambles. Action-oriented.

Knowledge Retrieval:
- Use 'search_knowledge' to find corporate benefits, insurance details, and policies.
- Do NOT guess benefits; query the database.
- If knowledge is not found, use 'google_search' for current external info.

Pay Package Workflow (CRITICAL):
- When an attachment is provided (PDF, EML, Image), check if it's a pay package or job breakdown.
- OCR/Extract: Look for 'Gross Weekly', 'Hourly Rate', 'Hours', 'Specialty', 'City/State'.
- If details are found: 
  1. Call 'calculate_pay' with the extracted values.
  2. Present the breakdown clearly.
  3. Offer to ‘Draft Outreach’ immediately.
- For .EML (Email) attachments: Summarize the email first, then extract potential job/pay details.
- Always use the 'DRAFT_EMAIL' tool to generate outreach once pay is confirmed.

Email Outreach Quality (MANDATORY):
- All outreach drafts must end with these 3 critical questions:
  1. Are you available to start on [extracted start date]?
  2. Do you have any time-off requests during the contract?
  3. Is your profile current?`
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

            const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents, tools, system_instruction: systemInstruction })
            });

            const result = await geminiResponse.json();
            if (result.error) throw new Error(result.error.message || 'Gemini API failed');
            if (!result.candidates?.[0]) throw new Error('No AI response.');

            const content = result.candidates[0].content;
            if (!content || !content.parts) {
                return new Response(JSON.stringify({
                    role: 'model',
                    parts: [{ text: "I'm sorry, I'm unable to process that request due to my safety guidelines or a technical glitch. Could you try rephrasing?" }]
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            contents.push(content);

            const toolCalls = content.parts.filter((p: any) => p.functionCall);
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

                return new Response(JSON.stringify(content), {
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
                                p_state: args.state.toUpperCase(),
                                p_city: args.city,
                                p_profession: 'RN',
                                p_target_gross: args.target_gross,
                                p_hours_per_week: args.hours || 36
                            });
                            resultData = error ? { error: error.message } : data;
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

            contents.push({ role: 'function', parts: toolResponses });
        }

        return new Response(JSON.stringify({
            role: 'model',
            parts: [{ text: "I've searched several times but am having trouble finding that specific data. Could you try providing more details?" }]
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Edge Function Crash:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
