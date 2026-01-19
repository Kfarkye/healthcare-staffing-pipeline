-- Fix active_assignments_dashboard view to show contact information
-- Run this in your Supabase SQL Editor
--
-- Changes:
-- - Added phone, email, nova_url, specialty from active_assignments table
-- - Removed ORDER BY (sorting should be done in application queries)
-- - Kept end_date as DATE type instead of converting to text
-- - Removed WHERE clause to include all assignments (even those without end_date)

DROP VIEW IF EXISTS public.active_assignments_dashboard CASCADE;

CREATE VIEW public.active_assignments_dashboard AS
SELECT
  aa.id AS engagement_id,
  aa.candidate_id,
  aa.candidate_name,
  aa.phone,
  aa.email,
  aa.nova_url,
  aa.facility_name,
  aa.specialty,
  aa.end_date,
  CASE
    WHEN aa.end_date IS NULL THEN 999
    ELSE (aa.end_date - CURRENT_DATE)
  END AS days_to_end,
  CASE
    WHEN aa.end_date IS NULL THEN 'unknown'
    WHEN (aa.end_date - CURRENT_DATE) <= 35 THEN 'critical'
    WHEN (aa.end_date - CURRENT_DATE) <= 56 THEN 'warning'
    ELSE 'normal'
  END AS end_bucket,
  'Active' AS status,
  NULL::numeric AS bill_rate,
  NULL::numeric AS actual_margin,
  aa.notes,
  aa.extension_stage,
  aa.is_looking_for_new_facility,
  aa.is_exiting
FROM
  public.active_assignments AS aa;

COMMENT ON VIEW public.active_assignments_dashboard IS
  'Dashboard view providing active assignment data with calculated fields for UI consumption';
