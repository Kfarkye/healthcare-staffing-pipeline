import { createClient } from 'npm:@supabase/supabase-js@2';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Prospect {
    id: number;
    name: string;
    email?: string;
}

interface RecruiterInfo {
    email: string;
}

interface GenerationRequestBody {
    action: 'generate';
    filePath: string;
    templateType: string;
    prospect?: Prospect;
    recruiterInfo?: RecruiterInfo;
}

interface ExtractedData {
    specialty?: string;
    facility?: string;
    city?: string;
    state?: string;
    start_date?: string;
    end_date?: string;
    weekly_hours?: number;
    shift_type?: string;
    taxable_rate?: number;
    weekly_stipend?: number;
    gross_weekly_pay?: number;
    bonus?: number;
    [key: string]: any;
}

interface BaseTemplate {
    subject_template: string;
    body_template: string;
}

interface FinalTemplate {
    template_name: string;
    subject: string;
    body: string;
    extracted_data: ExtractedData;
    base_template_id: number | null;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    CORS_HEADERS: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    STORAGE_BUCKET: 'screenshots',
    // Using stable model version
    GEMINI_MODEL: 'gemini-1.5-flash-001',
    GEMINI_API_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a standardized JSON response with CORS headers
 */
const createJsonResponse = (body: object, status: number): Response => {
    return new Response(JSON.stringify(body), {
        headers: { 
            "Content-Type": "application/json", 
            ...CONFIG.CORS_HEADERS 
        },
        status,
    });
};

/**
 * Converts an ArrayBuffer to base64 string
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    
    // Use iterative approach to avoid call stack issues
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    
    return btoa(binary);
};

/**
 * Fills a template string with data values
 * Replaces [placeholder] with corresponding data values
 */
const fillTemplate = (template: string, data: Record<string, any>): string => {
    return template.replace(/\[([\w\s]+)\]/g, (match, placeholder) => {
        const key = placeholder.toLowerCase().replace(/\s+/g, '_');
        return data[key] || match; // Keep placeholder if no data found
    });
};

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Fetches base email template from database
 */
const getBaseTemplate = async (
    supabaseAdmin: any, 
    templateType: string
): Promise<BaseTemplate> => {
    console.log(`[DB] Fetching template type: ${templateType}`);
    
    const { data, error } = await supabaseAdmin
        .from('email_template_definitions')
        .select('subject_template, body_template')
        .eq('template_type', templateType)
        .eq('is_active', true)
        .single();
    
    if (error) {
        throw new Error(`Template fetch failed for '${templateType}': ${error.message}`);
    }
    
    console.log("[DB] Template fetched successfully");
    return data;
};

/**
 * Saves generated email template to database
 */
const saveGeneratedTemplate = async (
    supabaseAdmin: any,
    template: FinalTemplate
): Promise<void> => {
    const { error } = await supabaseAdmin
        .from('generated_email_templates')
        .insert(template);
    
    if (error) {
        console.error("[DB] Failed to save template:", error.message);
        // Don't throw - this is non-critical
    } else {
        console.log("[DB] Template saved successfully");
    }
};

// ============================================================================
// AI PROCESSING
// ============================================================================

/**
 * Calls Gemini API to extract data from image
 * FIXED: Updated to use correct model endpoint
 */
const extractDataWithGemini = async (
    imageBase64: string, 
    mimeType: string
): Promise<ExtractedData> => {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('GEMINI_API_KEY is not configured or is empty in Supabase secrets');
    }

