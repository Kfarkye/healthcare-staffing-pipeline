import { createClient } from 'npm:@supabase/supabase-js@2';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ParsedAssignment {
    candidate_name: string | null;
    facility_name: string | null;
    start_date: string | null;  // Format: YYYY-MM-DD
    end_date: string | null;    // Format: YYYY-MM-DD
    extension_stage: string | null;
}

interface RequestBody {
    text: string;
    saveToDatabase?: boolean;  // Optional: whether to save results to database
}

interface SuccessResponse {
    success: true;
    data: ParsedAssignment[];
    metadata: {
        totalRecordsFound: number;
        processingTimeMs: number;
        savedToDatabase?: boolean;
    };
}

interface ErrorResponse {
    success: false;
    error: string;
    details?: string;
}

type ApiResponse = SuccessResponse | ErrorResponse;

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    CORS_HEADERS: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    // Using stable model version
    GEMINI_MODEL: 'gemini-3-flash-preview',
    GEMINI_API_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
    GENERATION_CONFIG: {
        response_mime_type: "application/json",
        temperature: 0.1,  // Low for consistent extraction
        maxOutputTokens: 2048  // Enough for large batch extractions
    }
};

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const EXTRACTION_PROMPT = `You are an expert data extractor for a healthcare staffing agency. Your task is to analyze unstructured text from the Nova platform and identify EVERY distinct candidate assignment record.

**Critical Instructions:**

1. **Record Identification:**
   - Each line or multi-line block may represent one assignment
   - Look for patterns like: "Name - Facility - Dates - Status"
   - Records may use various delimiters (-, @, |, etc.)

2. **Required Fields to Extract:**
   - **candidate_name**: Full name (Last, First OR First Last format)
   - **facility_name**: Healthcare facility name
   - **start_date**: Contract start date (convert to YYYY-MM-DD)
   - **end_date**: Contract end date (convert to YYYY-MM-DD)
   - **extension_stage**: Current pipeline stage

3. **Stage Mapping:**
   - "Working" → "working"
   - "Outreach" → "outreach"
   - "Interested" → "interested"
   - "Offer" or "Offer Extended" → "offer"
   - "Signed" or "Extension Signed" → "signed"
   - Default to lowercase if unclear

4. **Date Handling:**
   - Accept formats: MM/DD/YYYY, MM/DD/YY, M/D/YY, etc.
   - Assume 20XX for two-digit years
   - Output as YYYY-MM-DD

5. **Output Requirements:**
   - Return ONLY a valid JSON array
   - Use null for missing fields
   - No markdown, no comments, no extra text

**Example Input:**
Smith, John - Mercy Hospital - 10/15/25 to 1/15/26 - Working
Jane Doe @ St. Mary's Medical | Start: 11/1/2025, End: 2/1/2026 | Status: Interested

**Expected Output:**
[
  {"candidate_name": "John Smith", "facility_name": "Mercy Hospital", "start_date": "2025-10-15", "end_date": "2026-01-15", "extension_stage": "working"},
  {"candidate_name": "Jane Doe", "facility_name": "St. Mary's Medical", "start_date": "2025-11-01", "end_date": "2026-02-01", "extension_stage": "interested"}
]`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a standardized JSON response with CORS headers
 */
const createResponse = (body: ApiResponse, status: number): Response => {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CONFIG.CORS_HEADERS
        }
    });
};

/**
 * Validates and cleans parsed assignment data
 */
const validateAssignments = (assignments: any[]): ParsedAssignment[] => {
    if (!Array.isArray(assignments)) {
        throw new Error('AI response is not an array');
    }

    return assignments.map((item, index) => {
        // Ensure it's an object
        if (typeof item !== 'object' || item === null) {
            console.warn(`[Validation] Skipping invalid item at index ${index}`);
            return null;
        }

        // Clean and validate each field
        const cleaned: ParsedAssignment = {
            candidate_name: item.candidate_name?.trim() || null,
            facility_name: item.facility_name?.trim() || null,
            start_date: validateDate(item.start_date),
            end_date: validateDate(item.end_date),
            extension_stage: item.extension_stage?.toLowerCase().trim() || null
        };

        // Only return if we have at least a name
        if (cleaned.candidate_name) {
            return cleaned;
        }

        console.warn(`[Validation] Skipping record without candidate name at index ${index}`);
        return null;
    }).filter(Boolean) as ParsedAssignment[];
};

/**
 * Validates and formats date strings
 */
const validateDate = (dateStr: any): string | null => {
    if (!dateStr) return null;

    try {
        // Handle string dates
        if (typeof dateStr === 'string') {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
        }
    } catch (e) {
        console.warn(`[Validation] Invalid date format: ${dateStr}`);
    }

    return null;
};

