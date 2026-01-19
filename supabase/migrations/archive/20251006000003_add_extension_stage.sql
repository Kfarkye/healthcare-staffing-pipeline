/*
  # Add extension_stage column to engagements table

  1. Changes
    - Add `extension_stage` column to `engagements` table
      - Type: text
      - Default: 'not_started'
      - Nullable: false
    - Add check constraint to ensure valid stage values
    - Update the active_assignments_dashboard view to include extension_stage

  2. Valid stages
    - not_started: Initial state, no outreach yet
    - outreach: Outreach attempted or in progress
    - interested: Candidate expressed interest
    - requested: Extension formally requested
    - signed: Extension contract signed

  3. Notes
    - This field tracks the stage of contract extension negotiations
    - Used by the Active Assignments Dashboard kanban board
*/

-- Add extension_stage column to engagements table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engagements' AND column_name = 'extension_stage'
  ) THEN
    ALTER TABLE engagements
    ADD COLUMN extension_stage text DEFAULT 'not_started' NOT NULL;
  END IF;
END $$;

-- Add check constraint for valid stage values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'extension_stage_valid_values'
  ) THEN
    ALTER TABLE engagements
    ADD CONSTRAINT extension_stage_valid_values
    CHECK (extension_stage IN ('not_started', 'outreach', 'interested', 'requested', 'signed'));
  END IF;
END $$;

-- Recreate the active_assignments_dashboard view to include extension_stage
DROP VIEW IF EXISTS public.active_assignments_dashboard;

CREATE VIEW public.active_assignments_dashboard AS
SELECT
  c.id AS candidate_id,
  e.id AS engagement_id,
  c.full_name AS candidate_name,
  c.phone,
  c.email,
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
  e.status,
  e.bill_rate,
  e.actual_margin,
  e.notes,
  e.extension_stage
FROM engagements e
LEFT JOIN candidates c ON c.id = e.candidate_id
WHERE e.status IN ('Active', 'Active - Extension Signed', 'Active - Seeking New');
