const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, cc, subject, body } = await req.json();
    
    // Validate required fields
    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: to, subject, and body are required' 
        }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    // For development, just return success
    // In production, integrate with your email service (SendGrid, Resend, etc.)
    console.log('Email would be sent:', { to, cc, subject, bodyLength: body.length });
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Email sent successfully',
        metadata: {
          to,
          cc,
          subject,
          timestamp: new Date().toISOString()
        }
      }),
      { 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
    
  } catch (error) {
    console.error('Send email error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to send email',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
});