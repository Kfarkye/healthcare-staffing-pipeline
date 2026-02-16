import { createClient } from 'npm:@supabase/supabase-js@2';

// Helper function to convert ArrayBuffer to base64 using a robust chunking method
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  // Process in chunks to avoid "Maximum call stack size exceeded" errors
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    // This is a more performant way to convert a chunk of bytes to a binary string
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

// CORS helper with development origin detection
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const APP_URL = Deno.env.get('APP_URL') || '';

  // Check if origin is a development origin
  const isDevOrigin = origin && (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('webcontainer') ||
    origin.includes('stackblitz') ||
    origin.includes('local-credentialless') ||
    origin.includes('bolt.host') ||
    origin.includes('bolt.new')
  );

  // Allow list for production origins
  const allowList = new Set([
    APP_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ].filter(Boolean));

  // Determine allowed origin
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

  let filePath = null;
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const body = await req.json();
    // Accept both 'base64' and 'base64Data' for compatibility with different callers
    let base64 = body.base64 || body.base64Data;
    let mimeType = body.mimeType || 'image/png';
    filePath = body.filePath;

    console.log('[process-screenshot] Received keys:', Object.keys(body).join(', '));

    // Support both direct base64 and storage filePath
    if (base64) {
      console.log('Processing direct base64 image data');
    } else if (filePath) {
      console.log('Processing image from storage:', filePath);
      const { data: fileData, error: downloadError } = await supabaseClient.storage
        .from('screenshots')
        .download(filePath);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      base64 = arrayBufferToBase64(arrayBuffer);
      mimeType = fileData.type || 'image/png';
    } else {
      throw new Error('Either base64/base64Data or filePath is required in the request body');
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('GEMINI_API_KEY is not configured or is empty in Supabase secrets');
    }

    const prompt = `You are a high-precision data extraction agent for a medical staffing agency.
Your task is to extract candidate and job details from screenshots of the "Nova Healthcare" platform.

### SCANNING STRATEGY:
1. **Candidate Profile Section**:
   - Look for Name, Email, Phone, and the Candidate ID (found in Top Bar, Profile header, or URL).
   - **Home Address**: Extract the Candidate's Home State (e.g., "Chicago, IL" -> home_state: "IL").
   - **Qualifications**: Look for Certifications (CCRN, BLS, etc.), years of experience, and preferred unit types.
2. **Job Details Section**: Look for Facility Name, City/State (this is the JOB state), Specialty, Profession, and Job ID (usually 7 digits).
3. **Pay Package Section (Margin Calculator)**: This is usually a table with:
   - "Taxable Hourly" / "Base Pay Rate" -> taxableRate
   - "Weekly Meals" / "Weekly Meals Stipend" -> mealsStipend
   - "Weekly Lodging" / "Weekly Housing Stipend" -> housingStipend
   - "Gross Weekly" / "Total Gross Weekly Pay" -> grossWeeklyPay
   - "Weekly Hours" -> (e.g., 36, 40)
   - "Actual Margin" -> actual_margin (extract the highlighted percentage value near the top).
   - "OT Pay Rate" / "Taxable Overtime Hourly Rate" -> otPayRate
4. **Margin Calculator Summary & Contract Details**:
   - Account Manager (labeled "Acct Manager") -> accountManager
   - Weeks Length -> contractWeeks
   - Contract Commission -> contractCommission
   - Margin ID (found in the URL bar or footer, usually 7 digits) -> marginId

### EXTRACTION RULES:
- Use null if a value is not found.
- For dates, use YYYY-MM-DD.
- For rates/pay, extract numbers only.
- **home_state**: Extract the 2-letter state code for the CANDIDATE'S home address.
- **state**: Extract the 2-letter state code for the JOB location.
- **years_experience**: Extract as a number of years if possible (e.g., "8 yrs" -> 8).
- **actual_margin**: Extract as a number (e.g., "11.2%" -> 11.2).
- **contractCommission**: Extract as a number (e.g., "$439.08" -> 439.08).
- **marginId**: Extract the margin ID number from the URL or footer (e.g., "7911872").

Return EXACTLY this JSON structure:
{
  "candidate_id": number or null,
  "name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "home_state": "2-letter string or null",
  "certifications": "string or null",
  "years_experience": number or null,
  "preferred_units": "string or null",
  "shift_preference": "string or null",
  "facility": "string or null",
  "city": "string or null",
  "state": "2-letter string or null",
  "specialty": "string or null",
  "profession": "string or null",
  "shiftType": "string or null",
  "weeklyHours": number or null,
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "taxableRate": number or null,
  "mealsStipend": number or null,
  "housingStipend": number or null,
  "weeklyStipend": number or null,
  "grossWeeklyPay": number or null,
  "actual_margin": number or null,
  "jobId": "string or null",
  "accountManager": "string or null",
  "contractWeeks": number or null,
  "contractCommission": number or null,
  "otPayRate": number or null,
  "marginId": "string or null",
  "notes": "string or null"
}`;

    // Using Gemini 3 Flash - latest model with best speed/accuracy for image extraction
    const model = 'gemini-3-flash-preview';
    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType, data: base64 } }
          ]
        }],
        generationConfig: { responseMimeType: "application/json" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[process-screenshot] AI API error:', aiResponse.status, errorText);
      throw new Error(`AI processing failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiResult = await aiResponse.json();

    // Debug logging to understand response structure
    console.log('[process-screenshot] Full AI response:', JSON.stringify(aiResult, null, 2));
    console.log('[process-screenshot] Candidates:', aiResult.candidates?.length || 0);

    // Check for various response formats
    const candidate = aiResult.candidates?.[0];
    if (!candidate) {
      console.error('[process-screenshot] No candidates in response');
      throw new Error('AI returned no candidates. The image may be unreadable.');
    }

    console.log('[process-screenshot] Candidate content:', JSON.stringify(candidate.content, null, 2));

    // Try to extract text from the response
    let extractedText = candidate.content?.parts?.[0]?.text;

    // Some models return in different structures
    if (!extractedText && candidate.text) {
      extractedText = candidate.text;
    }
    if (!extractedText && typeof candidate.content === 'string') {
      extractedText = candidate.content;
    }

    if (!extractedText) {
      console.error('[process-screenshot] No text in response. Parts:', JSON.stringify(candidate.content?.parts, null, 2));
      throw new Error('No data was extracted from the image. It might be unclear or the AI format changed.');
    }

    console.log('[process-screenshot] Extracted text (first 500 chars):', extractedText.substring(0, 500));

    const extractedData = JSON.parse(extractedText);
    console.log('[process-screenshot] Parsed data:', extractedData);

    return new Response(JSON.stringify(extractedData), {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error(`Error in process-screenshot: ${error.message}`, { stack: error.stack });

    // Clean up uploaded file on error
    if (filePath) {
      try {
        await supabaseClient.storage.from('screenshots').remove([filePath]);
      } catch (cleanupError) {
        console.error('Failed to cleanup file:', cleanupError);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
});