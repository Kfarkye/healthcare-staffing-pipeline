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

    const googleApiKey = Deno.env.get('GEMINI_API_KEY');

    // Production Guard: API Key Validation
    if (!googleApiKey) {
        console.error('[research-chat] GEMINI_API_KEY not configured');
        return new Response(JSON.stringify({ error: 'AI service not configured' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const { message, history } = await req.json();

        if (!message) throw new Error('Message is required');

        // Using gemini-3-flash-preview for Gemini 3.0 family with search grounding.

        const body = {
            contents: [
                ...history,
                { role: 'user', parts: [{ text: message }] }
            ],
            tools: [{
                google_search_retrieval: {
                    dynamic_retrieval_config: {
                        mode: "MODE_DYNAMIC",
                        dynamic_threshold: 0.3,
                    },
                },
            }],
            system_instruction: {
                parts: [{
                    text: `You are 'Stealth Intelligence', a premium research assistant for healthcare travelers. 
                    
                    EXPERTISE:
                    1. State Licensing: Provide accurate timelines, fees, and requirements (Compact vs. Single State).
                    2. Facility Intelligence: Research hospitals, their trauma levels, units, and traveler feedback.
                    3. Market Trends: Salary expectations and housing availability.

                    GUIDELINES:
                    - Use Google Search grounding for EVERY response to ensure up-to-the-minute accuracy.
                    - Always cite your findings using the grounding metadata provided.
                    - Maintain a clinical, high-authority, and helpful tone.
                    - If asked about specific people, focus on professional facility details.`
                }]
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (result.error) {
            console.error('Gemini Error:', result.error);
            throw new Error(result.error.message || 'Gemini API failed');
        }

        return new Response(JSON.stringify(result), {
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
