-- ============================================================================
-- Migration: Add Interested Click Templates (Working + Re-Engaged Traveler)
-- Description: Templates for when travelers click "Interested" on an assignment
--   1. Working Traveler: Currently on assignment, seeking next position (not extending)
--   2. Re-Engaged Traveler: Previously inactive, re-entering the pipeline
-- ============================================================================

-- Template 1: Working Traveler Interest
-- For travelers currently on assignment who click interested because they're looking for their next placement
INSERT INTO communication_templates (category, name, description, subject_template, body_template, required_variables)
VALUES (
    'active',
    'working_traveler_interest',
    'For working travelers who clicked Interested on an assignment. They are currently on contract but seeking their next placement (not extending).',
    '{{specialty}} – {{facility_name}} | ${{gross_weekly_pay}}/week',
    E'Hi {{first_name}},\n\nI saw you clicked interested on this one — here are the details:\n\nFacility: {{facility_name}}\nLocation: {{city}}, {{state}}\nDates: {{start_date}} - {{end_date}}\nShift: {{shift_type}} ({{hours_per_week}} hrs/wk)\n\nPay: ${{taxable_rate}}/hr + ${{stipend_weekly}}/wk stipends = ${{gross_weekly_pay}}/wk\n\nLet me know if you have any time-off needs and I''ll get you submitted!\n\nThank you!',
    '["specialty", "facility_name", "gross_weekly_pay", "first_name", "city", "state", "start_date", "end_date", "shift_type", "hours_per_week", "taxable_rate", "stipend_weekly"]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    required_variables = EXCLUDED.required_variables,
    description = EXCLUDED.description;

-- Template 2: Re-Engaged Traveler Interest
-- For travelers who were previously inactive and are now clicking interested to get back into the pipeline
INSERT INTO communication_templates (category, name, description, subject_template, body_template, required_variables)
VALUES (
    'retention',
    'reengaged_traveler_interest',
    'For re-engaged travelers who clicked Interested on an assignment. They were previously inactive and are now ready to travel again.',
    '{{specialty}} – {{facility_name}} | ${{gross_weekly_pay}}/week',
    E'Hi {{first_name}},\n\nI hope you''re doing well! I saw you clicked interested on this one — here are the details:\n\nFacility: {{facility_name}}\nLocation: {{city}}, {{state}}\nDates: {{start_date}} - {{end_date}}\nShift: {{shift_type}} ({{hours_per_week}} hrs/wk)\n\nPay: ${{taxable_rate}}/hr + ${{stipend_weekly}}/wk stipends = ${{gross_weekly_pay}}/wk\n\nLet me know if you have any time-off needs and I''ll get you submitted. Happy to jump on a quick call if you''d like to chat through anything!\n\nThank you!',
    '["specialty", "facility_name", "gross_weekly_pay", "first_name", "city", "state", "start_date", "end_date", "shift_type", "hours_per_week", "taxable_rate", "stipend_weekly"]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    required_variables = EXCLUDED.required_variables,
    description = EXCLUDED.description;

-- Verification query
SELECT name, category, description FROM communication_templates 
WHERE name IN ('working_traveler_interest', 'reengaged_traveler_interest');
