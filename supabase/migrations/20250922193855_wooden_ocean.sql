/*
  # Add order column to prospects table

  1. Changes
    - Add `order` column to `prospects` table
    - Set default value to 0 for existing records
    - Make column nullable to handle existing data gracefully

  2. Purpose
    - Enable drag-and-drop reordering functionality in Kanban board
    - Fix Supabase request errors related to missing 'order' column
*/

-- Add order column to prospects table
ALTER TABLE prospects 
ADD COLUMN IF NOT EXISTS "order" integer DEFAULT 0;

-- Update existing records to have sequential order values within each status
WITH ordered_prospects AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at) - 1 as new_order
  FROM prospects
  WHERE "order" IS NULL
)
UPDATE prospects 
SET "order" = ordered_prospects.new_order
FROM ordered_prospects
WHERE prospects.id = ordered_prospects.id;