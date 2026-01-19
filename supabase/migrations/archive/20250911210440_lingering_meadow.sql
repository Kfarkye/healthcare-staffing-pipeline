/*
  # Make facility_name column nullable

  1. Schema Changes
    - Change `facility_name` column to allow NULL values
    - This allows prospect records to be created without facility information

  2. Notes
    - Prospects don't have associated facilities, so NULL values are appropriate
    - Existing NOT NULL constraint was preventing prospect creation
*/

-- Make facility_name column nullable
ALTER TABLE engagements ALTER COLUMN facility_name DROP NOT NULL;