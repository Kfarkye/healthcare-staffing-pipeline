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
    const googleApiKey = Deno.env.get('GEMINI_API_KEY');

    // Production Guard: API Key Validation
    if (!googleApiKey) {
        console.error('[extract-pay-package] GEMINI_API_KEY not configured');
        return new Response(JSON.stringify({ error: 'AI service not configured' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const startTime = Date.now();

    try {
        const { imageBase64, mimeType } = await req.json();

        if (!imageBase64) throw new Error('Image data is required');

        const body = {
            contents: [{
                parts: [
                    {
                        text: `Extract structured pay package data from this manifest screenshot. 
                        Look for:
                        - Job ID (numerical or alphanumeric)
                        - Facility Name
                        - Location (City, State)
                        - Profession / Specialty
                        - Pay Range (Gross Weekly)
                        - Shift Type (e.g., 3x12, 5x8)
                        - Start Date
                        - Duration

                        Return the data as a clean JSON object with these keys: 
                        job_id, facility_name, job_city, job_state, specialty, profession, pay_range, shift_type, start_date, duration.
                        If a field cannot be determined, set it to null.`
                    },
                    {
                        inline_data: {
                            mime_type: mimeType || 'image/png',
                            data: imageBase64
                        }
                    }
                ]
            }],
            generationConfig: {
                response_mime_type: "application/json",
            },
            system_instruction: {
                parts: [{
                    text: "You are a specialized OCR and data extraction agent for healthcare staffing. You convert screenshots of assignment manifests into accurate structured data. Always return valid JSON."
                }]
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...body,
                generationConfig: {
                    ...body.generationConfig,
                    thinkingConfig: {
                        includeThoughts: false,
                        thinkingLevel: "low"
                    }
                }
            })
        });

        const result = await response.json();

        // Production Guard: API Error Handling
        if (result.error) {
            console.error('[extract-pay-package] Gemini API Error:', result.error);
            await supabase.from('ai_audit_logs').insert({
                function_name: 'extract-pay-package',
                input_metadata: { mimeType },
                error_message: result.error.message,
                latency_ms: Date.now() - startTime
            });
            throw new Error(result.error.message || 'Gemini API failed');
        }

        // Production Guard: Null-Safety on Response Structure
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        const finishReason = result.candidates?.[0]?.finishReason || 'UNKNOWN';

        if (!textResponse) {
            // Handle safety blocks or empty responses
            console.error('[extract-pay-package] Empty or blocked response:', finishReason);
            await supabase.from('ai_audit_logs').insert({
                function_name: 'extract-pay-package',
                input_metadata: { mimeType },
                finish_reason: finishReason,
                error_message: `AI could not process this image. Reason: ${finishReason}`,
                latency_ms: Date.now() - startTime
            });
            throw new Error(`AI could not process this image. Reason: ${finishReason || 'No content returned'}`);
        }

        // Production Guard: JSON Parsing with Fallback
        let extractedData;
        try {
            extractedData = JSON.parse(textResponse);
        } catch (parseError) {
            console.error('[extract-pay-package] JSON Parse Error:', textResponse);
            await supabase.from('ai_audit_logs').insert({
                function_name: 'extract-pay-package',
                input_metadata: { mimeType },
                output_text: textResponse,
                finish_reason: finishReason,
                error_message: 'AI returned invalid JSON',
                latency_ms: Date.now() - startTime
            });
            throw new Error('AI returned invalid JSON. Please try a clearer image.');
        }

        // Success: Log with extracted data
        await supabase.from('ai_audit_logs').insert({
            function_name: 'extract-pay-package',
            input_metadata: { mimeType },
            output_text: JSON.stringify(extractedData),
            output_metadata: { extracted_job_id: extractedData.job_id },
            finish_reason: finishReason,
            latency_ms: Date.now() - startTime
        });

        return new Response(JSON.stringify(extractedData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[extract-pay-package] Extraction Error:', error);
        // Best-effort error logging
        try {
            await supabase.from('ai_audit_logs').insert({
                function_name: 'extract-pay-package',
                error_message: error.message,
                error_details: { stack: error.stack },
                latency_ms: Date.now() - startTime
            });
        } catch { } // Silent fail
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
