-- ============================================================================
-- Migration: Add Reference Request Template
-- Description: Supervisory reference request template with personalization room
-- ============================================================================

INSERT INTO communication_templates (category, name, description, subject_template, body_template, required_variables)
VALUES 
(
    'prospect', 
    'reference_request', 
    'Request for supervisory reference from a candidate. AI can personalize the opening and add context about the specific facility requirement.',
    'Reference Request – {{candidate_name}}',
    E'Hi {{first_name}},

{{opening_context}}

The facility requires a verified supervisory reference from the past 12 months.
Could you please ask a supervisor from within the last 12 months to complete the attached reference form and email it to References@ayahealthcare.com?

Supervisory Reference – Can be a Team Lead, Charge Nurse, Nurse Practitioner, Unit Manager, or Director.

Please ensure the reference matches one of the references listed on your Aya profile with the correct facility and dates.

For tracking purposes, it would be helpful if they could CC me at Kofi.Farkye@ayahealthcare.com and Tiffany.Chavez@ayahealthcare.com.

{{closing_note}}

Thank you!',
    '["candidate_name", "first_name", "opening_context", "closing_note"]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    body_template = EXCLUDED.body_template,
    subject_template = EXCLUDED.subject_template,
    required_variables = EXCLUDED.required_variables,
    description = EXCLUDED.description;
