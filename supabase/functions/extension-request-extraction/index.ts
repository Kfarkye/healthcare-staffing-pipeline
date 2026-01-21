import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY not configured');
    }

    const { base64Data, mimeType, traceId } = await req.json();

    if (!base64Data || !mimeType) {
      return new Response(
        JSON.stringify({ error: 'Missing base64Data or mimeType' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[${traceId || 'no-trace'}] Processing extension request extraction`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 1,
      },
    });

    const prompt = `You are an expert data extractor for healthcare staffing extension requests. Extract the following information from this Nova extension request screenshot and return ONLY valid JSON with no additional text:

{
  "candidateName": "full name of the candidate",
  "facility": "full facility name",
  "specialty": "specialty or unit (e.g., Dietitian, ICU, ER)",
  "currentShift": "shift type and hours (e.g., Standard (5x8) 8:30-17:00)",
  "currentBillRate": "bill rate with currency (e.g., $75)",
  "contractEndDate": "contract end date in MM/DD/YYYY format",
  "proposedStartDate": "proposed start date in MM/DD/YYYY format",
  "proposedEndDate": "proposed end date in MM/DD/YYYY format",
  "proposedDates": "full proposed date range as text",
  "timeOffDates": ["array", "of", "dates", "MM/DD/YYYY"],
  "localStatus": "Y or N for local status",
  "accountManager": "account manager full name (first and last)",
  "accountCoordinator": "account coordinator full name (first and last)"
}

CRITICAL INSTRUCTIONS:
- Return ONLY the JSON object, no markdown, no explanation, no code blocks
- accountManager and accountCoordinator MUST be full names (e.g., "Morgan Webber", "John Smith")
- DO NOT include job titles, just the person's name
- If you cannot find a field, use empty string "" or empty array []
- Parse all dates carefully in MM/DD/YYYY format
- Include $ symbol in currentBillRate
- timeOffDates should be an array, even if empty
- Extract exact full names for accountManager and accountCoordinator`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    let jsonText = text.trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const data = JSON.parse(jsonText);

    // Validate we got at least the core fields
    if (!data.candidateName && !data.facility) {
      throw new Error('Failed to extract core data from screenshot');
    }

    console.log(`[${traceId || 'no-trace'}] Successfully extracted:`, {
      candidate: data.candidateName,
      facility: data.facility,
      accountManager: data.accountManager || 'NOT FOUND',
      accountCoordinator: data.accountCoordinator || 'NOT FOUND'
    });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Extension extraction error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to extract extension request data',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
