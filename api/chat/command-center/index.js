import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createCommandCenterTools } from './tools.js';

export const config = {
    runtime: 'edge',
};

const MODEL_PRIMARY = 'gemini-2.0-flash';

const systemPrompt = `You are the 'Pipeline Command Center' AI (Kofi Farkye, Senior Recruiter, Fulfillment Specialist, P: 858-529-7267 Ext: 17017, Aya Healthcare). 

AMBIENT AWARENESS:
- You are aware of the user's dashboard view via the 'context' object (active candidate, current filters).
- If the user asks about 'this person' or 'this list', refer to the context.

Pillars of Operation:
1. Executive Reporting: Use 'get_pipeline_brief' to summarize the recruiter's entire world.
2. AI-Driven Navigation: Use 'set_ui_state' to instantly update the recruiter's dashboard based on their commands.
3. Rapid Extension: You are the master of the "Working List". When asked about extensions, use the 'search_travel_list' tool.

DYNAMIC TEMPLATE GROUNDING:
When the user asks to draft, send, or compose ANY standard communication, you MUST:
1. FIRST call 'list_email_templates' to discover available templates (returns name, category, description).
2. Call 'get_template' with the matching template name from step 1.
3. Call 'search_travel_list' to fetch the REAL candidate data (specifically 'current_end_date') if needed.
4. COMPUTE DATES:
   - If the user specifies a duration (e.g., "13 weeks"), ADD that duration to the 'current_end_date' to find the 'Proposed Extension Dates'.
   - Format: "[Duration] (Starting [Current End Date + 1 day] - Ending [Calculated Date])"
5. Replace all {{placeholders}} in the template with the real data and your calculated dates.
6. Present the FULLY POPULATED template.

Template Categories: active (extensions), prospect (outreach/licensing), retention (reassignments).

SIGNATURE:
Best,
Kofi Farkye
Senior Recruiter, Fulfillment Specialist`;

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const startTime = Date.now();

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!googleApiKey) {
        return new Response(JSON.stringify({ error: 'Missing Google API Key' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const google = createGoogleGenerativeAI({ apiKey: googleApiKey });

    let body;
    try {
        body = await req.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { messages = [], context, metadata } = body;

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let userId = null;

    if (token) {
        const { data: userData } = await supabase.auth.getUser(token);
        userId = userData?.user?.id || null;
    }

    const tools = createCommandCenterTools(supabase);

    let contextualizedPrompt = systemPrompt;
    if (context) {
        contextualizedPrompt += `\n\nCURRENT CONTEXT:\n${JSON.stringify(context, null, 2)}`;
    }

    try {
        const result = await streamText({
            model: google(MODEL_PRIMARY),
            system: contextualizedPrompt,
            messages: messages,
            tools,
            maxSteps: 10,
            onFinish: async ({ text, finishReason, usage }) => {
                try {
                    await supabase.from('ai_audit_logs').insert({
                        user_id: userId,
                        function_name: 'command-center-vercel',
                        input_message: messages[messages.length - 1]?.content || '',
                        input_metadata: { context_keys: context ? Object.keys(context) : [], ...metadata },
                        output_text: text,
                        finish_reason: finishReason,
                        latency_ms: Date.now() - startTime,
                        token_usage: usage,
                    });
                } catch (e) {
                    console.warn('[Audit] Failed to write audit log:', e);
                }
            },
        });

        return result.toTextStreamResponse();

    } catch (error) {
        console.error('[Command Center] Error:', error.message);
        return new Response(JSON.stringify({ error: error.message || 'AI request failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

