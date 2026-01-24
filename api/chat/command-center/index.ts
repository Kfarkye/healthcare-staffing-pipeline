import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, UIMessage, stepCountIs } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createCommandCenterTools } from './tools';

export const config = {
    runtime: 'edge',
};

// Model configuration with fallback
const MODEL_PRIMARY = 'gemini-3-pro-preview';
const MODEL_FALLBACK = 'gemini-3-flash-preview';

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

export default async function handler(req: Request) {
    // Only allow POST
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const startTime = Date.now();

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const { messages, context, metadata }: {
        messages: UIMessage[];
        context?: Record<string, any>;
        metadata?: Record<string, any>;
    } = await req.json();

    // Get user from auth header if present
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let userId: string | null = null;

    if (token) {
        const { data: userData } = await supabase.auth.getUser(token);
        userId = userData?.user?.id || null;
    }

    // Create tools with Supabase client
    const tools = createCommandCenterTools(supabase);

    // Build context-aware system prompt
    let contextualizedPrompt = systemPrompt;
    if (context) {
        contextualizedPrompt += `\n\nCURRENT CONTEXT:\n${JSON.stringify(context, null, 2)}`;
    }

    try {
        // Primary model attempt
        const result = await streamText({
            model: google(MODEL_PRIMARY),
            system: contextualizedPrompt,
            messages: await convertToModelMessages(messages),
            tools,
            stopWhen: stepCountIs(10), // Allow up to 10 tool call iterations
            onFinish: async ({ text, finishReason, usage }) => {
                // Audit logging
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

        return result.toUIMessageStreamResponse();

    } catch (error: any) {
        console.error('[Command Center] Primary model failed:', error.message);

        // Fallback to Flash model
        if (error.message?.includes('overloaded') || error.message?.includes('rate limit')) {
            console.log('[Command Center] Falling back to Flash model');

            const fallbackResult = await streamText({
                model: google(MODEL_FALLBACK),
                system: contextualizedPrompt,
                messages: await convertToModelMessages(messages),
                tools,
                stopWhen: stepCountIs(10),
            });

            return fallbackResult.toUIMessageStreamResponse();
        }

        // Return error response
        return new Response(JSON.stringify({ error: error.message || 'AI request failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

