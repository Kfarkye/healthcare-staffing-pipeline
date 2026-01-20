-- Unified Active Dashboard Migration
-- Created: 2026-01-20
-- Purpose: Add state columns to travel_candidates and unify them in the active assignments view.

-- 1. Add state columns to travel_candidates
ALTER TABLE public.travel_candidates 
ADD COLUMN IF NOT EXISTS extension_stage text DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS is_looking_for_new_facility boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_exiting boolean DEFAULT false;

-- 2. Redefine active_assignments_dashboard
DROP VIEW IF EXISTS public.active_assignments_dashboard CASCADE;

CREATE VIEW public.active_assignments_dashboard AS
-- NATIVE ENGAGEMENTS
SELECT
  e.id AS id,
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
  'Active'::text AS status,
  e.bill_rate,
  e.actual_margin,
  e.notes,
  COALESCE(e.extension_stage, 'not_started') AS extension_stage,
  COALESCE(e.is_looking_for_new_facility, false) AS is_looking_for_new_facility,
  COALESCE(e.is_exiting, false) AS is_exiting,
  'native'::text AS source_table
FROM
  public.engagements e
  LEFT JOIN public.prospects p ON e.prospect_id = p.id
WHERE
  e.status::text IN ('Active', 'ACTIVE')

UNION ALL

-- IMPORTED TRAVEL CANDIDATES
-- We offset IDs by 10M to ensure no collision with native engagements
SELECT
  (tc.id + 10000000) AS id,
  tc.candidate_id,
  tc.candidate_name,
  COALESCE(tc.day_phone, tc.cell_phone) AS phone,
  tc.email,
  NULL AS nova_url,
  tc.facility AS facility_name,
  NULL AS specialty, -- Nova export doesn't have specialty in the main list
  tc.end_date,
  COALESCE(tc.end_date - CURRENT_DATE, 999) AS days_to_end,
  CASE
    WHEN tc.end_date IS NULL THEN 'unknown'
    WHEN (tc.end_date - CURRENT_DATE) < 0 THEN 'overdue'
    WHEN (tc.end_date - CURRENT_DATE) <= 35 THEN 'critical'
    WHEN (tc.end_date - CURRENT_DATE) <= 56 THEN 'warning'
    ELSE 'normal'
  END AS end_bucket,
  'Active'::text AS status,
  NULL AS bill_rate,
  tc.margin::numeric AS actual_margin,
  NULL AS notes,
  COALESCE(tc.extension_stage, 'not_started') AS extension_stage,
  COALESCE(tc.is_looking_for_new_facility, false) AS is_looking_for_new_facility,
  COALESCE(tc.is_exiting, false) AS is_exiting,
  'imported'::text AS source_table
FROM
  public.travel_candidates tc;

COMMENT ON VIEW public.active_assignments_dashboard IS
  'Unified view combining native engagements and imported travel candidates for the master active dashboard.';

-- 3. Update RPC: bulk_update_extension_stage
DROP FUNCTION IF EXISTS public.bulk_update_extension_stage(bigint[], text);

CREATE OR REPLACE FUNCTION public.bulk_update_extension_stage(
  p_ids bigint[],
  p_new_stage text
)
RETURNS TABLE (
  id bigint,
  extension_stage text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate stage value
  IF p_new_stage NOT IN ('not_started', 'outreach', 'interested', 'requested', 'signed') THEN
    RAISE EXCEPTION 'Invalid extension_stage value: %', p_new_stage;
  END IF;

  -- Update native engagements
  RETURN QUERY
  UPDATE public.engagements
  SET
    extension_stage = p_new_stage,
    updated_at = NOW()
  WHERE public.engagements.id = ANY(p_ids)
  RETURNING public.engagements.id, public.engagements.extension_stage, public.engagements.updated_at;

  -- Update imported travel candidates (ids >= 10,000,000)
  RETURN QUERY
  UPDATE public.travel_candidates
  SET
    extension_stage = p_new_stage,
    updated_at = NOW()
  WHERE (public.travel_candidates.id + 10000000) = ANY(p_ids)
  RETURNING (public.travel_candidates.id + 10000000) AS id, public.travel_candidates.extension_stage, public.travel_candidates.updated_at;
END;
$$;

-- 4. Update RPC: toggle_assignment_flag
DROP FUNCTION IF EXISTS public.toggle_assignment_flag(bigint, text, boolean);

CREATE OR REPLACE FUNCTION public.toggle_assignment_flag(
  p_id bigint,
  p_flag_name text,
  p_flag_value boolean
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
  IF p_flag_name NOT IN ('looking', 'exiting') THEN
    RAISE EXCEPTION 'Invalid flag_name: %. Must be ''looking'' or ''exiting''', p_flag_name;
  END IF;

  -- Handler for Native engagements (ids < 10,000,000)
  IF p_id < 10000000 THEN
    IF p_flag_name = 'looking' THEN
      RETURN QUERY
      UPDATE public.engagements
      SET is_looking_for_new_facility = p_flag_value, updated_at = NOW()
      WHERE public.engagements.id = p_id
      RETURNING public.engagements.id, public.engagements.is_looking_for_new_facility, public.engagements.is_exiting, public.engagements.updated_at;
    ELSIF p_flag_name = 'exiting' THEN
      RETURN QUERY
      UPDATE public.engagements
      SET is_exiting = p_flag_value, updated_at = NOW()
      WHERE public.engagements.id = p_id
      RETURNING public.engagements.id, public.engagements.is_looking_for_new_facility, public.engagements.is_exiting, public.engagements.updated_at;
    END IF;
  
  -- Handler for Imported candidates (ids >= 10,000,000)
  ELSE
    IF p_flag_name = 'looking' THEN
      RETURN QUERY
      UPDATE public.travel_candidates
      SET is_looking_for_new_facility = p_flag_value, updated_at = NOW()
      WHERE (public.travel_candidates.id + 10000000) = p_id
      RETURNING (public.travel_candidates.id + 10000000) AS id, public.travel_candidates.is_looking_for_new_facility, public.travel_candidates.is_exiting, public.travel_candidates.updated_at;
    ELSIF p_flag_name = 'exiting' THEN
      RETURN QUERY
      UPDATE public.travel_candidates
      SET is_exiting = p_flag_value, updated_at = NOW()
      WHERE (public.travel_candidates.id + 10000000) = p_id
      RETURNING (public.travel_candidates.id + 10000000) AS id, public.travel_candidates.is_looking_for_new_facility, public.travel_candidates.is_exiting, public.travel_candidates.updated_at;
    END IF;
  END IF;
END;
$$;
