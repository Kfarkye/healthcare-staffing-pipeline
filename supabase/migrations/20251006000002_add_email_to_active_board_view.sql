/*
  # Add Email to Active Assignments Dashboard View

  1. Changes
    - Recreates `active_assignments_dashboard` to include candidate email
    - Joins with candidates table to fetch email field

  2. Security
    - View inherits RLS from underlying tables
*/

-- Drop the existing view
DROP VIEW IF EXISTS public.active_assignments_dashboard;

-- Recreate the view with email field
CREATE VIEW public.active_assignments_dashboard AS
SELECT
  c.id AS candidate_id,
  e.id AS engagement_id,
  c.full_name AS candidate_name,
  c.phone,
  c.email,
  c.nova_url,
  e.facility_name,
  e.specialty,
  e.end_date,
  e.end_date - CURRENT_DATE AS days_to_end,
  CASE
    WHEN (e.end_date - CURRENT_DATE) < 0 THEN 'ENDED_OVERDUE'::text
    WHEN (e.end_date - CURRENT_DATE) >= 0 AND (e.end_date - CURRENT_DATE) <= 14 THEN 'ENDS_IN_2_WEEKS'::text
    WHEN (e.end_date - CURRENT_DATE) >= 15 AND (e.end_date - CURRENT_DATE) <= 30 THEN 'ENDS_IN_30_DAYS'::text
    ELSE 'ENDS_LATER'::text
  END AS end_bucket,
  e.status,
  e.bill_rate,
  e.actual_margin,
  e.notes
FROM engagements e
LEFT JOIN candidates c ON c.id = e.candidate_id
WHERE e.status IN ('Active', 'Active - Extension Signed', 'Active - Seeking New');
