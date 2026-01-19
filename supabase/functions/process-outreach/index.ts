// supabase/functions/process-outreach/index.ts
// FIXED: jobIds is now OPTIONAL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY')!
const MODEL = 'gemini-2.5-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { jobIds = [], selectedTemplate = 'professional', extractedText = '' } = body
    
    // jobIds is now optional - default to empty array
    console.log('Processing with:', { jobIds, selectedTemplate, extractedText })
    
    // Generate email with Gemini
    const prompt = `Generate a professional recruitment email for healthcare positions.
    ${extractedText ? `Context: ${extractedText}` : ''}
    Template Style: ${selectedTemplate}
    
    Return a JSON object with:
    - subject: Email subject line
    - body: Email body (use \\n for line breaks)
    - preview: Short preview text
    `

    const response = await fetch(`${ENDPOINT}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const result = await response.json()
    const generatedContent = result.candidates?.[0]?.content?.parts?.[0]?.text
    const emailData = JSON.parse(generatedContent)

    return new Response(
      JSON.stringify({
        success: true,
        email: emailData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})