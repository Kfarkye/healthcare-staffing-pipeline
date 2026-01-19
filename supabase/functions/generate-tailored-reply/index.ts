import { createClient } from 'npm:@supabase/supabase-js@2';

// CORS helper with development origin detection
function getCorsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin');
    const APP_URL = Deno.env.get('APP_URL') || '';

    const isDevOrigin = origin && (
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('webcontainer') ||
        origin.includes('stackblitz') ||
        origin.includes('local-credentialless') ||
        origin.includes('bolt.host') ||
        origin.includes('bolt.new')
    );

    const allowList = new Set([
        APP_URL,
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
    ].filter(Boolean));

    const allowedOrigin = isDevOrigin || (origin && allowList.has(origin))
        ? origin
        : '*';

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': isDevOrigin || (origin && allowList.has(origin)) ? 'true' : 'false',
    };
}

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { incomingText, context = {} } = await req.json();

        if (!incomingText) {
            throw new Error('incomingText is required');
        }

        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        // Persona & Tone: Kofi Farkye, Senior Recruiter at Aya Healthcare
        // Energy: Professional, high-speed, direct, but warm and candidate-first.
        // Avoids: Robotic preambles ("As an AI...", "I hope this finds you well"), 
        // over-the-top corporate speak, or generic filler.

        const prompt = `You are Kofi Farkye, a Senior Recruiter at Aya Healthcare. 
You are known for being professional, high-energy, direct, and incredibly helpful without being robotic.
Your goal is to draft a reply to a candidate's message that feels authentic to your personality.

### CANDIDATE'S MESSAGE:
"${incomingText}"

### CONTEXT (If available):
${JSON.stringify(context, null, 2)}

### KOFI'S TONE GUIDELINES:
1. **Be Human**: Start with a direct reaction to what they said. Use "I" and "we" naturally.
2. **Be Action-Oriented**: Always move the conversation forward. If they are interested, tell them the next step.
3. **Keep it Crisp**: Avoid wordy corporate-speak. Use bullet points if listing details.
4. **Energy**: High-speed but precise. "Let's get this moving," "Excited to see this through," etc.
5. **Brand Style**: "Aya Standard" means premium and reliable.
6. **NO ROBOT SPEAK**: Never start with "Thank you for your message" or "I understand you are feeling..." instead say "Totally get where you're coming from" or "I hear you on that."

### OUTPUT REQUIREMENTS:
Return a JSON object with:
- "reply": The drafted response text.
- "analysis": A quick summary of the candidate's energy level (e.g., "High Interest," "Skeptical," "Passive").
- "suggested_action": Next step for you to take (e.g., "Schedule Call," "Send Pay Package").

Return EXACTLY this JSON structure:
{
  "reply": "string",
  "analysis": "string",
  "suggested_action": "string"
}`;

        // Using Gemini 3 Flash - latest model for speed and efficiency
        const model = 'gemini-3-flash-preview';
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.7 // Slight creativity for more "human" variety
                }
            }),
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`AI processing failed: ${aiResponse.status} - ${errorText}`);
        }

        const aiResult = await aiResponse.json();
        const extractedText = aiResult.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!extractedText) {
            throw new Error('AI returned no content');
        }

        const result = JSON.parse(extractedText);

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json", ...corsHeaders },
        });

    } catch (error: any) {
        console.error(`Error in generate-tailored-reply: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json", ...corsHeaders },
        });
    }
});
