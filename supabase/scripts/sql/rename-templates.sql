-- ============================================================================
-- FINAL UPDATE: Communication Templates
-- Run in Supabase SQL Editor
-- ============================================================================

-- Rename "Cold Outreach" to "Intro Outreach" (if not already done)
UPDATE communication_templates
SET 
    name = 'Intro Outreach',
    description = 'Cold introduction email for prospecting new candidates. Use when reaching out to someone for the first time without specific assignment details.'
WHERE name ILIKE '%cold%outreach%' OR name ILIKE '%cold%introduction%';

-- Update "Pay Package Interest" with optimized copy
UPDATE communication_templates
SET 
    subject_template = '{{specialty}} Opportunity at {{facility}} – {{weekly_gross}}/week',
    body_template = 'Hi {{candidate_name}},

I came across your profile and thought you''d be a great fit for this {{specialty}} position at {{facility}}.

**Facility:** {{facility}}
**Location:** {{location}}
**Assignment Dates:** {{start_date}} – {{end_date}}
**Shifts & Hours:** {{shift_info}} ({{weekly_hours}} hours/week)

**Pay Package:**
• Taxable Hourly Rate: {{taxable_rate}}/hr
• Meals & Housing Stipend: {{weekly_stipends}}/week
• Total Gross Weekly Pay: {{weekly_gross}}

This facility has excellent traveler reviews plus the rate is solid.

To move forward, just confirm:
• Are you available to start {{start_date}}?
• Do you have any time-off requests during the contract?
• Is your Aya profile up to date?

Let me know and I can get you submitted right away.'
WHERE name = 'Pay Package Interest';

-- Verify Updates
SELECT name, subject_template FROM communication_templates WHERE is_active = true ORDER BY name;
