-- ============================================================================
-- WEISSACH PIPELINE SCHEMA
-- Rich, structured clinical pipeline data for the Weissach AI command center.
-- Tools are prefixed weissach_* in the application layer.
--
-- NOTE: Some table names (facilities, jobs, certifications, pay_packages)
-- overlap with the legacy schema. This migration uses CREATE TABLE IF NOT
-- EXISTS so it will not clobber existing tables. If the legacy tables exist
-- with a different column set, you must either drop them first or run this
-- migration against a clean database.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Enable trigram extension for fuzzy name search (idempotent)
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --------------------------------------------------------------------------
-- 1. candidates — Rich candidate profiles
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    email           text,
    phone           text,
    specialty       text NOT NULL,
    sub_specialty   text,
    profession      text,
    years_experience integer,
    available_date  date,
    home_state      text,
    preferred_locations text[],
    pay_floor       numeric,
    housing_pref    text,                       -- 'company' | 'stipend' | 'no_preference'
    communication_style text,                   -- 'direct' | 'nurturing' | 'data_driven'
    preferred_contact text DEFAULT 'email',     -- 'phone' | 'email' | 'text'
    nova_id         text,
    nova_url        text,
    recruiter       text,
    status          text DEFAULT 'active',
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_name ON candidates USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_candidates_specialty ON candidates (specialty);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates (status);

-- --------------------------------------------------------------------------
-- 2. facilities — Hospital/facility directory
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facilities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    system_name         text,
    city                text,
    state               text,
    trauma_level        text,
    bed_count           integer,
    special_requirements text,
    account_manager     text,
    min_bill_rate       numeric,
    max_bill_rate       numeric,
    notes               text,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facilities_name_trgm ON facilities USING gin (name gin_trgm_ops);

-- --------------------------------------------------------------------------
-- 3. jobs — Open job requisitions
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id     uuid REFERENCES facilities(id),
    title           text NOT NULL,
    specialty       text,
    bill_rate       numeric,
    margin_target   numeric,
    duration_weeks  integer,
    shift           text,
    hours_per_week  integer,
    start_date      date,
    status          text DEFAULT 'open',        -- 'open' | 'filled' | 'closed' | 'on_hold'
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4. licenses — Per-candidate, per-state license records
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS licenses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    state           text NOT NULL,
    license_number  text,
    is_compact      boolean DEFAULT false,
    expiration_date date,
    status          text DEFAULT 'active',      -- 'active' | 'expired' | 'pending' | 'revoked'
    verification    text,                        -- URL or verification notes
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_candidate ON licenses (candidate_id);
CREATE INDEX IF NOT EXISTS idx_licenses_state ON licenses (state);

-- --------------------------------------------------------------------------
-- 5. certifications — Per-candidate credentials
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    name            text NOT NULL,
    issuer          text,
    expiration_date date,
    status          text DEFAULT 'active',      -- 'active' | 'expired' | 'pending'
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certifications_candidate ON certifications (candidate_id);

-- --------------------------------------------------------------------------
-- 6. submittals — Candidate → Job → Facility pipeline
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submittals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    facility_id     uuid NOT NULL REFERENCES facilities(id),
    status          text NOT NULL DEFAULT 'submitted',
    -- Status progression: submitted → under_review → interview_scheduled →
    -- offer_pending → offer_extended → offer_accepted | offer_declined
    submitted_at    timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submittals_candidate ON submittals (candidate_id);
CREATE INDEX IF NOT EXISTS idx_submittals_status ON submittals (status);

-- --------------------------------------------------------------------------
-- 7. assignments — Active/completed contracts
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    facility_id     uuid NOT NULL REFERENCES facilities(id),
    job_id          uuid REFERENCES jobs(id),
    specialty       text,
    start_date      date,
    end_date        date,
    status          text DEFAULT 'active',      -- 'active' | 'completed' | 'terminated' | 'extended'
    bill_rate       numeric,
    pay_rate        numeric,
    stipend_weekly  numeric,
    gross_weekly    numeric,
    end_reason      text,
    would_rehire    boolean,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_candidate ON assignments (candidate_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments (status);

-- --------------------------------------------------------------------------
-- 8. pay_packages — Proposed pay packages with feedback
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_packages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id          uuid REFERENCES jobs(id),
    bill_rate       numeric,
    pay_rate        numeric,
    stipend_weekly  numeric,
    housing_weekly  numeric,
    meals_weekly    numeric,
    gross_weekly    numeric,
    candidate_feedback text,
    status          text DEFAULT 'proposed',    -- 'proposed' | 'accepted' | 'rejected' | 'countered'
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 9. contact_log — Every touchpoint with a candidate
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    channel         text NOT NULL,              -- 'phone' | 'email' | 'text' | 'teams' | 'voicemail' | 'ringcentral'
    direction       text NOT NULL,              -- 'outbound' | 'inbound'
    outcome         text,                        -- 'connected' | 'voicemail' | 'no_answer' | 'sent' | 'received' | 'opened' | 'replied' | 'bounced'
    subject         text,
    body_preview    text,
    related_job_id  uuid REFERENCES jobs(id),
    related_submittal_id uuid REFERENCES submittals(id),
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_log_candidate ON contact_log (candidate_id);
CREATE INDEX IF NOT EXISTS idx_contact_log_created ON contact_log (created_at DESC);

-- --------------------------------------------------------------------------
-- 10. notes — Polymorphic notes (attached to any entity)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    note_type       text NOT NULL DEFAULT 'general',
    -- note_type: 'general' | 'clinical' | 'preference' | 'red_flag' | 'relationship' | 'compliance'
    content         text NOT NULL,
    candidate_id    uuid REFERENCES candidates(id) ON DELETE CASCADE,
    facility_id     uuid REFERENCES facilities(id) ON DELETE CASCADE,
    job_id          uuid REFERENCES jobs(id) ON DELETE CASCADE,
    submittal_id    uuid REFERENCES submittals(id) ON DELETE CASCADE,
    assignment_id   uuid REFERENCES assignments(id) ON DELETE CASCADE,
    author_id       uuid,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_candidate ON notes (candidate_id);
CREATE INDEX IF NOT EXISTS idx_notes_facility ON notes (facility_id);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes (note_type);

-- --------------------------------------------------------------------------
-- RLS: Allow service role full access (tools use service_role key)
-- --------------------------------------------------------------------------
ALTER TABLE candidates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE submittals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_packages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes           ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON candidates      FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON facilities      FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON jobs            FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON licenses        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON certifications  FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON submittals      FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON assignments     FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON pay_packages    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON contact_log     FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "weissach_service_all" ON notes           FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
