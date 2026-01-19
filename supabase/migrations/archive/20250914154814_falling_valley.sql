/*
  # Add facility column to prospects table

  1. Changes
    - Add `facility` column to `prospects` table
    - Column type: text (nullable)
    - This resolves the schema mismatch error where the application expects a 'facility' column

  2. Security
    - No RLS changes needed as the table already has appropriate policies
*/

-- Add facility column to prospects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prospects' AND column_name = 'facility'
  ) THEN
    ALTER TABLE prospects ADD COLUMN facility text;
  END IF;
END $$;