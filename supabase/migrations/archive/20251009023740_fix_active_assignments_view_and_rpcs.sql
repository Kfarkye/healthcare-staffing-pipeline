/*
  # Fix Active Assignments View and RPC Functions
  
  This migration creates the missing view and RPC functions needed for the Active Assignments dashboard.
  
  1. New Views
    - `active_assignments_dashboard` - View that exposes engagements with status='Active' in dashboard format
  
  2. New Functions
    - `bulk_update_extension_stage(engagement_ids[], new_stage)` - Update extension stage for multiple engagements
    - `toggle_assignment_flag(engagement_id, flag_name, flag_value)` - Toggle looking/exiting flags
  
  3. Security
    - Functions use SECURITY DEFINER with grants to authenticated users
    - View inherits RLS from engagements table
*/

-- ============================================================================
-- CREATE ACTIVE ASSIGNMENTS DASHBOARD VIEW
-- ============================================================================

DROP VIEW IF EXISTS public.active_assignments_dashboard CASCADE;

CREATE VIEW public.active_assignments_dashboard AS
SELECT
  e.id AS engagement_id,
  COALESCE(p.candidate_id, 0) AS candidate_id,
  COALESCE(p.name, 'Unknown') AS candidate_name,
  p.phone,
  p.email,
  p.nova_url,
  e.facility_name,
  e.specialty,
  e.end_date,
  COALESCE(e.end_date - CURRENT_DATE, 999) AS days_to_end,
  CASE
    WHEN e.end_date IS NULL THEN 'unknown'
    WHEN (e.end_date - CURRENT_DATE) < 0 THEN 'overdue'
    WHEN (e.end_date - CURRENT_DATE) <= 35 THEN 'critical'
    WHEN (e.end_date - CURRENT_DATE) <= 56 THEN 'warning'
    ELSE 'normal'
  END AS end_bucket,
  e.status::text,
  e.bill_rate,
  e.actual_margin,
  e.notes,
  COALESCE(e.extension_stage, 'not_started') AS extension_stage,
  COALESCE(e.is_looking_for_new_facility, false) AS is_looking_for_new_facility,
  COALESCE(e.is_exiting, false) AS is_exiting
FROM
  public.engagements e
  LEFT JOIN public.prospects p ON e.prospect_id = p.id
WHERE
  e.status::text = 'Active';

COMMENT ON VIEW public.active_assignments_dashboard IS
  'Dashboard view providing active assignment data (status=Active only) with calculated fields for UI consumption';

-- ============================================================================
-- BULK UPDATE EXTENSION STAGE RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_extension_stage(
  engagement_ids bigint[],
  new_stage text
)
RETURNS TABLE (
  engagement_id bigint,
  extension_stage text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate stage value
  IF new_stage NOT IN ('not_started', 'outreach', 'interested', 'requested', 'signed') THEN
    RAISE EXCEPTION 'Invalid extension_stage value: %', new_stage;
  END IF;

  -- Update engagements and return updated rows
  RETURN QUERY
  UPDATE public.engagements
  SET
    extension_stage = new_stage,
    updated_at = NOW()
  WHERE id = ANY(engagement_ids)
  RETURNING id, engagements.extension_stage, engagements.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_extension_stage(bigint[], text) TO authenticated;

COMMENT ON FUNCTION public.bulk_update_extension_stage IS
  'Updates extension_stage for multiple engagements in a single transaction';

-- ============================================================================
-- TOGGLE ASSIGNMENT FLAG RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_assignment_flag(
  engagement_id bigint,
  flag_name text,
  flag_value boolean
)
RETURNS TABLE (
  id bigint,
  is_looking_for_new_facility boolean,
  is_exiting boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate flag name
  IF flag_name NOT IN ('looking', 'exiting') THEN
    RAISE EXCEPTION 'Invalid flag_name: %. Must be ''looking'' or ''exiting''', flag_name;
  END IF;

  -- Update the appropriate flag and return updated row
  IF flag_name = 'looking' THEN
    RETURN QUERY
    UPDATE public.engagements
    SET
      is_looking_for_new_facility = flag_value,
      updated_at = NOW()
    WHERE engagements.id = engagement_id
    RETURNING engagements.id, engagements.is_looking_for_new_facility, engagements.is_exiting, engagements.updated_at;
  ELSIF flag_name = 'exiting' THEN
    RETURN QUERY
    UPDATE public.engagements
    SET
      is_exiting = flag_value,
      updated_at = NOW()
    WHERE engagements.id = engagement_id
    RETURNING engagements.id, engagements.is_looking_for_new_facility, engagements.is_exiting, engagements.updated_at;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_assignment_flag(bigint, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.toggle_assignment_flag IS
  'Toggles is_looking_for_new_facility or is_exiting flags on an engagement';