    // Extraction prompt for margin calculator screenshots
    const prompt = `Analyze this healthcare staffing margin calculator screenshot and extract ALL visible data.
    Return a clean JSON object with these fields (use snake_case):
    - specialty (job specialty)
    - facility (facility name)
    - city (job city)
    - state (job state, 2-letter code)
    - start_date (YYYY-MM-DD format)
    - end_date (YYYY-MM-DD format)
    - weekly_hours (number)
    - shift_type (e.g., "3x12")
    - taxable_rate (hourly rate as number)
    - weekly_stipend (total stipend as number)
    - gross_weekly_pay (total weekly as number)
    - bonus (completion bonus if visible)
    
    Only include fields you can clearly see. Return ONLY the JSON object.`;

    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: imageBase64
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
        }
    };

    // FIXED: Using correct model endpoint without -latest
    const apiUrl = `${CONFIG.GEMINI_API_ENDPOINT}/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;
    
    console.log(`[AI] Calling Gemini API with model: ${CONFIG.GEMINI_MODEL}`);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AI] Gemini API error: ${response.status} - ${errorText}`);
        throw new Error(`Gemini API failed: ${response.status} - ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response structure from Gemini API');
    }

    const textResponse = result.candidates[0].content.parts[0].text;
    console.log("[AI] Raw response received");
    
    // Clean up JSON response (remove markdown code blocks if present)
    const cleanedJson = textResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
    
    try {
        const extractedData = JSON.parse(cleanedJson);
        console.log("[AI] Data extracted successfully");
        return extractedData;
    } catch (parseError) {
        console.error("[AI] Failed to parse JSON:", cleanedJson);
        throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }
};

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Downloads file from Supabase storage
 */
const downloadFile = async (
    supabaseAdmin: any, 
    filePath: string
): Promise<{ buffer: ArrayBuffer; mimeType: string }> => {
    console.log(`[Storage] Downloading: ${filePath}`);
    
    const { data, error } = await supabaseAdmin.storage
        .from(CONFIG.STORAGE_BUCKET)
        .download(filePath);
    
    if (error) {
        throw new Error(`Storage download failed: ${error.message}`);
    }
    
    console.log("[Storage] Download successful");
    
    const buffer = await data.arrayBuffer();
    const mimeType = data.type || "image/png";
    
    return { buffer, mimeType };
};

/**
 * Deletes file from Supabase storage
 */
const deleteFile = async (
    supabaseAdmin: any, 
    filePath: string
): Promise<void> => {
    console.log(`[Storage] Deleting: ${filePath}`);
    
    const { error } = await supabaseAdmin.storage
        .from(CONFIG.STORAGE_BUCKET)
        .remove([filePath]);
    
    if (error) {
        console.error(`[Storage] Delete failed: ${error.message}`);
    } else {
        console.log("[Storage] Delete successful");
    }
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CONFIG.CORS_HEADERS });
    }

    let filePath: string | null = null;
    const startTime = Date.now();

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
        console.log("========================================");
        console.log("[Function] Process-Outreach invoked");
        console.log(`[Function] Timestamp: ${new Date().toISOString()}`);
        
        // Parse request body
        const body: GenerationRequestBody = await req.json();
        filePath = body.filePath;

        // Validate required fields
        if (!filePath) {
            return createJsonResponse({ 
                error: "Missing required field: filePath" 
            }, 400);
        }

        if (!body.templateType) {
            return createJsonResponse({ 
                error: "Missing required field: templateType" 
            }, 400);
        }

        console.log(`[Function] Processing file: ${filePath}`);
        console.log(`[Function] Template type: ${body.templateType}`);

        // Step 1: Download the screenshot from storage
        const { buffer, mimeType } = await downloadFile(supabaseAdmin, filePath);

        // Step 2: Convert to base64 for AI processing
        const imageBase64 = arrayBufferToBase64(buffer);
        
        // Step 3: Extract data using Gemini AI
        const extractedData = await extractDataWithGemini(imageBase64, mimeType);

        // Step 4: Fetch the email template from database
        const baseTemplate = await getBaseTemplate(supabaseAdmin, body.templateType);
        
        // Step 5: Merge all data sources
        const mergedData = {
            ...extractedData,
            name: body.prospect?.name || '[First Name]',
            prospect_email: body.prospect?.email || '[Candidate Email]',
            recruiter_email: body.recruiterInfo?.email || '[Recruiter Email]',
            // Add formatted versions of dates if present
            start_date_formatted: extractedData.start_date 
                ? new Date(extractedData.start_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                })
                : '[Start Date]',
        };
        
        // Step 6: Fill the template with merged data
        const filledSubject = fillTemplate(baseTemplate.subject_template, mergedData);
        const filledBody = fillTemplate(baseTemplate.body_template, mergedData);
        
        // Step 7: Prepare final template
        const finalTemplate: FinalTemplate = {
            template_name: `${extractedData.specialty || 'Assignment'} at ${extractedData.facility || 'Facility'}`,
            subject: filledSubject,
            body: filledBody,
            extracted_data: extractedData,
            base_template_id: null
        };
        
        // Step 8: Save to database (non-blocking)
        await saveGeneratedTemplate(supabaseAdmin, finalTemplate);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        console.log(`[Function] Processing completed in ${processingTime}ms`);
        
        // Return success response
        return createJsonResponse({
            success: true,
            data: finalTemplate,
            metadata: {
                processingTime: `${processingTime}ms`,
                extractedFields: Object.keys(extractedData).length
            }
        }, 200);

    } catch (error: any) {
        console.error("========================================");
        console.error("[Function] ERROR:", error.message);
        console.error("[Function] Stack:", error.stack);
        
        // Return error response
        return createJsonResponse({ 
            success: false,
            error: error.message,
            details: error.stack 
        }, 500);
        
    } finally {
        // Always cleanup the uploaded file
        if (filePath) {
            await deleteFile(supabaseAdmin, filePath);
        }
        
        console.log("[Function] Execution completed");
        console.log("========================================");
    }
});