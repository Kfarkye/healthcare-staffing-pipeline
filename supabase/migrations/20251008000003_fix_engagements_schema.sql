/*
  # Fix Engagements Schema and Active Assignments View

  1. New Columns Added to Engagements
    - `facility_name` (text, nullable) - Name of the facility
    - `specialty` (text, nullable) - Job specialty
    - `bill_rate` (numeric, nullable) - Billing rate
    - `actual_margin` (numeric, nullable) - Actual margin percentage
    - `notes` (text, nullable) - General notes
    - `extension_stage` (text, default 'not_started') - Extension negotiation stage
    - `is_looking_for_new_facility` (boolean, default false) - Seeking new placement flag
    - `is_exiting` (boolean, default false) - Planning to exit flag

  2. Constraints
    - Check constraint for valid extension_stage values

  3. Indexes
    - Index on extension_stage for filtering

  4. View Recreation
    - Recreates active_assignments_dashboard view with correct schema
    - Joins engagements to prospects table (not candidates)
    - Filters for Active and Accepted engagements

  5. Notes
    - This migration reconciles the engagements table structure with the view expectations
    - Uses prospects table as the source for candidate information
*/

-- Add facility_name column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'facility_name'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN facility_name text;
  END IF;
END $$;

-- Add specialty column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'specialty'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN specialty text;
  END IF;
END $$;

-- Add bill_rate column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'bill_rate'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN bill_rate numeric(10,2);
  END IF;
END $$;

-- Add actual_margin column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'actual_margin'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN actual_margin numeric(5,2);
  END IF;
END $$;

-- Add notes column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN notes text;
  END IF;
END $$;

-- Add extension_stage column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'extension_stage'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN extension_stage text DEFAULT 'not_started' NOT NULL;
  END IF;
END $$;

-- Add check constraint for valid extension_stage values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'extension_stage_valid_values'
  ) THEN
    ALTER TABLE public.engagements
    ADD CONSTRAINT extension_stage_valid_values
    CHECK (extension_stage IN ('not_started', 'outreach', 'interested', 'requested', 'signed'));
  END IF;
END $$;

-- Add is_looking_for_new_facility column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'is_looking_for_new_facility'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN is_looking_for_new_facility boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add is_exiting column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'is_exiting'
  ) THEN
    ALTER TABLE public.engagements
    ADD COLUMN is_exiting boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Create index on extension_stage if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_engagements_extension_stage
  ON public.engagements(extension_stage);

-- Recreate the active_assignments_dashboard view with corrected schema
DROP VIEW IF EXISTS public.active_assignments_dashboard;

CREATE VIEW public.active_assignments_dashboard AS
SELECT
  COALESCE(c.id, p.candidate_id) AS candidate_id,
  e.id AS engagement_id,
  COALESCE(c.full_name, p.name) AS candidate_name,
  COALESCE(c.phone, p.phone) AS phone,
  COALESCE(c.email, p.email) AS email,
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
  e.status::text AS status,
  e.bill_rate,
  e.actual_margin,
  e.notes,
  e.extension_stage,
  e.is_looking_for_new_facility,
  e.is_exiting
FROM public.engagements e
LEFT JOIN public.prospects p ON p.id = e.prospect_id
LEFT JOIN public.candidates c ON c.id = p.candidate_id
WHERE e.status IN ('Active', 'Accepted');
