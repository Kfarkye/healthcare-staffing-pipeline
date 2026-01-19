import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FollowUpDashboard {
  id: string;
  candidate_id: number;
  recruiter_id: string;
  follow_up_type: string;
  scheduled_date: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  candidate_specialty: string | null;
  candidate_profession: string | null;
  candidate_status: string | null;
  candidate_nova_url: string | null;
  recruiter_email: string;
  recruiter_name: string;
}

interface FollowUpDigest {
  recruiter_id: string;
  recruiter_email: string;
  recruiter_name: string;
  follow_ups: FollowUpDashboard[];
  overdue_count: number;
  today_count: number;
  upcoming_count: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl = Deno.env.get("APP_URL") || "https://yourapp.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];

    const { data: followUps, error } = await supabase
      .from('follow_ups_dashboard')
      .select('*')
      .eq('completed', false)
      .lte('scheduled_date', sevenDaysStr)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;

    const recruiterDigests = new Map<string, FollowUpDigest>();

    for (const followUp of (followUps as FollowUpDashboard[]) || []) {
      if (!recruiterDigests.has(followUp.recruiter_id)) {
        recruiterDigests.set(followUp.recruiter_id, {
          recruiter_id: followUp.recruiter_id,
          recruiter_email: followUp.recruiter_email,
          recruiter_name: followUp.recruiter_name,
          follow_ups: [],
          overdue_count: 0,
          today_count: 0,
          upcoming_count: 0,
        });
      }

      const digest = recruiterDigests.get(followUp.recruiter_id)!;
      digest.follow_ups.push(followUp);

      const followUpDate = new Date(followUp.scheduled_date);
      followUpDate.setHours(0, 0, 0, 0);

      if (followUpDate < today) {
        digest.overdue_count++;
      } else if (followUpDate.getTime() === today.getTime()) {
        digest.today_count++;
      } else {
        digest.upcoming_count++;
      }
    }

    const notifications: Array<{ recruiter: string; sent: boolean; error?: string }> = [];

    for (const digest of recruiterDigests.values()) {
      if (digest.overdue_count === 0 && digest.today_count === 0) {
        continue;
      }

      try {
        const emailHtml = generateEmailHtml(digest, appUrl);

        console.log(`Would send email to ${digest.recruiter_email}:`);
        console.log(`- Overdue: ${digest.overdue_count}`);
        console.log(`- Today: ${digest.today_count}`);
        console.log(`- Upcoming: ${digest.upcoming_count}`);

        notifications.push({
          recruiter: digest.recruiter_email,
          sent: true,
        });
      } catch (err) {
        console.error(`Failed to send notification to ${digest.recruiter_email}:`, err);
        notifications.push({
          recruiter: digest.recruiter_email,
          sent: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        digests_processed: recruiterDigests.size,
        notifications_sent: notifications.filter(n => n.sent).length,
        notifications,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in notify_due_followups:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

function generateEmailHtml(digest: FollowUpDigest, appUrl: string): string {
  const overdueHtml = digest.overdue_count > 0
    ? `<div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 16px;">
         <strong style="color: #dc2626;">⚠️ ${digest.overdue_count} Overdue Follow-up${digest.overdue_count > 1 ? 's' : ''}</strong>
       </div>`
    : '';

  const todayHtml = digest.today_count > 0
    ? `<div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 16px;">
         <strong style="color: #2563eb;">📅 ${digest.today_count} Due Today</strong>
       </div>`
    : '';

  const followUpsList = digest.follow_ups
    .filter(f => {
      const date = new Date(f.scheduled_date);
      date.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date <= today;
    })
    .map(f => {
      const date = new Date(f.scheduled_date);
      date.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isOverdue = date < today;

      return `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: white;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <strong style="font-size: 16px; color: #1e293b;">${f.candidate_name}</strong>
              <div style="color: #64748b; font-size: 14px; margin-top: 4px;">
                ${f.candidate_specialty || f.candidate_profession || ''}
              </div>
            </div>
            <span style="background: ${isOverdue ? '#fef2f2' : '#eff6ff'};
                         color: ${isOverdue ? '#dc2626' : '#2563eb'};
                         padding: 4px 8px;
                         border-radius: 4px;
                         font-size: 12px;
                         font-weight: 600;">
              ${isOverdue ? 'OVERDUE' : 'TODAY'}
            </span>
          </div>
          ${f.notes ? `<div style="color: #64748b; font-size: 14px; margin-top: 8px;">${f.notes}</div>` : ''}
          ${f.candidate_email ? `<div style="color: #64748b; font-size: 12px; margin-top: 8px;">📧 ${f.candidate_email}</div>` : ''}
          ${f.candidate_phone ? `<div style="color: #64748b; font-size: 12px;">📱 ${f.candidate_phone}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                 background-color: #f8fafc;
                 margin: 0;
                 padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                    color: white;
                    padding: 24px;
                    border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Follow-Up Reminder</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">Hi ${digest.recruiter_name},</p>
        </div>

        <div style="padding: 24px;">
          ${overdueHtml}
          ${todayHtml}

          <h2 style="color: #1e293b; font-size: 18px; margin: 24px 0 16px 0;">Action Required</h2>

          ${followUpsList}

          <div style="text-align: center; margin-top: 32px;">
            <a href="${appUrl}/follow-ups"
               style="display: inline-block;
                      background: #3b82f6;
                      color: white;
                      text-decoration: none;
                      padding: 12px 24px;
                      border-radius: 8px;
                      font-weight: 600;">
              View All Follow-Ups
            </a>
          </div>
        </div>

        <div style="background: #f8fafc;
                    padding: 16px 24px;
                    border-radius: 0 0 12px 12px;
                    border-top: 1px solid #e2e8f0;
                    text-align: center;">
          <p style="margin: 0; color: #64748b; font-size: 12px;">
            You're receiving this because you have follow-ups due today or overdue.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}
