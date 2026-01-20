-- Phase 5: Certifications and Negotiation Tracking
-- Created: 2026-01-20

-- 1. Create Certifications Table
CREATE TABLE IF NOT EXISTS certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id bigint NOT NULL REFERENCES prospects(candidate_id) ON DELETE CASCADE,
  cert_name text NOT NULL, -- e.g., 'CER', 'CRCST', 'CIS', 'BLS'
  hspa_id text,
  issued_at date,
  expires_at date,
  is_verified boolean DEFAULT false,
  verification_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Expand Prospects for Negotiation & Diamond Status
ALTER TABLE prospects 
ADD COLUMN IF NOT EXISTS target_gross numeric(10, 2),
ADD COLUMN IF NOT EXISTS target_take_home numeric(10, 2),
ADD COLUMN IF NOT EXISTS is_diamond_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rto_requested boolean DEFAULT false;

-- 3. Add Activity Logging for Negotiations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE activity_type AS ENUM ('Status Change', 'Negotiation', 'Cert Upload', 'Note');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS candidate_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id bigint NOT NULL REFERENCES prospects(candidate_id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  content text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 4. Triggers for updated_at
CREATE TRIGGER update_certifications_updated_at 
BEFORE UPDATE ON certifications 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS Policies
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to certifications" ON certifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to candidate_activities" ON candidate_activities FOR ALL USING (true) WITH CHECK (true);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_certs_candidate_id ON certifications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_activities_candidate_id ON candidate_activities(candidate_id);
