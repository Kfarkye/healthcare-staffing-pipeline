/*
  # Add Unique Constraint for Engagements

  1. Changes
    - Add unique constraint on (prospect_id, job_id) combination
    - Prevents duplicate engagements when importing TSV data

  2. Notes
    - Uses DROP IF EXISTS to make migration idempotent
    - Allows upsert operations during TSV import
*/

-- Drop constraint if it exists (for idempotency)
ALTER TABLE public.engagements
DROP CONSTRAINT IF EXISTS engagements_prospect_job_unique;

-- Add unique constraint
ALTER TABLE public.engagements
ADD CONSTRAINT engagements_prospect_job_unique
UNIQUE (prospect_id, job_id);

COMMENT ON CONSTRAINT engagements_prospect_job_unique ON public.engagements IS
  'Prevents duplicate engagements for the same prospect and job combination';
