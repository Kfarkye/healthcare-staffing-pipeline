-- Check if the migration has been applied
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'facility_name'
  ) AS has_facility_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'extension_stage'
  ) AS has_extension_stage,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'notes'
  ) AS has_notes;

-- Also show all columns in engagements table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'engagements'
ORDER BY ordinal_position;
