-- ============================================================================
-- Migration: Add Pay Package Outreach Template
-- Description: Proper template for sending pay package details to candidates
-- ============================================================================

-- Update the cold_outreach template to match the Aya Editorial Standard
UPDATE communication_templates
SET 
    subject_template = '{{specialty}} - {{facility_name}} | ${{gross_weekly_pay}}/week',
    body_template = E'Hi {{first_name}},\n\nI came across your profile and thought you''d be a great fit for this {{specialty}} position at {{facility_name}}.\n\nFacility: {{facility_name}}\nLocation: {{city}}, {{state}}\nAssignment Dates: {{start_date}} - {{end_date}}\nShifts & Hours: {{shift_type}} ({{hours_per_week}} hours/week)\n\nPay Package:\n- Taxable Hourly Rate: ${{taxable_rate}}/hr\n- Meals & Housing Stipend: ${{stipend_weekly}}/week\n- Total Gross Weekly Pay: ${{gross_weekly_pay}}\n\n{{closing}}\n\nTo move forward, just confirm:\n- Are you available to start {{start_date}}?\n- Do you have any time-off requests during the contract?\n- Is your Aya profile up to date?\n\nLet me know and I can get you submitted right away.\n\nThank you!',
    required_variables = '["specialty", "facility_name", "gross_weekly_pay", "first_name", "city", "state", "start_date", "end_date", "shift_type", "hours_per_week", "taxable_rate", "stipend_weekly", "closing"]'::jsonb,
    description = 'Aya Editorial Standard for pay package outreach to candidates.'
WHERE name = 'cold_outreach';

-- Also insert a dedicated pay_package_outreach template for explicit use
INSERT INTO communication_templates (category, name, description, subject_template, body_template, required_variables)
VALUES (
    'prospect',
    'pay_package_outreach',
    'Send pay package details to a candidate for a specific job opening.',
    '{{specialty}} - {{facility_name}} | ${{gross_weekly_pay}}/week',
    E'Hi {{first_name}},\n\nI came across your profile and thought you''d be a great fit for this {{specialty}} position at {{facility_name}}.\n\nFacility: {{facility_name}}\nLocation: {{city}}, {{state}}\nAssignment Dates: {{start_date}} - {{end_date}}\nShifts & Hours: {{shift_type}} ({{hours_per_week}} hours/week)\n\nPay Package:\n- Taxable Hourly Rate: ${{taxable_rate}}/hr\n- Meals & Housing Stipend: ${{stipend_weekly}}/week\n- Total Gross Weekly Pay: ${{gross_weekly_pay}}\n\n{{closing}}\n\nTo move forward, just confirm:\n- Are you available to start {{start_date}}?\n- Do you have any time-off requests during the contract?\n- Is your Aya profile up to date?\n\nLet me know and I can get you submitted right away.\n\nThank you!',
    '["specialty", "facility_name", "gross_weekly_pay", "first_name", "city", "state", "start_date", "end_date", "shift_type", "hours_per_week", "taxable_rate", "stipend_weekly", "closing"]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    required_variables = EXCLUDED.required_variables,
    description = EXCLUDED.description;
