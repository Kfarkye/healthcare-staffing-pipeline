// ============================================================================
// NOVA REFERENCES PROCESSOR
// Specialized Supabase Edge Function for Reference & Work History extraction
// Version: 1.0.0 - Processes Nova References tab screenshots
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  ai: {
    model: 'gemini-3-flash-preview',
    temperature: 0.1,
    maxTokens: 4096
  }
};

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

function buildReferenceExtractionPrompt() {
  return `You are an expert at extracting reference data from Nova Healthcare system screenshots.

ANALYZE these screenshots which may contain:
1. References Tab - showing professional references
2. Work History Tab - showing employment history
3. Combined views with both sections

EXTRACT the following:

REFERENCES (from References section):
- Look for table/list with columns like "Name", "Title", "Status", "Date", "Relationship"
- Status indicators: ✓ or checkmark = "Verified", clock icon = "Pending", empty = "Unknown"
- Extract ALL references shown, not just verified ones

WORK HISTORY (from Work History section):
- Facility/Hospital names
- Position/Role titles
- Employment dates (start and end)
- Current positions show "Present" as end date

IMPORTANT:
- Extract EXACTLY what you see - don't infer or guess
- Include ALL entries, even if incomplete
- Dates should be in YYYY-MM format when possible
- If a section is not visible in the screenshot, return empty array for that section

Return ONLY this JSON structure:
{
  "referees": [
    {
      "name": "Full Name",
      "title": "Job Title/Position",
      "status": "Verified" | "Pending" | "Unknown",
      "date": "YYYY-MM" or null,
      "relationship": "Manager" | "Colleague" | "Supervisor" or null
    }
  ],
  "workHistory": [
    {
      "facility": "Hospital/Facility Name",
      "role": "Position Title",
      "start": "YYYY-MM",
      "end": "YYYY-MM" or "Present",
      "location": "City, State" or null
    }
  ],
  "verifiedCount": number (count of verified references),
  "pendingCount": number (count of pending references),
  "totalReferences": number (total references found),
  "extractedSections": ["References", "Work History"] (which sections were found)
}`;
}

// ============================================================================
// PROCESSING UTILITIES
// ============================================================================

function processReferenceData(rawData: any) {
  // Ensure all required fields exist
  const processed = {
    referees: Array.isArray(rawData.referees) ? rawData.referees.map((ref: any) => ({
      name: ref.name || '',
      title: ref.title || '',
      status: ref.status || 'Unknown',
      date: ref.date || null,
      relationship: ref.relationship || null
    })) : [],

    workHistory: Array.isArray(rawData.workHistory) ? rawData.workHistory.map((work: any) => ({
      facility: work.facility || '',
      role: work.role || '',
      start: work.start || '',
      end: work.end || '',
      location: work.location || null
    })) : [],

    verifiedCount: 0,
    pendingCount: 0,
    totalReferences: 0,
    extractedSections: rawData.extractedSections || []
  };

  // Calculate counts
  processed.verifiedCount = processed.referees.filter(r => r.status === 'Verified').length;
  processed.pendingCount = processed.referees.filter(r => r.status === 'Pending').length;
  processed.totalReferences = processed.referees.length;

  return processed;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Parse request body
    const { images, candidateId } = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      throw new Error('Invalid request: images array required');
    }

    console.log(`[PROCESS START] Processing ${images.length} reference screenshots${candidateId ? ` for candidate ${candidateId}` : ''}`);

    // Get API key
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Call Gemini API
    console.log(`[AI EXTRACTION] Sending to ${CONFIG.ai.model}`);

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.ai.model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: buildReferenceExtractionPrompt() },
          ...images.map((base64: string) => ({
            inlineData: {
              mimeType: 'image/png',
              data: base64
            }
          }))
        ]
      }],
      generationConfig: {
        temperature: CONFIG.ai.temperature,
        maxOutputTokens: CONFIG.ai.maxTokens,
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No content returned from AI');
    }

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not extract valid JSON from AI response');
    }

    const rawData = JSON.parse(jsonMatch[0]);
    const processedData = processReferenceData(rawData);

    // Add candidate ID if provided
    if (candidateId) {
      processedData['candidateId'] = candidateId;
    }

    console.log(`[EXTRACTION COMPLETE] Found ${processedData.totalReferences} references (${processedData.verifiedCount} verified, ${processedData.pendingCount} pending)`);
    console.log(`[WORK HISTORY] Found ${processedData.workHistory.length} employment records`);

    const processingTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        data: processedData,
        metadata: {
          processingTime: `${processingTime}ms`,
          imagesProcessed: images.length,
          sectionsFound: processedData.extractedSections
        }
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error(`[ERROR] ${error.message}`, {
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    const processingTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        data: {
          referees: [],
          workHistory: [],
          verifiedCount: 0,
          pendingCount: 0,
          totalReferences: 0,
          extractedSections: []
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString()
        }
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});