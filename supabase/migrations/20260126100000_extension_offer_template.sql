-- ============================================================================
-- Migration: Add Extension Offer Template (Candidate-Facing)
-- Description: Email template sent TO candidates offering contract extension
-- Standard: Elite (Includes Hours/Week and OT Rate for transparency)
-- NOTE: NO ASTERISKS - email clients don't render markdown
-- ============================================================================

INSERT INTO communication_templates (category, name, description, subject_template, body_template, required_variables)
VALUES 
(
    'active', 
    'extension_offer', 
    'Sent directly to candidates offering them an extension at their current facility.',
    'Extension Opportunity – {{facility_name}} | {{extension_duration}}',
    E'Hi {{first_name}},\n\nGreat news! {{facility_name}} would love for you to extend your assignment.\n\nCurrent Assignment:\nFacility: {{facility_name}}\nUnit: {{specialty}}\nCurrent End Date: {{current_end_date}}\n\nExtension Offer:\nProposed Dates: {{proposed_start_date}} – {{proposed_end_date}}\nDuration: {{extension_duration}}\nShifts: {{shift_type}} ({{hours_per_week}} hrs/week)\n\nPay Package:\nTaxable Hourly Rate: ${{taxable_rate}}/hr\nOvertime Rate: ${{overtime_rate}}/hr\nStipends (Meals & Housing): ${{stipend_weekly}}/week\nTotal Gross Weekly Pay: ${{gross_weekly_pay}}\n\n{{additional_notes}}\n\nTo move forward, please let me know:\n1. Any time off needed between contracts?\n2. Any time off needed during the extension?\n3. Any items you''d like to discuss or reimbursements that need to be added?\n\nAlways happy to discuss — just reply or give me a call!',
    '["first_name", "facility_name", "specialty", "current_end_date", "proposed_start_date", "proposed_end_date", "extension_duration", "shift_type", "hours_per_week", "taxable_rate", "overtime_rate", "stipend_weekly", "gross_weekly_pay", "additional_notes"]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    required_variables = EXCLUDED.required_variables,
    description = EXCLUDED.description,
    updated_at = NOW();
