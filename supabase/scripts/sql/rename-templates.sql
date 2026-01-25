-- ============================================================================
-- UPDATE: Rename communication templates for clarity
-- Run in Supabase SQL Editor
-- ============================================================================

-- Rename "Cold Outreach" to "Intro Outreach"
UPDATE communication_templates
SET 
    name = 'Intro Outreach',
    description = 'Cold introduction email for prospecting new candidates. Use when reaching out to someone for the first time without specific assignment details.'
WHERE name ILIKE '%cold%outreach%' OR name ILIKE '%cold%introduction%';

-- Add or update "Pay Package Interest" template
INSERT INTO communication_templates (name, category, description, subject_template, body_template, is_active)
VALUES (
    'Pay Package Interest',
    'prospect',
    'Email for sharing pay package details with a candidate who clicked interest or for confirmed assignment outreach. Use when you have margin calculator data.',
    'Exciting Opportunity at {{facility}} | {{weekly_gross}}/week, {{candidate_name}}!',
    'Hi {{candidate_name}},

Great news! I have a fantastic opportunity that matches your profile perfectly.

**Position Details:**
- **Facility:** {{facility}} in {{location}}
- **Specialty:** {{specialty}}
- **Start Date:** {{start_date}}
- **Duration:** {{duration}} weeks
- **Shift:** {{shift_info}}

**Compensation Package:**
- **Weekly Gross Pay:** {{weekly_gross}}
- **Taxable Hourly Rate:** {{taxable_rate}}/hr
- **Weekly Stipends:** {{weekly_stipends}} (Meals + Housing)

This is a great facility with excellent reviews from our travelers. Would you like to discuss this opportunity? I can walk you through the details and answer any questions.

Let me know your availability for a quick call!',
    true
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template;

-- Verify the updates
SELECT name, category, description FROM communication_templates WHERE is_active = true ORDER BY name;
