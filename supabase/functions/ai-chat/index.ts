import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { messages, primary_provider, secondary_provider, temperature, max_tokens } = await req.json();
        const startTime = Date.now();

        const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
        const openAIKey = Deno.env.get('OPENAI_API_KEY') || '';
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseClient = createClient(supabaseUrl, supabaseKey);

        // ADAPTERS & ROUTER (Inlined for Deno compatibility in Supabase Edge Functions)

        const callGemini = async (messages: any[], apiKey: string) => {
            const model = "gemini-3-flash-preview"; // Upgraded to Gemini 3
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = {
                contents: messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
                generationConfig: { temperature: temperature ?? 0.7, maxOutputTokens: max_tokens ?? 1024 }
            };
            const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
            const result = await res.json();
            if (!res.ok) throw { code: `GEMINI_${res.status}`, message: result.error?.message, retryable: [429, 503].includes(res.status) };
            return {
                text: result.candidates?.[0]?.content?.parts?.[0]?.text || '',
                model,
                usage: { prompt_tokens: result.usageMetadata?.promptTokenCount || 0, completion_tokens: result.usageMetadata?.candidatesTokenCount || 0, total_tokens: result.usageMetadata?.totalTokenCount || 0 }
            };
        };

        const callOpenAI = async (messages: any[], apiKey: string) => {
            const model = "gpt-4o";
            const url = "https://api.openai.com/v1/chat/completions";
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: m.content })), temperature: temperature ?? 0.7, max_tokens: max_tokens ?? 1024 })
            });
            const result = await res.json();
            if (!res.ok) throw { code: `OPENAI_${res.status}`, message: result.error?.message, retryable: [429, 503].includes(res.status) };
            return {
                text: result.choices?.[0]?.message?.content || '',
                model: result.model,
                usage: { prompt_tokens: result.usage?.prompt_tokens || 0, completion_tokens: result.usage?.completion_tokens || 0, total_tokens: result.usage?.total_tokens || 0 }
            };
        };

        let result: any;
        let usedProvider = primary_provider;
        let error: any = null;

        try {
            if (primary_provider === 'gemini') result = await callGemini(messages, geminiKey);
            else result = await callOpenAI(messages, openAIKey);
        } catch (e: any) {
            console.warn(`Primary ${primary_provider} failed, trying secondary ${secondary_provider}...`, e);
            if (secondary_provider && e.retryable) {
                usedProvider = secondary_provider;
                try {
                    if (secondary_provider === 'gemini') result = await callGemini(messages, geminiKey);
                    else result = await callOpenAI(messages, openAIKey);
                    error = null;
                } catch (e2: any) {
                    error = e2;
                }
            } else {
                error = e;
            }
        }

        const responsePayload = {
            schema_version: "chat.v1",
            message_id: crypto.randomUUID(),
            provider: usedProvider,
            model: result?.model || "error",
            text: result?.text || (error ? "Service busy—retry" : "Unexpected error"),
            usage: result?.usage,
            error: error ? { code: error.code, message: error.message, retryable: error.retryable } : undefined
        };

        // Logging
        console.log(`[AI-CHAT] Provider: ${usedProvider}, Status: ${error ? 'FAIL' : 'OK'}, Latency: ${Date.now() - startTime}ms`);

        // Attempt audit log if table exists
        try {
            const authHeader = req.headers.get('Authorization');
            const userRes = authHeader ? await supabaseClient.auth.getUser(authHeader.replace('Bearer ', '')) : null;
            await supabaseClient.from('ai_audit_logs').insert({
                user_id: userRes?.data?.user?.id,
                function_name: 'ai-chat-v1',
                input_message: messages[messages.length - 1]?.content,
                output_text: responsePayload.text,
                latency_ms: Date.now() - startTime,
                finish_reason: error ? 'ERROR' : 'STOP',
                input_metadata: { provider: usedProvider, model: responsePayload.model, schema_version: "chat.v1" }
            });
        } catch { /* Ignore logging failures */ }

        return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err: any) {
        return new Response(JSON.stringify({
            schema_version: "chat.v1",
            message_id: crypto.randomUUID(),
            provider: "none",
            model: "error",
            text: "Critical failure",
            error: { code: "CRITICAL", message: err.message, retryable: false }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
