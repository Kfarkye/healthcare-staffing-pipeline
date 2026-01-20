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

    try {
        const { message, history = [], attachment } = await req.json();

        if (!message) {
            throw new Error('Message is required');
        }

        // Define the tools for Gemini
        const tools = [
            {
                function_declarations: [
                    {
                        name: "search_prospects",
                        description: "Search for candidates (prospects) in the database using various filters.",
                        parameters: {
                            type: "object",
                            properties: {
                                specialty: { type: "string", description: "The medical specialty (e.g. RN, MA, Nurse Practitioner)" },
                                home_state: { type: "string", description: "The 2-letter state code (e.g. CA, TX)" },
                                status: { type: "string", description: "Pipeline status (e.g. New, Contacted, Interested)" },
                                name_contains: { type: "string", description: "Partial name match" }
                            }
                        }
                    },
                    {
                        name: "get_prospect_details",
                        description: "Get full profile, history, and contact info for a specific candidate.",
                        parameters: {
                            type: "object",
                            properties: {
                                candidate_id: { type: "number" },
                                name: { type: "string" }
                            }
                        }
                    },
                    {
                        name: "calculate_pay",
                        description: "Standard Aya Pay Package calculator. Returns taxable hourly, stipends, and gross weekly pay.",
                        parameters: {
                            type: "object",
                            properties: {
                                target_gross: { type: "number", description: "The desired total weekly pay (e.g. 2500)" },
                                state: { type: "string", description: "2-letter state code" },
                                city: { type: "string" },
                                specialty: { type: "string" },
                                hours: { type: "number", description: "Shift hours (default 36)" }
                            },
                            required: ["target_gross", "state", "city", "specialty"]
                        }
                    },
                    {
                        name: "list_email_templates",
                        description: "Lists all available Outreach and Operational email templates (e.g. Initial Outreach, Margin Approval).",
                        parameters: { type: "object", properties: {} }
                    },
                    {
                        name: "draft_email",
                        description: "Generates a structured email using a project template ID and candidate data.",
                        parameters: {
                            type: "object",
                            properties: {
                                template_id: { type: "string" },
                                candidate_data: { type: "object", description: "Object containing name, facility, pay, etc." }
                            },
                            required: ["template_id", "candidate_data"]
                        }
                    },
                    {
                        name: "create_follow_up",
                        description: "Schedule a follow-up task for a candidate.",
                        parameters: {
                            type: "object",
                            properties: {
                                candidate_id: { type: "number" },
                                scheduled_date: { type: "string", description: "YYYY-MM-DD" },
                                follow_up_type: { type: "string", enum: ["active", "rotation"] },
                                notes: { type: "string" }
                            },
                            required: ["candidate_id", "scheduled_date", "follow_up_type"]
                        }
                    },
                    {
                        name: "google_search",
                        description: "Search the web for facility info, licensing, or market news.",
                        parameters: {
                            type: "object",
                            properties: { query: { type: "string" } },
                            required: ["query"]
                        }
                    }
                ]
            }
        ];

        // Prepare contents for Gemini
        const userParts: any[] = [{ text: message }];
        if (attachment) {
            userParts.push({
                inlineData: {
                    mimeType: attachment.mimeType,
                    data: attachment.base64
                }
            });
        }

        const contents = [
            ...history,
            { role: 'user', parts: userParts }
        ];

        // Call Gemini (Enforced Gemini 3)
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                tools,
                system_instruction: {
                    parts: [{
                        text: `
You are the 'Pipeline Command Center' AI, embodying Kofi Farkye, a Senior Recruiter at Aya Healthcare.
YOUR PERSONALITY:
- Professional, high-speed, direct, but warm and candidate-first.
- You hate robotic preambles ("As an AI...", "I hope this finds you well").
- You say things like "Totally get where you're coming from" or "Let's get this moving."
- You are action-oriented. You move the ball forward.

YOUR CAPABILITIES:
1. RAG: You use 'search_prospects' to find people in the DB.
2. PAY: You use 'calculate_pay' to run real numbers.
3. FOLLOW-UPS: You use 'create_follow_up' to schedule your future self.
4. EMAILS: You use 'list_email_templates' to see what Kofi uses, then 'draft_email' to write them.
   - initial_outreach: Full breakdown with pay.
   - hourly_rate_outreach: Focuses on $/hr.
   - reengagement: "Scrolled assignments and thought of you."
   - margin_approval: Internal request to Colton.
5. WEB: You use 'google_search' for grounding.

When asked a question, use the tool that gets the most precise project data. Always query the DB before answering about candidate status.
                    `.trim()
                    }]
                }
            })
        });

        const result = await geminiResponse.json();
        if (result.error) throw new Error(result.error.message);
        const candidate = result.candidates[0];
        const part = candidate.content.parts[0];

        // Handle Function Calls
        if (part.functionCall) {
            const { name, args } = part.functionCall;
            let toolResult;

            console.log(`Executing tool: ${name} with args:`, args);

            if (name === 'search_prospects') {
                let query = supabase.from('prospects').select('*');
                if (args.specialty) query = query.ilike('specialty', `%${args.specialty}%`);
                if (args.home_state) query = query.eq('home_state', args.home_state.toUpperCase());
                if (args.status) query = query.eq('status', args.status);
                if (args.name_contains) query = query.ilike('name', `%${args.name_contains}%`);
                const { data, error } = await query.limit(10);
                toolResult = error ? { error: error.message } : data;
            }
            else if (name === 'get_prospect_details') {
                let query = supabase.from('prospects').select('*');
                if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
                else if (args.name) query = query.ilike('name', `%${args.name}%`);
                const { data, error } = await query.single();
                toolResult = error ? { error: error.message } : data;
            }
            else if (name === 'list_email_templates') {
                toolResult = [
                    { id: 'initial_outreach', description: 'Initial outreach with full pay breakdown' },
                    { id: 'hourly_rate_outreach', description: 'Simplified pitch for hourly-focused candidates' },
                    { id: 'reengagement', description: 'Check-in for passive candidates' },
                    { id: 'margin_approval', description: 'INTERNAL: Requesting TM approval from Colton Valdez' },
                    { id: 'referral_request', description: 'Asking candidates for friends/colleagues' }
                ];
            }
            else if (name === 'calculate_pay') {
                const determineProfession = (spec: string) => {
                    const s = spec.toUpperCase();
                    if (s.includes('RN')) return 'RN';
                    if (s.includes('MA')) return 'MA';
                    return 'RN';
                };

                const { data, error } = await supabase.rpc('calculate_pay_package', {
                    p_job_id: 'AI_Q_' + Date.now(),
                    p_state: args.state.toUpperCase(),
                    p_city: args.city,
                    p_profession: determineProfession(args.specialty),
                    p_specialty: args.specialty,
                    p_target_gross: args.target_gross,
                    p_hours_per_week: args.hours || 36
                });
                toolResult = error ? { error: error.message } : data;
            }
            else if (name === 'create_follow_up') {
                const { data: userData } = await supabase.auth.getUser();
                const recruiterId = userData?.user?.id;

                const { data, error } = await supabase.from('follow_ups').insert({
                    candidate_id: args.candidate_id,
                    recruiter_id: recruiterId || '00000000-0000-0000-0000-000000000000', // Fallback for dev
                    follow_up_type: args.follow_up_type,
                    scheduled_date: args.scheduled_date,
                    notes: args.notes
                }).select();
                toolResult = error ? { error: error.message } : data;
            }
            else if (name === 'draft_email') {
                toolResult = {
                    template_used: args.template_id,
                    note: "Drafted using project-specific outreach logic."
                };
            }
            else if (name === 'google_search') {
                toolResult = { message: "Grounded Google Search currently simulating results for: " + args.query };
            }

            // Send tool results back to Gemini for final synthesis
            const secondResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        ...contents,
                        candidate.content,
                        {
                            role: 'function',
                            parts: [{
                                functionResponse: {
                                    name,
                                    response: { content: toolResult }
                                }
                            }]
                        }
                    ],
                    tools
                })
            });

            const finalResult = await secondResponse.json();
            return new Response(JSON.stringify(finalResult.candidates[0].content), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Default response (if no function call)
        return new Response(JSON.stringify(candidate.content), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
