-- ============================================================================
-- FIX: prospects table + PostgREST schema cache
-- Paste this entire script into the Supabase SQL Editor and run it.
-- ============================================================================

-- Step 1: Check if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'prospects'
  ) THEN
    RAISE NOTICE '✅ prospects table EXISTS — schema cache reload needed';
  ELSE
    RAISE NOTICE '❌ prospects table MISSING — creating now';
  END IF;
END $$;

-- Step 2: Create the table if missing (idempotent)
CREATE TABLE IF NOT EXISTS prospects (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  candidate_id bigint UNIQUE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  specialty text,
  profession text,
  recruiter text,
  notes text,
  status text DEFAULT 'New',
  home_state text,
  licenses text[],
  references_verified integer DEFAULT 0,
  profile_complete boolean DEFAULT false,
  available_start_date date,
  rto_notes text,
  reassignment_requested_at timestamptz,
  "order" integer DEFAULT 0,
  nova_url text,
  facility text,
  followup_stage text,
  last_contacted_at timestamptz,
  engagement_level text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Step 3: Create the updated_at trigger function if missing
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Attach trigger to prospects (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'prospects'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON prospects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Step 5: Grant access to the service role (PostgREST needs this)
GRANT ALL ON prospects TO service_role;
GRANT ALL ON prospects TO authenticated;
GRANT SELECT ON prospects TO anon;

-- Step 6: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Step 7: Verify — should return the table
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'prospects';
