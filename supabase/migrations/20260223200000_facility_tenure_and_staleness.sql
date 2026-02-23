-- ============================================================================
-- Migration: Facility tenure + stale prospect detection
--
-- Adds:
--   1. facility_start_date column — authoritative tenure anchor
--   2. years_at_facility() computed function — no client-side guessing
--   3. stale_prospects view — pre-computed "ready to re-engage" list
--   4. specialty normalization — canonical enum-like constraint
--
-- The LLM reads years_at_facility from the API, not from its memory.
-- The "3-year itch" trigger is a server-side computation, not a model guess.
-- ============================================================================

-- ── 1. Add facility tenure anchor ───────────────────────────────────────────

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS facility_start_date date NULL;

COMMENT ON COLUMN prospects.facility_start_date
  IS 'Date the candidate started at current_facility. Used to compute years_at_facility server-side.';

-- ── 2. Server-computed years_at_facility ────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_years_at_facility(p_prospect_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN facility_start_date IS NULL THEN NULL
      ELSE ROUND(
        EXTRACT(EPOCH FROM (now() - facility_start_date::timestamptz)) / (365.25 * 86400),
        1
      )
    END
  FROM prospects
  WHERE id = p_prospect_id;
$$;

COMMENT ON FUNCTION compute_years_at_facility
  IS 'Returns years at current facility as a decimal (e.g. 3.2). NULL if facility_start_date unknown.';

-- ── 3. Stale prospects view ─────────────────────────────────────────────────
-- "Stale" = status is actionable AND last contact was too long ago (or never)
-- The LLM search_prospects tool uses stale_after_days to hit this logic.

CREATE OR REPLACE VIEW stale_prospects AS
SELECT
  p.id,
  p.candidate_id,
  p.name,
  p.specialty,
  p.facility AS current_facility,
  p.status,
  p.last_contacted_at,
  p.facility_start_date,
  compute_years_at_facility(p.id) AS years_at_facility,
  CASE
    WHEN p.last_contacted_at IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM now() - p.last_contacted_at)::integer
  END AS days_since_contact,
  CASE
    -- 3-year itch: at facility >= 2.8 years, passive/active, stale >= 14 days
    WHEN compute_years_at_facility(p.id) >= 2.8
      AND p.status IN ('New', 'Contacted', 'Interested')
      AND (p.last_contacted_at IS NULL OR p.last_contacted_at < now() - interval '14 days')
    THEN 'THREE_YEAR_ITCH'
    -- General stale: any actionable status, no contact in 7+ days
    WHEN p.status IN ('New', 'Contacted', 'Interested', 'Profile Updates')
      AND (p.last_contacted_at IS NULL OR p.last_contacted_at < now() - interval '7 days')
    THEN 'GENERAL_STALE'
    ELSE NULL
  END AS stale_trigger
FROM prospects p
WHERE p.status NOT IN ('Submitted', 'Exited');

COMMENT ON VIEW stale_prospects
  IS 'Pre-computed list of prospects eligible for re-engagement. Used by the AI grounding layer.';

-- ── 4. Specialty normalization ──────────────────────────────────────────────
-- We don't enforce a Postgres enum (too rigid for migration), but we provide
-- a canonical lookup table that the API validates against.

CREATE TABLE IF NOT EXISTS specialty_catalog (
  code     text PRIMARY KEY,          -- e.g. 'ICU_RN', 'OR_RN', 'PT', 'OT'
  label    text NOT NULL,             -- e.g. 'ICU Registered Nurse'
  family   text NOT NULL,             -- e.g. 'RN', 'Allied', 'Therapy'
  active   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE specialty_catalog
  IS 'Canonical specialty codes. API validates specialty input against this table.';

-- Seed the most common specialties
INSERT INTO specialty_catalog (code, label, family) VALUES
  ('ICU_RN', 'ICU Registered Nurse', 'RN'),
  ('ER_RN', 'Emergency Room RN', 'RN'),
  ('OR_RN', 'Operating Room RN', 'RN'),
  ('MED_SURG_RN', 'Med-Surg RN', 'RN'),
  ('TELE_RN', 'Telemetry RN', 'RN'),
  ('L_AND_D_RN', 'Labor & Delivery RN', 'RN'),
  ('NICU_RN', 'NICU RN', 'RN'),
  ('PICU_RN', 'PICU RN', 'RN'),
  ('PACU_RN', 'PACU RN', 'RN'),
  ('CATH_LAB_RN', 'Cath Lab RN', 'RN'),
  ('ENDO_RN', 'Endoscopy RN', 'RN'),
  ('DIALYSIS_RN', 'Dialysis RN', 'RN'),
  ('PSYCH_RN', 'Psychiatric RN', 'RN'),
  ('REHAB_RN', 'Rehab RN', 'RN'),
  ('STEPDOWN_RN', 'Stepdown RN', 'RN'),
  ('FLOAT_RN', 'Float Pool RN', 'RN'),
  ('HOME_HEALTH_RN', 'Home Health RN', 'RN'),
  ('LPN', 'Licensed Practical Nurse', 'LPN'),
  ('CNA', 'Certified Nursing Assistant', 'CNA'),
  ('PT', 'Physical Therapist', 'Therapy'),
  ('OT', 'Occupational Therapist', 'Therapy'),
  ('SLP', 'Speech-Language Pathologist', 'Therapy'),
  ('PTA', 'Physical Therapist Assistant', 'Therapy'),
  ('COTA', 'Certified OT Assistant', 'Therapy'),
  ('RRT', 'Registered Respiratory Therapist', 'Allied'),
  ('MLT', 'Medical Lab Technician', 'Allied'),
  ('MLS', 'Medical Lab Scientist', 'Allied'),
  ('RAD_TECH', 'Radiologic Technologist', 'Allied'),
  ('CT_TECH', 'CT Technologist', 'Allied'),
  ('MRI_TECH', 'MRI Technologist', 'Allied'),
  ('ULTRASOUND_TECH', 'Ultrasound Technologist', 'Allied'),
  ('SURG_TECH', 'Surgical Technologist', 'Allied'),
  ('PHARM_TECH', 'Pharmacy Technician', 'Allied'),
  ('PERFUSIONIST', 'Perfusionist', 'Allied'),
  ('DIETITIAN', 'Registered Dietitian', 'Allied'),
  ('SOCIAL_WORKER', 'Licensed Clinical Social Worker', 'Allied')
ON CONFLICT (code) DO NOTHING;

-- RLS
ALTER TABLE specialty_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_access"
  ON specialty_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service_role_full_access"
  ON specialty_catalog FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── 5. Index for stale queries ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_prospects_last_contacted_status
  ON prospects(last_contacted_at, status)
  WHERE status NOT IN ('Submitted', 'Exited');

CREATE INDEX IF NOT EXISTS idx_prospects_facility_start_date
  ON prospects(facility_start_date)
  WHERE facility_start_date IS NOT NULL;

-- Grants
GRANT SELECT ON stale_prospects TO authenticated, service_role;
GRANT SELECT ON specialty_catalog TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON specialty_catalog TO service_role;
GRANT EXECUTE ON FUNCTION compute_years_at_facility TO authenticated, service_role;
