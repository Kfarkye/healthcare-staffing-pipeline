/*
  # Fix engagements table constraints

  1. Database Changes
    - Make specialty column nullable to allow prospects without specialty
    - Add unique constraint on job_id for upsert operations
    - Clean up duplicate entries before adding constraint

  2. Security
    - No changes to RLS policies needed
*/

-- First, clean up any duplicate job_id entries (keeping the most recent)
DELETE FROM engagements 
WHERE id NOT IN (
  SELECT DISTINCT ON (job_id) id 
  FROM engagements 
  WHERE job_id IS NOT NULL AND job_id != ''
  ORDER BY job_id, created_at DESC
);

-- Make specialty column nullable
ALTER TABLE engagements ALTER COLUMN specialty DROP NOT NULL;

-- Add unique constraint on job_id (excluding null and empty values)
CREATE UNIQUE INDEX engagements_job_id_unique 
ON engagements (job_id) 
WHERE job_id IS NOT NULL AND job_id != '';

-- Add the constraint using the index
ALTER TABLE engagements 
ADD CONSTRAINT engagements_job_id_key 
UNIQUE USING INDEX engagements_job_id_unique;