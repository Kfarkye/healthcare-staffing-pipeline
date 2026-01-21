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

    const genAI = new GoogleGenerativeAI(apiKey);
    const { file } = await req.json();

    if (!file?.data || !file?.mimeType) {
      return new Response(
        JSON.stringify({ error: 'Missing file data or mimeType' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 1,
      },
    });

    const prompt = `Extract the following information from this receipt/invoice image and return ONLY valid JSON with no additional text:

{
  "certType": "type of certification or license (e.g., RN, RT, CNA, BLS, ACLS)",
  "amount": 0.00,
  "transactionDate": "YYYY-MM-DD",
  "vendor": "vendor or business name",
  "notes": "any additional relevant details"
}

Rules:
- Return ONLY the JSON object, no markdown, no explanation
- If you cannot find a field, use empty string "" or 0 for amount
- Parse the amount as a number (no dollar signs)
- Format date as YYYY-MM-DD`;

    const imagePart = {
      inlineData: {
        data: file.data,
        mimeType: file.mimeType,
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

    if (!data.certType && !data.amount && !data.transactionDate) {
      throw new Error('Failed to extract meaningful data from image');
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Receipt extraction error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to extract data from image',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
