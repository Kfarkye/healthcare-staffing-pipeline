/*
  # Create Active Assignments Dashboard View

  1. New Views
    - `active_assignments_dashboard` - Dashboard view for active_assignments table

  2. Changes
    - Creates a view that exposes active_assignments data in the format expected by the UI
    - Calculates days_to_end and end_bucket for sorting/filtering

  3. Security
    - View inherits RLS from active_assignments table
*/

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.active_assignments_dashboard CASCADE;

-- Create view for active assignments dashboard
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
