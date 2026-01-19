/*
  # Base Tables and Follow-Up System
  
  Creates essential tables for healthcare staffing platform including
  prospects and a comprehensive follow-up tracking system.
  
  ## New Tables
  
  ### `prospects`
  Main candidate/prospect tracking
  - `id` (bigint, primary key) - Auto-incrementing ID
  - `candidate_id` (bigint, unique) - External candidate reference
  - `name` (text) - Candidate full name
  - `email` (text) - Contact email
  - `phone` (text) - Contact phone
  - `specialty` (text) - Medical specialty
  - `profession` (text) - Professional title
  - `recruiter` (text) - Assigned recruiter email
  - `status` (text) - Current pipeline status
  - Various other tracking fields
  
  ### `follow_ups`
  Follow-up tracking for recruiters
  - `id` (uuid, primary key) - Unique identifier
  - `candidate_id` (bigint) - References prospects
  - `recruiter_id` (uuid) - References auth.users
  - `follow_up_type` (text) - 'active' or 'rotation'
  - `scheduled_date` (date) - When follow-up is due
  - `completed` (boolean) - Completion status
  - `notes` (text) - Follow-up notes
  
  ## Views
  
  ### `follow_ups_dashboard`
  Enriched view with candidate and recruiter details
  
  ## Functions (RPCs)
  
  - `get_follow_ups_by_recruiter(uuid)` - Get all follow-ups for a recruiter
  - `complete_follow_up(uuid)` - Mark follow-up as completed
  - `reschedule_follow_up(uuid, date)` - Change follow-up date
  - `create_follow_up(...)` - Create new follow-up
  
  ## Security
  
  - RLS enabled on all tables
  - Prospects: Open access for authenticated/anon (for now)
  - Follow-ups: Strict recruiter-only access via auth.uid()
  
  ## Indexes
  
  - Optimized for date-based and recruiter-based queries
  - Fast candidate lookups
*/

-- ============================================================================
-- PROSPECTS TABLE
-- ============================================================================

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

-- Enable RLS
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prospects (permissive for now)
CREATE POLICY "Authenticated users can read prospects"
  ON prospects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can read prospects"
  ON prospects FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can insert prospects"
  ON prospects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update prospects"
  ON prospects FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete prospects"
  ON prospects FOR DELETE
  TO authenticated
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prospects_candidate_id ON prospects(candidate_id);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_recruiter ON prospects(recruiter);
CREATE INDEX IF NOT EXISTS idx_prospects_specialty ON prospects(specialty);

-- ============================================================================
-- FOLLOW_UPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id bigint NOT NULL,
  recruiter_id uuid NOT NULL,
  follow_up_type text NOT NULL CHECK (follow_up_type IN ('active', 'rotation')),
  scheduled_date date NOT NULL,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_candidate FOREIGN KEY (candidate_id) REFERENCES prospects(candidate_id) ON DELETE CASCADE,
  CONSTRAINT fk_recruiter FOREIGN KEY (recruiter_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Strict recruiter-only access
CREATE POLICY "Recruiters can view own follow-ups"
  ON follow_ups FOR SELECT
  TO authenticated
  USING (auth.uid() = recruiter_id);

CREATE POLICY "Recruiters can create own follow-ups"
  ON follow_ups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = recruiter_id);

CREATE POLICY "Recruiters can update own follow-ups"
  ON follow_ups FOR UPDATE
  TO authenticated
  USING (auth.uid() = recruiter_id)
  WITH CHECK (auth.uid() = recruiter_id);

CREATE POLICY "Recruiters can delete own follow-ups"
  ON follow_ups FOR DELETE
  TO authenticated
  USING (auth.uid() = recruiter_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_follow_ups_date ON follow_ups(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_candidate ON follow_ups(candidate_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_recruiter ON follow_ups(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_completed ON follow_ups(completed, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_type ON follow_ups(follow_up_type);

-- ============================================================================
-- FOLLOW_UPS_DASHBOARD VIEW
-- ============================================================================

CREATE OR REPLACE VIEW follow_ups_dashboard AS
SELECT 
  f.id,
  f.candidate_id,
  f.recruiter_id,
  f.follow_up_type,
  f.scheduled_date,
  f.completed,
  f.completed_at,
  f.notes,
  f.created_at,
  f.updated_at,
  p.name AS candidate_name,
  p.email AS candidate_email,
  p.phone AS candidate_phone,
  p.specialty AS candidate_specialty,
  p.profession AS candidate_profession,
  p.status AS candidate_status,
  p.nova_url AS candidate_nova_url,
  u.email AS recruiter_email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email) AS recruiter_name
FROM follow_ups f
JOIN prospects p ON f.candidate_id = p.candidate_id
JOIN auth.users u ON f.recruiter_id = u.id;

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- Get all follow-ups for a specific recruiter
CREATE OR REPLACE FUNCTION get_follow_ups_by_recruiter(recruiter_uuid uuid)
RETURNS TABLE (
  id uuid,
  candidate_id bigint,
  recruiter_id uuid,
  follow_up_type text,
  scheduled_date date,
  completed boolean,
  completed_at timestamptz,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  candidate_name text,
  candidate_email text,
  candidate_phone text,
  candidate_specialty text,
  candidate_profession text,
  candidate_status text,
  candidate_nova_url text,
  recruiter_email text,
  recruiter_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM follow_ups_dashboard
  WHERE recruiter_id = recruiter_uuid
  ORDER BY scheduled_date ASC, created_at DESC;
$$;

-- Complete a follow-up
CREATE OR REPLACE FUNCTION complete_follow_up(follow_up_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_row follow_ups;
BEGIN
  UPDATE follow_ups
  SET 
    completed = true,
    completed_at = now(),
    updated_at = now()
  WHERE id = follow_up_uuid
    AND recruiter_id = auth.uid()
  RETURNING * INTO result_row;
  
  IF result_row IS NULL THEN
    RAISE EXCEPTION 'Follow-up not found or access denied';
  END IF;
  
  RETURN row_to_json(result_row);
END;
$$;

-- Reschedule a follow-up
CREATE OR REPLACE FUNCTION reschedule_follow_up(follow_up_uuid uuid, new_date date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_row follow_ups;
BEGIN
  UPDATE follow_ups
  SET 
    scheduled_date = new_date,
    updated_at = now()
  WHERE id = follow_up_uuid
    AND recruiter_id = auth.uid()
  RETURNING * INTO result_row;
  
  IF result_row IS NULL THEN
    RAISE EXCEPTION 'Follow-up not found or access denied';
  END IF;
  
  RETURN row_to_json(result_row);
END;
$$;

-- Create a new follow-up
CREATE OR REPLACE FUNCTION create_follow_up(
  p_candidate_id bigint,
  p_follow_up_type text,
  p_scheduled_date date,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_row follow_ups;
BEGIN
  INSERT INTO follow_ups (
    candidate_id,
    recruiter_id,
    follow_up_type,
    scheduled_date,
    notes
  ) VALUES (
    p_candidate_id,
    auth.uid(),
    p_follow_up_type,
    p_scheduled_date,
    p_notes
  )
  RETURNING * INTO result_row;
  
  RETURN row_to_json(result_row);
END;
$$;

-- ============================================================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON prospects TO authenticated, anon;
GRANT USAGE ON SEQUENCE prospects_id_seq TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON follow_ups TO authenticated;
GRANT SELECT ON follow_ups_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_follow_ups_by_recruiter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_follow_up(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reschedule_follow_up(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION create_follow_up(bigint, text, date, text) TO authenticated;
