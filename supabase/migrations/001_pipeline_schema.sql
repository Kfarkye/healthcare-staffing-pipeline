-- ============================================================================
-- WEISSACH PIPELINE SCHEMA v1.0
-- The Candidate Web — every row is a URL, every FK is a link
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE NODES
-- ============================================================================

-- ── Candidates ──────────────────────────────────────────────────────────────
CREATE TABLE candidates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nova_id         TEXT UNIQUE,

    -- Identity
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    preferred_contact TEXT CHECK (preferred_contact IN ('phone', 'email', 'text')) DEFAULT 'phone',

    -- Clinical Profile
    specialty       TEXT NOT NULL,
    sub_specialty   TEXT,
    years_experience NUMERIC(4,1),
    profession      TEXT DEFAULT 'RN',

    -- Preferences
    preferred_locations TEXT[],
    preferred_shift TEXT,
    pay_floor       NUMERIC(10,2),
    housing_pref    TEXT CHECK (housing_pref IN ('stipend', 'company_housing', 'flexible')),
    travel_radius_miles INTEGER,

    -- Availability
    available_date  DATE,
    ldw             DATE,
    time_off_requests TEXT,

    -- Relationship Meta
    communication_style TEXT,
    action_close_rule TEXT DEFAULT 'always',
    notes_summary   TEXT,

    -- System
    source          TEXT DEFAULT 'manual',
    enriched_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidates_specialty ON candidates(specialty);
CREATE INDEX idx_candidates_nova_id ON candidates(nova_id);
CREATE INDEX idx_candidates_available ON candidates(available_date);
CREATE INDEX idx_candidates_ldw ON candidates(ldw);


-- ── Facilities ──────────────────────────────────────────────────────────────
CREATE TABLE facilities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    system_name     TEXT,
    city            TEXT NOT NULL,
    state           TEXT NOT NULL,
    zip             TEXT,

    -- Intel
    typical_rate_range_low  NUMERIC(10,2),
    typical_rate_range_high NUMERIC(10,2),
    requires_compact BOOLEAN DEFAULT FALSE,
    special_requirements TEXT[],
    vms_platform    TEXT,

    -- Relationship
    account_manager TEXT,
    am_email        TEXT,
    am_notes        TEXT,

    -- System
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_facilities_state ON facilities(state);
CREATE INDEX idx_facilities_system ON facilities(system_name);


-- ── Jobs ────────────────────────────────────────────────────────────────────
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id     UUID NOT NULL REFERENCES facilities(id),

    -- Details
    title           TEXT NOT NULL,
    specialty       TEXT NOT NULL,
    sub_specialty   TEXT,
    shift           TEXT,
    hours_per_week  NUMERIC(4,1) DEFAULT 36,
    guaranteed_hours BOOLEAN DEFAULT TRUE,

    -- Dates
    start_date      DATE,
    duration_weeks  INTEGER DEFAULT 13,

    -- Compensation
    bill_rate       NUMERIC(10,2),
    margin_target   NUMERIC(5,2),

    -- Status
    status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'filled', 'closed', 'on_hold', 'cancelled')),
    slots           INTEGER DEFAULT 1,
    slots_filled    INTEGER DEFAULT 0,

    -- System
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_facility ON jobs(facility_id);
CREATE INDEX idx_jobs_specialty ON jobs(specialty);
CREATE INDEX idx_jobs_status ON jobs(status);


-- ============================================================================
-- CONNECTION NODES
-- ============================================================================

-- ── Licenses ────────────────────────────────────────────────────────────────
CREATE TABLE licenses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

    state           TEXT NOT NULL,
    license_type    TEXT NOT NULL,
    license_number  TEXT,
    is_compact      BOOLEAN DEFAULT FALSE,
    expiration_date DATE,
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending', 'restricted')),
    verified_at     TIMESTAMPTZ,
    verification_source TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_licenses_candidate ON licenses(candidate_id);
CREATE INDEX idx_licenses_state ON licenses(state);


-- ── Certifications ──────────────────────────────────────────────────────────
CREATE TABLE certifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,
    issuer          TEXT,
    expiration_date DATE,
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending')),

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_certifications_candidate ON certifications(candidate_id);


-- ── Submittals ──────────────────────────────────────────────────────────────
CREATE TABLE submittals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES candidates(id),
    job_id          UUID NOT NULL REFERENCES jobs(id),
    facility_id     UUID NOT NULL REFERENCES facilities(id),

    -- Status Pipeline
    status          TEXT DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'under_review', 'interview_scheduled', 'interview_complete',
        'offer_pending', 'offer_extended', 'offer_accepted', 'offer_declined',
        'withdrawn', 'rejected', 'cancelled'
    )),

    -- Dates
    submitted_at    TIMESTAMPTZ DEFAULT NOW(),
    interview_date  TIMESTAMPTZ,
    offer_date      TIMESTAMPTZ,
    decision_date   TIMESTAMPTZ,

    -- Details
    rejection_reason TEXT,
    withdrawal_reason TEXT,
    am_feedback     TEXT,

    -- Competitive Intel
    competing_agencies TEXT[],

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_submittals_candidate ON submittals(candidate_id);
CREATE INDEX idx_submittals_job ON submittals(job_id);
CREATE INDEX idx_submittals_facility ON submittals(facility_id);
CREATE INDEX idx_submittals_status ON submittals(status);


