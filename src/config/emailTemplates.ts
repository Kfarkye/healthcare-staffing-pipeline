// supabase/functions/generate-email-template/index.ts
// COMPLETE FIXED VERSION

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(buffer);
    let binaryString = '';
    const chunkSize = 8192;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        const chunkArray = [];
        for (let j = 0; j < chunk.length; j++) {
            chunkArray.push(chunk[j]);
        }
        binaryString += String.fromCharCode.apply(null, chunkArray);
    }
    
    return btoa(binaryString);
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let filePath: string | null = null;
    
    try {
        const body = await req.json();
        console.log("Function invoked.");
        
        // Handle list templates
        if (body.action === 'list_templates') {
            const { data, error } = await supabaseAdmin
                .from('email_template_definitions')
                .select('id, template_type, template_name')
                .eq('is_active', true);
            
            if (error) throw error;
            
            return new Response(
                JSON.stringify({ templates: data }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }
        
        // Handle generate
        filePath = body.filePath;
        if (!filePath) {
            throw new Error("filePath is required");
        }

        console.log(`Processing file: ${filePath}`);

        // 1. Download file
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from('screenshots')
            .download(filePath);
        
        if (downloadError || !fileData) {
            throw new Error(`Download failed: ${downloadError?.message}`);
        }
        
        console.log("File downloaded successfully from storage.");

        // 2. Convert to base64
        const arrayBuffer = await fileData.arrayBuffer();
        const base64Image = arrayBufferToBase64(arrayBuffer);

        // 3. Call Gemini API
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY not set');
        }

        console.log("Sending request to Gemini API...");

        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `Extract ALL assignment details from this healthcare staffing screenshot. 
                                Return a JSON object with these fields:
                                - specialty (job type/position)
                                - facility (hospital/facility name)
                                - city
                                - state
                                - start_date
                                - end_date
                                - weekly_hours
                                - shift_type
                                - taxable_rate (hourly rate)
                                - weekly_stipend (meals & housing)
                                - gross_weekly_pay (total weekly)
                                - bonus (if any)
                                
                                Return only valid JSON starting with { and ending with }`
                            },
                            {
                                inlineData: {
                                    mimeType: "image/png",
                                    data: base64Image
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 1024,
                        responseMimeType: "application/json"
                    }
                })
            }
        );

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini error:", errorText);
            throw new Error(`Gemini API failed: ${geminiResponse.status}`);
        }

        const geminiResult = await geminiResponse.json();
        const rawText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        // Parse the response
        const cleanJson = rawText.replace(/```json\n?|```\n?/g, '').trim();
        let extractedData;
        try {
            extractedData = JSON.parse(cleanJson);
        } catch (e) {
            console.error("Parse error:", e);
            extractedData = {};
        }

        console.log("Data extracted from Gemini:", JSON.stringify(extractedData, null, 2));

        // 4. Get template
        console.log(`Fetching base template of type: ${body.templateType || 'interested_click_base'}`);
        
        const { data: template, error: templateError } = await supabaseAdmin
            .from('email_template_definitions')
            .select('*')
            .eq('template_type', body.templateType || 'interested_click_base')
            .eq('is_active', true)
            .single();
        
        if (templateError) {
            console.error("Template fetch error:", templateError);
            throw new Error(`Failed to fetch template: ${templateError.message}`);
        }
        
        console.log("Base template fetched successfully.");

        // 5. Map extracted fields to template placeholders
        // THIS IS THE KEY MAPPING - matching what Gemini returns to what the template expects
        const templateData = {
            // Name fields
            first_name: body.prospect?.name?.split(' ')[0] || 
                       extractedData.first_name || 
                       extractedData.candidate_name?.split(' ')[0] ||
                       '[First Name]',
            
            // Job fields - Gemini returns 'specialty'
            specialty: extractedData.specialty || 
                      extractedData.position || 
                      extractedData.job_title || 
                      '[Specialty]',
            
            // Facility - Gemini returns 'facility', template expects 'facility_name'
            facility_name: extractedData.facility ||  // KEY: Map 'facility' to 'facility_name'
                          extractedData.facility_name || 
                          extractedData.hospital || 
                          '[Facility]',
            
            // Location
            city: extractedData.city || '[City]',
            state: extractedData.state || '[State]',
            
            // Dates
            start_date: extractedData.start_date || '[Start Date]',
            end_date: extractedData.end_date || '[End Date]',
            
            // Shift info
            shift_details: extractedData.shift_details || 
                          `${extractedData.shift_type || 'Standard'}, ${extractedData.weekly_hours || 40} hours/week`,
            
            // Pay - Gemini returns 'taxable_rate', template expects 'hourly_rate'
            hourly_rate: extractedData.taxable_rate ||  // KEY: Map 'taxable_rate' to 'hourly_rate'
                        extractedData.hourly_rate || 
                        extractedData.rate || 
                        '[Rate]',
            
            // Stipend - Gemini returns 'weekly_stipend', template expects 'meals_housing_total'
            meals_housing_total: extractedData.weekly_stipend ||  // KEY: Map 'weekly_stipend' to 'meals_housing_total'
                                extractedData.meals_housing_total || 
                                extractedData.stipend || 
                                '[Stipend]',
            
            // Gross - Gemini returns 'gross_weekly_pay', template expects 'gross_weekly'
            gross_weekly: extractedData.gross_weekly_pay ||  // KEY: Map 'gross_weekly_pay' to 'gross_weekly'
                         extractedData.gross_weekly || 
                         extractedData.weekly_pay || 
                         '[Gross]',
            
            // Recruiter info
            recruiter_email: body.recruiterInfo?.email || 'kofi.farkye@ayahealthcare.com'
        };

        // 6. Replace placeholders in template
        let subject = template.subject_template;
        let body_text = template.body_template;
        
        // Replace all placeholders
        Object.keys(templateData).forEach(key => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            const value = templateData[key];
            subject = subject.replace(regex, value);
            body_text = body_text.replace(regex, value);
        });

        // 7. Save to database with CORRECT column name
        const { data: savedTemplate, error: saveError } = await supabaseAdmin
            .from('generated_email_templates')
            .insert({
                template_definition_id: template.id,  // FIXED: Not 'base_template_id'
                subject: subject,
                body: body_text,
                extracted_data: extractedData,
                created_by: 'system',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (saveError) {
            console.error("Failed to save generated template:", saveError.message);
            // Don't fail completely - still return the generated template
            const result = {
                id: crypto.randomUUID(),
                template_name: `${templateData.facility_name} - ${templateData.specialty}`,
                subject: subject,
                body: body_text,
                extracted_data: extractedData,
                warning: 'Template generated but not saved to database'
            };
            
            // Clean up file
            console.log(`Attempting to clean up file: ${filePath}`);
            await supabaseAdmin.storage
                .from('screenshots')
                .remove([filePath])
                .then(() => console.log(`Successfully deleted file: ${filePath}`))
                .catch(console.error);
            
            return new Response(
                JSON.stringify(result),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        const result = {
            id: savedTemplate.id,
            template_name: `${templateData.facility_name} - ${templateData.specialty}`,
            subject: subject,
            body: body_text,
            extracted_data: extractedData
        };

        // Clean up file
        console.log(`Attempting to clean up file: ${filePath}`);
        await supabaseAdmin.storage
            .from('screenshots')
            .remove([filePath])
            .then(() => console.log(`Successfully deleted file: ${filePath}`))
            .catch(console.error);

        console.log("Function execution finished.");

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error("Error:", error);
        
        // Clean up on error
        if (filePath) {
            await supabaseAdmin.storage
                .from('screenshots')
                .remove([filePath])
                .catch(console.error);
        }
        
        return new Response(
            JSON.stringify({ 
                error: error.message || 'Internal error',
                details: error.toString()
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});