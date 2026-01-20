-- Fix set_extension_dates RPC for dual-table support
-- Created: 2026-01-20
-- Purpose: Allow saving extension dates for both native and imported candidates.

DROP FUNCTION IF EXISTS public.set_extension_dates(bigint, date, date);

CREATE OR REPLACE FUNCTION public.set_extension_dates(
  assignment_id_param bigint,
  new_start_date date,
  new_end_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Native engagements (ids < 10,000,000)
  IF assignment_id_param < 10000000 THEN
    UPDATE public.engagements
    SET 
      start_date = new_start_date,
      end_date = new_end_date,
      updated_at = NOW()
    WHERE id = assignment_id_param;
  
  -- Imported travel candidates (ids >= 10,000,000)
  ELSE
    UPDATE public.travel_candidates
    SET 
      start_date = new_start_date,
      end_date = new_end_date,
      updated_at = NOW()
    WHERE (id + 10000000) = assignment_id_param;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_extension_dates IS 
  'Updates start and end dates for a specific assignment, supporting both native engagements and imported travel candidates via synthetic ID offsets.';
