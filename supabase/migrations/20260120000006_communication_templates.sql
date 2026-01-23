-- ============================================================================
-- Migration: Create Communication Template Registry (Production Optimized)
-- Description: Stores editorial templates with automated versioning and indexing.
-- ============================================================================

-- Ensure a clean slate for the initial migration
DROP TABLE IF EXISTS communication_templates CASCADE;

-- 1. Create the table with operational guards
CREATE TABLE communication_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('active', 'prospect', 'retention')),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    required_variables JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexing for high-speed retrieval
CREATE INDEX IF NOT EXISTS idx_templates_category ON communication_templates(category) WHERE is_active = true;

-- 3. Automate the timestamp and versioning
CREATE OR REPLACE FUNCTION update_communication_template_metadata()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_communication_templates_modtime ON communication_templates;
CREATE TRIGGER tr_update_communication_templates_modtime
    BEFORE UPDATE ON communication_templates
    FOR EACH ROW
    EXECUTE PROCEDURE update_communication_template_metadata();

-- 4. RLS
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read access" ON communication_templates;
CREATE POLICY "Allow authenticated read access" ON communication_templates FOR SELECT TO authenticated USING (is_active = true);

-- 5. Seed Initial "Radiant Standard" Templates
INSERT INTO communication_templates (category, name, description, subject_template, body_template, required_variables)
VALUES 
(
    'active', 
    'extension_request', 
    'Sent to Account Manager when a candidate wants to extend their contract.',
    'EXTENSION REQUEST – {{candidate_name}} – {{facility_name}}',
    E'Hi Team,\n\n{{candidate_name}} would like to extend for {{extension_duration}}.\n\nCandidate: {{candidate_name}}\nLocal (Y/N): {{is_local}}\nFacility: {{facility_name}}\nUnit: {{specialty}}\nCurrent Bill Rate: {{current_bill_rate}}\nCurrent Shift/Hours: {{current_shift}}\nCurrent End Date: {{current_end_date}}\nProposed Extension Dates: {{proposed_dates}}\nRequested Time Off Between Assignments: {{time_off_between}}\nRequested Time Off During Assignment: {{time_off_during}}\nWas this Extension Discussed with Manager (name)?: Yes\nAny other details we need to confirm?: N/A',
    '["candidate_name", "facility_name", "is_local", "specialty", "current_bill_rate", "current_shift", "current_end_date", "proposed_dates", "time_off_between", "time_off_during", "extension_duration"]'::jsonb
),
(
    'retention',
    'reassignment_request',
    'Sent to Reassignments team when a candidate needs to be reassigned.',
    'Please Reassign - {{candidate_name}}',
    E'Hi Team,\n\nCan we please reassign - {{candidate_name}}\n\n{{nova_url}}\n\nThank you!',
    '["candidate_name", "nova_url"]'::jsonb
),
(
    'active',
    'margin_approval',
    'Requesting internal approval for low margin or custom pay packages.',
    'Margin Approval – {{candidate_name}} – {{margin_percentage}}%',
    E'To: Colton.Valdez@ayahealthcare.com\n\nReason needed for approval? {{reason}}\nIs this a New Placement, Extension, or Change of Contract? {{placement_type}}\nIs premium approval needed? {{premium_needed}}\nWas this sent to Comp Info (Y/N)? {{sent_to_comp}}\n\nBest,\nKofi Farkye\nSenior Recruiter, Fulfillment Specialist',
    '["candidate_name", "margin_percentage", "reason", "placement_type", "premium_needed", "sent_to_comp"]'::jsonb
),
(
    'prospect',
    'cold_outreach',
    'Standard Aya Editorial Standard for initial candidate outreach.',
    '{{position_name}} – {{facility_name}} | ${{gross_weekly_pay}}/week',
    E'Hi {{first_name}},\n\n{{hook}}\n\nFacility: {{facility_name}}\nLocation: {{city}}, {{state}}\nAssignment Dates: {{start_date}} – {{end_date}}\nShifts & Hours: {{shift_type}} ({{hours_per_week}} hours/week)\n\nPay Package:\nTaxable Hourly Rate: ${{taxable_rate}}/hr\nMeals & Housing Stipend: ${{stipend_weekly}}/week\nTotal Gross Weekly Pay: ${{gross_weekly_pay}}\n\n{{closing}}\n\nTo move forward, just confirm:\n- Are you available to start {{start_date}}?\n- Do you have any time-off requests during the contract?\n- Is your Aya profile current (work history, certs, skills checklist)?\n\nThank you!',
    '["position_name", "facility_name", "gross_weekly_pay", "first_name", "hook", "city", "state", "start_date", "end_date", "shift_type", "hours_per_week", "taxable_rate", "stipend_weekly", "closing"]'::jsonb
),
(
    'prospect',
    'licensing_info_request',
    'Request licensing information from the Allied Licensing team.',
    'Licensing - {{specialty}} - {{state}}',
    E'Hi Team,\n\nCan I please have {{state}} {{specialty}} licensing information.\n\nThank you!',
    '["specialty", "state"]'::jsonb
);