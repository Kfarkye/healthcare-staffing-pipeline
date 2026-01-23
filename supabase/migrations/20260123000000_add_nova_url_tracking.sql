-- Add nova_url tracking to additional tables
-- Created: 2026-01-23

-- 1. Add nova_url to travel_candidates
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='travel_candidates' AND column_name='nova_url') THEN
    ALTER TABLE travel_candidates ADD COLUMN nova_url TEXT;
  END IF;
END $$;

-- 2. Add nova_url to interested_clicks
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='interested_clicks' AND column_name='nova_url') THEN
    ALTER TABLE interested_clicks ADD COLUMN nova_url TEXT;
  END IF;
END $$;

-- 3. Ensure prospects has the column (it was in the initial migration but good to be safe)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='prospects' AND column_name='nova_url') THEN
    ALTER TABLE prospects ADD COLUMN nova_url TEXT;
  END IF;
END $$;