// ============================================================================
// AI PROCESSING
// ============================================================================

/**
 * Calls Gemini API to extract structured data from unstructured text
 */
const extractWithGemini = async (textToParse: string): Promise<ParsedAssignment[]> => {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Build the API URL with the correct model name
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    console.log(`[AI] Using model: ${CONFIG.GEMINI_MODEL}`);
    console.log(`[AI] Processing ${textToParse.length} characters of text`);

    const payload = {
        contents: [{
            parts: [
                { text: EXTRACTION_PROMPT },
                { text: `\n\n--- TEXT TO PARSE ---\n${textToParse}\n--- END OF TEXT ---` }
            ]
        }],
        generationConfig: CONFIG.GENERATION_CONFIG
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[AI] API Error: ${response.status} - ${errorBody}`);

        // Check for specific model not found error
        if (response.status === 404 && errorBody.includes('model')) {
            throw new Error(`Gemini model '${CONFIG.GEMINI_MODEL}' not found. Please check model name.`);
        }

        throw new Error(`Gemini API failed: ${response.status} - ${response.statusText}`);
    }

    const result = await response.json();
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
        throw new Error('AI returned empty response');
    }

    console.log('[AI] Response received, parsing JSON...');

    try {
        const parsedData = JSON.parse(jsonText);
        const validated = validateAssignments(parsedData);
        console.log(`[AI] Successfully extracted ${validated.length} valid assignments`);
        return validated;
    } catch (parseError) {
        console.error('[AI] Failed to parse JSON response:', jsonText.substring(0, 200));
        throw new Error(`Invalid JSON from AI: ${parseError.message}`);
    }
};

// ============================================================================
// DATABASE OPERATIONS (OPTIONAL)
// ============================================================================

/**
 * Saves extracted assignments to database
 */
const saveToDatabase = async (
    assignments: ParsedAssignment[]
): Promise<boolean> => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            console.warn('[DB] Supabase credentials not configured, skipping save');
            return false;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Save to a parsed_assignments table (you'll need to create this)
        const { error } = await supabase
            .from('parsed_nova_assignments')
            .insert(assignments.map(a => ({
                ...a,
                parsed_at: new Date().toISOString()
            })));

        if (error) {
            console.error('[DB] Save failed:', error.message);
            return false;
        }

        console.log(`[DB] Saved ${assignments.length} assignments to database`);
        return true;
    } catch (error) {
        console.error('[DB] Unexpected error:', error);
        return false;
    }
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
    const startTime = Date.now();

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CONFIG.CORS_HEADERS });
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
        return createResponse({
            success: false,
            error: 'Method not allowed. Use POST.'
        }, 405);
    }

    try {
        console.log('========================================');
        console.log('[Function] Parse-Nova-Text invoked');
        console.log(`[Function] Timestamp: ${new Date().toISOString()}`);

        // Parse request body
        const body: RequestBody = await req.json();

        // Validate required fields
        if (!body.text) {
            return createResponse({
                success: false,
                error: 'Missing required field: text'
            }, 400);
        }

        if (typeof body.text !== 'string') {
            return createResponse({
                success: false,
                error: 'Field "text" must be a string'
            }, 400);
        }

        console.log(`[Function] Input text length: ${body.text.length} characters`);

        // Extract assignments using AI
        const assignments = await extractWithGemini(body.text);

        // Optionally save to database
        let savedToDb = false;
        if (body.saveToDatabase) {
            savedToDb = await saveToDatabase(assignments);
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        console.log(`[Function] Completed in ${processingTime}ms`);
        console.log(`[Function] Found ${assignments.length} valid assignments`);

        // Return success response
        return createResponse({
            success: true,
            data: assignments,
            metadata: {
                totalRecordsFound: assignments.length,
                processingTimeMs: processingTime,
                savedToDatabase: savedToDb
            }
        }, 200);

    } catch (error: any) {
        console.error('========================================');
        console.error('[Function] ERROR:', error.message);
        console.error('[Function] Stack:', error.stack);

        // Determine appropriate status code
        let statusCode = 500;
        if (error.message.includes('not configured')) {
            statusCode = 503; // Service unavailable
        } else if (error.message.includes('Invalid JSON')) {
            statusCode = 422; // Unprocessable entity
        }

        // Return error response
        return createResponse({
            success: false,
            error: error.message,
            details: error.stack
        }, statusCode);

    } finally {
        console.log('[Function] Execution completed');
        console.log('========================================');
    }
});