/*
  # Add Assignment Management RPC Functions

  1. New Functions
    - `bulk_update_extension_stage(engagement_ids[], new_stage)` - Update stage for multiple engagements
    - `toggle_assignment_flag(engagement_id, flag_name, flag_value)` - Toggle looking/exiting flags

  2. Security
    - Functions use SECURITY DEFINER with explicit grants to authenticated users
    - Input validation for flag names and stage values

  3. Notes
    - Optimized for bulk operations and realtime updates
    - Returns updated engagement data for optimistic UI updates
*/

-- ============================================================================
-- BULK UPDATE EXTENSION STAGE
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
-- TOGGLE ASSIGNMENT FLAG
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
    RAISE EXCEPTION 'Invalid flag_name: %. Must be "looking" or "exiting"', flag_name;
  END IF;

  -- Update appropriate flag
  IF flag_name = 'looking' THEN
    RETURN QUERY
    UPDATE public.engagements
    SET
      is_looking_for_new_facility = flag_value,
      updated_at = NOW()
    WHERE engagements.id = engagement_id
    RETURNING
      engagements.id,
      engagements.is_looking_for_new_facility,
      engagements.is_exiting,
      engagements.updated_at;
  ELSIF flag_name = 'exiting' THEN
    RETURN QUERY
    UPDATE public.engagements
    SET
      is_exiting = flag_value,
      updated_at = NOW()
    WHERE engagements.id = engagement_id
    RETURNING
      engagements.id,
      engagements.is_looking_for_new_facility,
      engagements.is_exiting,
      engagements.updated_at;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_assignment_flag(bigint, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.toggle_assignment_flag IS
  'Toggles is_looking_for_new_facility or is_exiting flag for an engagement';
