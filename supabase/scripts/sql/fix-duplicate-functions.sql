/*
  # Fix duplicate bulk_update_extension_stage functions

  PROBLEM: Two versions of the function exist, causing ambiguity:
  - public.bulk_update_extension_stage(bigint[], public.extension_stage)
  - public.bulk_update_extension_stage(bigint[], text)

  SOLUTION: Drop both and recreate only the text version with proper casting

  Run this in Supabase SQL Editor
*/

-- Drop both versions of the function
DROP FUNCTION IF EXISTS public.bulk_update_extension_stage(bigint[], public.extension_stage);
DROP FUNCTION IF EXISTS public.bulk_update_extension_stage(bigint[], text);

-- Recreate with text parameter and proper enum casting
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.bulk_update_extension_stage(bigint[], text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.bulk_update_extension_stage IS
  'Updates extension_stage for multiple engagements in a single transaction';

-- Verify only one version exists
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'bulk_update_extension_stage'
ORDER BY p.proname, arguments;
