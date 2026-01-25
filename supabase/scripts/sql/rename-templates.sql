-- ============================================================================
-- FINAL UPDATE: Clean Template + "Thank you!" Sign-off
-- Run in Supabase SQL Editor
-- ============================================================================

UPDATE communication_templates
SET 
    -- FIXED SUBJECT LINE: Specialty – Facility | $Pay/week
    subject_template = '{{specialty}} – {{facility}} | {{weekly_gross}}/week',
    
    -- CLEAN BODY: No markdown asterisks, clean formatting, "Thank you!" sign-off
    body_template = 'Hi {{candidate_name}},

I came across your profile and thought you''d be a great fit for this {{specialty}} position at {{facility}}.

Facility: {{facility}}
Location: {{location}}
Assignment Dates: {{start_date}} – {{end_date}}
Shifts & Hours: {{shift_info}} ({{weekly_hours}} hours/week)

Pay Package:
• Taxable Hourly Rate: {{taxable_rate}}/hr
• Meals & Housing Stipend: {{weekly_stipends}}/week
• Total Gross Weekly Pay: {{weekly_gross}}

This facility has excellent traveler reviews plus the rate is solid.

To move forward, just confirm:
• Are you available to start {{start_date}}?
• Do you have any time-off requests during the contract?
• Is your Aya profile up to date?

Let me know and I can get you submitted right away.

Thank you!'
WHERE name = 'Pay Package Interest';

-- Verify Clean Output
SELECT name, subject_template, body_template FROM communication_templates WHERE name = 'Pay Package Interest';
