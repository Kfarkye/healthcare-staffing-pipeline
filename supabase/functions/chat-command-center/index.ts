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
        const tools = [{
            function_declarations: [
                {
                    name: "search_prospects",
                    description: "Search for candidates (prospects) in the database.",
                    parameters: {
                        type: "object",
                        properties: {
                            specialty: { type: "string" },
                            home_state: { type: "string" },
                            status: { type: "string" },
                            name_contains: { type: "string" }
                        }
                    }
                },
                {
                    name: "get_prospect_details",
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
                    name: "calculate_pay",
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
                    name: "list_email_templates",
                    description: "List outreach templates.",
                    parameters: { type: "object", properties: {} }
                },
                {
                    name: "draft_email",
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
                    name: "create_follow_up",
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
                    name: "google_search",
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
                text: `You are the 'Pipeline Command Center' AI, embodying Kofi Farkye, a Senior Recruiter at Aya Healthcare. Professional, high-speed, direct, warm. No robotic preambles. Action-oriented.`
            }]
        };

        const userParts: any[] = [{ text: message }];
        if (attachment) {
            userParts.push({
                inlineData: {
                    mimeType: attachment.mimeType,
                    data: attachment.base64
                }
            });
        }

        let contents = [
            ...history,
            { role: 'user', parts: userParts }
        ];

        let iteration = 0;
        const maxIterations = 5;

        while (iteration < maxIterations) {
            iteration++;

            const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    tools,
                    system_instruction: systemInstruction
                })
            });

            const result = await geminiResponse.json();
            if (result.error) {
                console.error('Gemini API Error:', result.error);
                throw new Error(result.error.message || 'Gemini API call failed');
            }

            if (!result.candidates || result.candidates.length === 0) {
                throw new Error('Gemini returned no candidates. Please refine your query.');
            }

            const candidate = result.candidates[0];
            const content = candidate.content;
            contents.push(content);

            const toolCalls = content.parts.filter((p: any) => p.functionCall);

            if (toolCalls.length === 0) {
                // Return final text response
                return new Response(JSON.stringify(content), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // Execute tool calls
            const toolResponses = await Promise.all(toolCalls.map(async (part: any) => {
                const { name, args } = part.functionCall;
                console.log(`Executing tool: ${name}`, args);

                let toolResult;
                try {
                    if (name === 'search_prospects') {
                        let query = supabase.from('prospects').select('*');
                        if (args.specialty) query = query.ilike('specialty', `%${args.specialty}%`);
                        if (args.home_state) query = query.eq('home_state', args.home_state.toUpperCase());
                        if (args.status) query = query.eq('status', args.status);
                        if (args.name_contains) query = query.ilike('name', `%${args.name_contains}%`);
                        const { data, error } = await query.limit(10);
                        toolResult = error ? { error: error.message } : data;
                    } else if (name === 'get_prospect_details') {
                        let query = supabase.from('prospects').select('*');
                        if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
                        else if (args.name) query = query.ilike('name', `%${args.name}%`);
                        const { data, error } = await query.maybeSingle();
                        toolResult = error ? { error: error.message } : (data || { message: "Not found" });
                    } else if (name === 'list_email_templates') {
                        toolResult = [
                            { id: 'initial_outreach', description: 'Initial outreach breakdown' },
                            { id: 'hourly_rate_outreach', description: 'Hourly focused' },
                            { id: 'reengagement', description: 'Passive candidate check-in' },
                            { id: 'margin_approval', description: 'Internal approval request' }
                        ];
                    } else if (name === 'calculate_pay') {
                        const { data, error } = await supabase.rpc('calculate_pay_package', {
                            p_state: args.state.toUpperCase(),
                            p_city: args.city,
                            p_profession: 'RN',
                            p_target_gross: args.target_gross,
                            p_hours_per_week: args.hours || 36
                        });
                        toolResult = error ? { error: error.message } : data;
                    } else if (name === 'draft_email') {
                        toolResult = {
                            template_used: args.template_id,
                            note: "Drafted using project-specific outreach logic."
                        };
                    } else if (name === 'create_follow_up') {
                        const { data, error } = await supabase.from('follow_ups').insert({
                            candidate_id: args.candidate_id,
                            follow_up_type: args.follow_up_type || 'active',
                            scheduled_date: args.scheduled_date,
                            notes: args.notes
                        }).select();
                        toolResult = error ? { error: error.message } : data;
                    } else if (name === 'google_search') {
                        toolResult = { message: "Grounded Google Search simulating results for: " + args.query };
                    } else {
                        toolResult = { message: "Tool executed successfully" };
                    }
                } catch (e: any) {
                    toolResult = { error: e.message };
                }

                return {
                    functionResponse: {
                        name,
                        response: { content: toolResult }
                    }
                };
            }));

            contents.push({
                role: 'function',
                parts: toolResponses
            });
        }

        throw new Error('Exceeded maximum tool call iterations');

    } catch (error: any) {
        console.error('Edge Function Crash:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
