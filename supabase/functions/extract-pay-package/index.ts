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

    const googleApiKey = Deno.env.get('GEMINI_API_KEY')!;

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
                        - Start Date
                        - Duration

                        Return the data as a clean JSON object with these keys: 
                        job_id, facility_name, job_city, job_state, specialty, profession, pay_range, start_date, duration.`
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
                    text: "You are a specialized OCR and data extraction agent for healthcare staffing. You convert screenshots of assignment manifests into accurate structured data."
                }]
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (result.error) {
            console.error('Gemini Error:', result.error);
            throw new Error(result.error.message || 'Gemini API failed');
        }

        // Parse the JSON response from Gemini
        const textResponse = result.candidates[0].content.parts[0].text;
        const extractedData = JSON.parse(textResponse);

        return new Response(JSON.stringify(extractedData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Extraction Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