-- ── Assignments ─────────────────────────────────────────────────────────────
CREATE TABLE assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES candidates(id),
    facility_id     UUID NOT NULL REFERENCES facilities(id),
    job_id          UUID REFERENCES jobs(id),
    submittal_id    UUID REFERENCES submittals(id),

    -- Contract
    start_date      DATE NOT NULL,
    end_date        DATE,
    extension_of    UUID REFERENCES assignments(id),

    -- Compensation
    weekly_gross    NUMERIC(10,2),
    hourly_rate     NUMERIC(10,2),
    stipend_weekly  NUMERIC(10,2),
    taxable_weekly  NUMERIC(10,2),
    overtime_rate   NUMERIC(10,2),
    callback_rate   NUMERIC(10,2),

    -- Status
    status          TEXT DEFAULT 'active' CHECK (status IN (
        'pending_start', 'active', 'completed', 'cancelled', 'terminated', 'extended'
    )),

    -- Outcome
    end_reason      TEXT CHECK (end_reason IN (
        'completed', 'extended', 'cancelled_by_facility', 'cancelled_by_traveler',
        'terminated_performance', 'terminated_attendance', 'terminated_other',
        'early_completion', NULL
    )),
    end_notes       TEXT,
    would_rehire    BOOLEAN,
    manager_feedback TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assignments_candidate ON assignments(candidate_id);
CREATE INDEX idx_assignments_facility ON assignments(facility_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_end_date ON assignments(end_date);


-- ── Pay Packages ────────────────────────────────────────────────────────────
CREATE TABLE pay_packages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES candidates(id),
    job_id          UUID REFERENCES jobs(id),
    facility_id     UUID REFERENCES facilities(id),

    -- Breakdown
    weekly_gross    NUMERIC(10,2) NOT NULL,
    hourly_rate     NUMERIC(10,2),
    stipend_weekly  NUMERIC(10,2),
    taxable_weekly  NUMERIC(10,2),
    meals_weekly    NUMERIC(10,2),
    travel_reimbursement NUMERIC(10,2),
    overtime_rate   NUMERIC(10,2),
    callback_rate   NUMERIC(10,2),

    -- Context
    status          TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected', 'countered', 'expired')),
    presented_at    TIMESTAMPTZ DEFAULT NOW(),
    response_at     TIMESTAMPTZ,
    candidate_feedback TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pay_packages_candidate ON pay_packages(candidate_id);


-- ── Contact Log ─────────────────────────────────────────────────────────────
CREATE TABLE contact_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES candidates(id),

    -- What happened
    channel         TEXT NOT NULL CHECK (channel IN ('phone', 'email', 'text', 'teams', 'voicemail', 'ringcentral')),
    direction       TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),

    -- Content
    subject         TEXT,
    body_preview    TEXT,
    duration_seconds INTEGER,

    -- Outcome
    outcome         TEXT CHECK (outcome IN (
        'connected', 'voicemail', 'no_answer', 'sent', 'received',
        'opened', 'replied', 'bounced', NULL
    )),

    -- Links
    related_job_id      UUID REFERENCES jobs(id),
    related_submittal_id UUID REFERENCES submittals(id),
    related_assignment_id UUID REFERENCES assignments(id),

    -- System
    source          TEXT DEFAULT 'manual',
    external_id     TEXT,
    contacted_at    TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contact_log_candidate ON contact_log(candidate_id);
CREATE INDEX idx_contact_log_contacted_at ON contact_log(contacted_at);
CREATE INDEX idx_contact_log_channel ON contact_log(channel);


-- ── Notes ───────────────────────────────────────────────────────────────────
CREATE TABLE notes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Polymorphic attachment — exactly one must be set
    candidate_id    UUID REFERENCES candidates(id),
    facility_id     UUID REFERENCES facilities(id),
    job_id          UUID REFERENCES jobs(id),
    submittal_id    UUID REFERENCES submittals(id),
    assignment_id   UUID REFERENCES assignments(id),

    content         TEXT NOT NULL,
    note_type       TEXT DEFAULT 'general' CHECK (note_type IN (
        'general', 'clinical', 'preference', 'red_flag', 'relationship', 'compliance'
    )),

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT notes_has_parent CHECK (
        candidate_id IS NOT NULL OR facility_id IS NOT NULL OR
        job_id IS NOT NULL OR submittal_id IS NOT NULL OR assignment_id IS NOT NULL
    )
);

CREATE INDEX idx_notes_candidate ON notes(candidate_id);
CREATE INDEX idx_notes_facility ON notes(facility_id);


-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_facilities_updated BEFORE UPDATE ON facilities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_submittals_updated BEFORE UPDATE ON submittals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_assignments_updated BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE submittals ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for API endpoints)
CREATE POLICY "service_role_all" ON candidates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON facilities FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON jobs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON licenses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON certifications FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON submittals FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON assignments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON pay_packages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON contact_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON notes FOR ALL USING (auth.role() = 'service_role');
