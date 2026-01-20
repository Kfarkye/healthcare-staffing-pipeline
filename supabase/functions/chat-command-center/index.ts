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
        const { message, history = [] } = await req.json();

        if (!message) {
            throw new Error('Message is required');
        }

        // Define the tools for Gemini
        const tools = [
            {
                function_declarations: [
                    {
                        name: "search_prospects",
                        description: "Search for candidates (prospects) in the database using various filters like specialty, home state, or status.",
                        parameters: {
                            type: "object",
                            properties: {
                                specialty: { type: "string", description: "The medical specialty (e.g. RN, MA, Nurse Practitioner)" },
                                home_state: { type: "string", description: "The 2-letter state code of the candidate (e.g. CA, TX)" },
                                status: { type: "string", description: "Current pipeline status (e.g. New, Contacted, Interested)" },
                                name_contains: { type: "string", description: "Partial match for the candidate name" }
                            }
                        }
                    },
                    {
                        name: "get_prospect_details",
                        description: "Get the full profile and history for a specific candidate by name or ID.",
                        parameters: {
                            type: "object",
                            properties: {
                                candidate_id: { type: "number", description: "The unique ID of the candidate" },
                                name: { type: "string", description: "The full name of the candidate" }
                            }
                        }
                    },
                    {
                        name: "get_pay_package",
                        description: "Retrieve pay package details for a specific job ID.",
                        parameters: {
                            type: "object",
                            properties: {
                                job_id: { type: "string", description: "The unique job ID (e.g. 1234567)" }
                            },
                            required: ["job_id"]
                        }
                    },
                    {
                        name: "google_search",
                        description: "Perform a Google search to find external information like facility details, licensing laws, or news.",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "The search query" }
                            },
                            required: ["query"]
                        }
                    }
                ]
            }
        ];

        // Prepare contents for Gemini
        const contents = [
            ...history,
            { role: 'user', parts: [{ text: message }] }
        ];

        // Call Gemini to get tool recommendations or response
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                tools,
                system_instruction: {
                    parts: [{ text: "You are the 'Pipeline Command Center' AI. You help Kofi Farkye, a recruiter, manage healthcare staffing. Use your tools to find data in the Supabase DB. When asked about candidates, jobs, or pay, use the appropriate search tools. If you don't have enough info, ask clarifying questions. Your tone is professional, direct, and action-oriented." }]
                }
            })
        });

        const result = await geminiResponse.json();
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
            else if (name === 'get_pay_package') {
                const { data, error } = await supabase.from('pay_packages').select('*').eq('job_id', args.job_id).single();
                toolResult = error ? { error: error.message } : data;
            }
            else if (name === 'google_search') {
                // Since we can't easily perform a real Google search here without an API key, 
                // we'll return a placeholder or use the built-in search tool if supported.
                // For now, let's assume we might use a search API or simulate results.
                toolResult = { message: "Grounded Google Search is currently in integration phase. Returning simulated info for: " + args.query };
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
