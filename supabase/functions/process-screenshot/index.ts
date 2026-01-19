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

    const prompt = `You are an expert data extractor for a healthcare staffing company. Analyze the provided screenshot which may be:
1. A Nova Healthcare candidate profile page
2. A margin calculator with pay package details
3. A combination of both

IMPORTANT: Extract ALL available fields and return them as a clean JSON object. If a field is not visible, use null.

Look for these fields:

**Candidate Info:**
- candidate_id: The 6-8 digit number in the URL (e.g., nova.ayahealthcare.com/#/recruiting/candidates/4328863/...)
- name: Full name of the candidate
- email: Email address
- phone: Phone number

**Facility & Assignment Info:**
- facility: Hospital/facility name
- city: City location
- state: 2-letter state code
- specialty: Clinical specialty (ICU, ER, Med-Surg, etc.)
- profession: Job title (RN, LPN, CNA, etc.)
- shiftType: Shift type (Days, Nights, Rotating)
- weeklyHours: Hours per week (usually 36, 40, or 48)
- startDate: Assignment start date (YYYY-MM-DD format)
- endDate: Assignment end date (YYYY-MM-DD format)

**Pay Package Info:**
- taxableRate: Taxable hourly rate (number only, no $)
- mealsStipend: Weekly meals stipend (number only)
- housingStipend: Weekly housing stipend (number only)
- weeklyStipend: Total weekly stipend (meals + housing)
- grossWeeklyPay: Total gross weekly pay (number only)
- jobId: Job ID or Margin ID (usually 7 digits)

Return this exact JSON structure:
{
  "candidate_id": number or null,
  "name": "string or null",
  "email": "string or null",
  "phone": "string or null",
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
  "jobId": "string or null"
}`;

    // Using Gemini 3 Flash - latest model with best speed/accuracy for image extraction
    const model = 'gemini-3-flash-pre';
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
      throw new Error(`AI processing failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiResult = await aiResponse.json();
    const extractedText = aiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      throw new Error('No data was extracted from the image. It might be unclear.');
    }

    const extractedData = JSON.parse(extractedText);

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