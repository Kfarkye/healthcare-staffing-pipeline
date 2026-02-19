-- ============================================================================
-- WEISSACH PIPELINE SCHEMA
-- Rich, structured clinical pipeline data for the Weissach AI command center.
-- Coexists with the legacy "prospects" schema. Tools are prefixed weissach_*.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. w_candidates — Rich candidate profiles
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_candidates (
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

CREATE INDEX IF NOT EXISTS idx_w_candidates_name ON w_candidates USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_w_candidates_specialty ON w_candidates (specialty);
CREATE INDEX IF NOT EXISTS idx_w_candidates_status ON w_candidates (status);

-- --------------------------------------------------------------------------
-- 2. w_facilities — Hospital/facility directory
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_facilities (
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

CREATE INDEX IF NOT EXISTS idx_w_facilities_name ON w_facilities USING gin (name gin_trgm_ops);

-- --------------------------------------------------------------------------
-- 3. w_jobs — Open job requisitions
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id     uuid REFERENCES w_facilities(id),
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
-- 4. w_licenses — Per-candidate, per-state license records
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_licenses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES w_candidates(id) ON DELETE CASCADE,
    state           text NOT NULL,
    license_number  text,
    is_compact      boolean DEFAULT false,
    expiration_date date,
    status          text DEFAULT 'active',      -- 'active' | 'expired' | 'pending' | 'revoked'
    verification    text,                        -- URL or verification notes
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_w_licenses_candidate ON w_licenses (candidate_id);
CREATE INDEX IF NOT EXISTS idx_w_licenses_state ON w_licenses (state);

-- --------------------------------------------------------------------------
-- 5. w_certifications — Per-candidate credentials
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_certifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES w_candidates(id) ON DELETE CASCADE,
    name            text NOT NULL,
    issuer          text,
    expiration_date date,
    status          text DEFAULT 'active',      -- 'active' | 'expired' | 'pending'
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_w_certifications_candidate ON w_certifications (candidate_id);

-- --------------------------------------------------------------------------
-- 6. w_submittals — Candidate → Job → Facility pipeline
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_submittals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES w_candidates(id) ON DELETE CASCADE,
    job_id          uuid NOT NULL REFERENCES w_jobs(id) ON DELETE CASCADE,
    facility_id     uuid NOT NULL REFERENCES w_facilities(id),
    status          text NOT NULL DEFAULT 'submitted',
    -- Status progression: submitted → under_review → interview_scheduled →
    -- offer_pending → offer_extended → offer_accepted | offer_declined
    submitted_at    timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_w_submittals_candidate ON w_submittals (candidate_id);
CREATE INDEX IF NOT EXISTS idx_w_submittals_status ON w_submittals (status);

-- --------------------------------------------------------------------------
-- 7. w_assignments — Active/completed contracts
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES w_candidates(id) ON DELETE CASCADE,
    facility_id     uuid NOT NULL REFERENCES w_facilities(id),
    job_id          uuid REFERENCES w_jobs(id),
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

CREATE INDEX IF NOT EXISTS idx_w_assignments_candidate ON w_assignments (candidate_id);
CREATE INDEX IF NOT EXISTS idx_w_assignments_status ON w_assignments (status);

-- --------------------------------------------------------------------------
-- 8. w_pay_packages — Proposed pay packages with feedback
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_pay_packages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES w_candidates(id) ON DELETE CASCADE,
    job_id          uuid REFERENCES w_jobs(id),
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
-- 9. w_contact_log — Every touchpoint with a candidate
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_contact_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES w_candidates(id) ON DELETE CASCADE,
    channel         text NOT NULL,              -- 'phone' | 'email' | 'text' | 'teams' | 'voicemail' | 'ringcentral'
    direction       text NOT NULL,              -- 'outbound' | 'inbound'
    outcome         text,                        -- 'connected' | 'voicemail' | 'no_answer' | 'sent' | 'received' | 'opened' | 'replied' | 'bounced'
    subject         text,
    body_preview    text,
    related_job_id  uuid REFERENCES w_jobs(id),
    related_submittal_id uuid REFERENCES w_submittals(id),
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_w_contact_log_candidate ON w_contact_log (candidate_id);
CREATE INDEX IF NOT EXISTS idx_w_contact_log_created ON w_contact_log (created_at DESC);

-- --------------------------------------------------------------------------
-- 10. w_notes — Polymorphic notes (attached to any entity)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS w_notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    note_type       text NOT NULL DEFAULT 'general',
    -- note_type: 'general' | 'clinical' | 'preference' | 'red_flag' | 'relationship' | 'compliance'
    content         text NOT NULL,
    candidate_id    uuid REFERENCES w_candidates(id) ON DELETE CASCADE,
    facility_id     uuid REFERENCES w_facilities(id) ON DELETE CASCADE,
    job_id          uuid REFERENCES w_jobs(id) ON DELETE CASCADE,
    submittal_id    uuid REFERENCES w_submittals(id) ON DELETE CASCADE,
    assignment_id   uuid REFERENCES w_assignments(id) ON DELETE CASCADE,
    author_id       uuid,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_w_notes_candidate ON w_notes (candidate_id);
CREATE INDEX IF NOT EXISTS idx_w_notes_facility ON w_notes (facility_id);
CREATE INDEX IF NOT EXISTS idx_w_notes_type ON w_notes (note_type);

-- --------------------------------------------------------------------------
-- Enable trigram extension for fuzzy name search (idempotent)
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --------------------------------------------------------------------------
-- RLS: Allow service role full access (tools use service_role key)
-- --------------------------------------------------------------------------
ALTER TABLE w_candidates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_facilities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_licenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_certifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_submittals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_pay_packages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_contact_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE w_notes           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON w_candidates      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_facilities      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_jobs            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_licenses        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_certifications  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_submittals      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_assignments     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_pay_packages    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_contact_log     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON w_notes           FOR ALL USING (true) WITH CHECK (true);
