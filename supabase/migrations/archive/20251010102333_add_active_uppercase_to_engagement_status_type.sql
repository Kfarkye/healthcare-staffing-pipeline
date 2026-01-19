/*
  # Add 'ACTIVE' (uppercase) to engagement_status_type enum

  1. Changes
    - Adds 'ACTIVE' value to engagement_status_type enum
    - Keeps existing 'Active' value for backward compatibility
  
  2. Notes
    - Fixes "invalid input value for enum engagement_status_type: ACTIVE" error
    - Safe to run multiple times
*/

-- Add ACTIVE (uppercase) if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ACTIVE'
        AND enumtypid = 'public.engagement_status_type'::regtype
    ) THEN
        ALTER TYPE public.engagement_status_type ADD VALUE 'ACTIVE';
    END IF;
END $$;
