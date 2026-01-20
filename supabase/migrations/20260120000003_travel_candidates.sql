-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1. TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS travel_candidates (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  candidate_id bigint NOT NULL,
  candidate_name text NOT NULL,
  email text,
  day_phone text,
  evening_phone text,
  cell_phone text,
  start_date date,
  end_date date,
  contract_status text, -- NEW, EXT, etc.
  facility text NOT NULL,
  margin bigint, -- stored as cents or raw number from Nova
  docs_due date,
  documents_missing integer DEFAULT 0,
  cleared_status text,
  first_day_info text,
  benefits_date date,
  recruiter text,
  am_ac text,
  cs text,
  cl text,
  alerts boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT uq_travel_candidate_facility UNIQUE (candidate_id, facility)
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_travel_candidates_name ON travel_candidates USING gin (candidate_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_travel_candidates_facility ON travel_candidates USING gin (facility gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_travel_candidates_candidate_id ON travel_candidates(candidate_id);

-- ============================================================================
-- 3. SECURITY
-- ============================================================================

ALTER TABLE travel_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to travel_candidates" ON travel_candidates FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

CREATE TRIGGER update_travel_candidates_updated_at BEFORE UPDATE ON travel_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. GRANTS
-- ============================================================================

GRANT ALL ON travel_candidates TO postgres, authenticated, anon, service_role;
