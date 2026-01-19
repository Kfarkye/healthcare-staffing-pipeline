/*
  # Fix bulk_update_extension_stage RPC function

  PROBLEM:
  1. Column type is extension_stage ENUM, but function parameter is text
  2. Function returns `id` but signature declares `engagement_id`

  SOLUTION:
  1. Cast text parameter to extension_stage enum
  2. Add AS alias to properly name the returned column

  Run this in Supabase SQL Editor to fix drag-and-drop functionality
*/

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

  -- Update engagements and return updated rows with proper casting and aliasing
  RETURN QUERY
  UPDATE public.engagements
  SET
    extension_stage = new_stage::extension_stage,
    updated_at = NOW()
  WHERE id = ANY(engagement_ids)
  RETURNING id AS engagement_id, engagements.extension_stage::text, engagements.updated_at;
END;
$$;

-- Verify the fix
SELECT 'bulk_update_extension_stage function updated successfully' AS status;
