-- Baseline: Core recruiting schema
-- These tables were created via SQL editor before migration tracking.
-- This file captures the full schema as of 2026-02-14 for branch reproducibility.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Candidates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nova_id TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  preferred_contact TEXT DEFAULT 'phone',
  specialty TEXT NOT NULL,
  sub_specialty TEXT,
  years_experience NUMERIC,
  profession TEXT DEFAULT 'RN',
  preferred_locations TEXT[],
  preferred_shift TEXT,
  pay_floor NUMERIC,
  housing_pref TEXT,
  travel_radius_miles INTEGER,
  available_date DATE,
  ldw DATE,
  time_off_requests TEXT,
  communication_style TEXT,
  action_close_rule TEXT DEFAULT 'always',
  notes_summary TEXT,
  source TEXT DEFAULT 'manual',
  enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Facilities ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  system_name TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT,
  typical_rate_range_low NUMERIC,
  typical_rate_range_high NUMERIC,
  requires_compact BOOLEAN DEFAULT false,
  special_requirements TEXT[],
  vms_platform TEXT,
  account_manager TEXT,
  am_email TEXT,
  am_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Jobs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id),
  title TEXT NOT NULL,
  specialty TEXT NOT NULL,
  sub_specialty TEXT,
  shift TEXT,
  hours_per_week NUMERIC DEFAULT 36,
  guaranteed_hours BOOLEAN DEFAULT true,
  start_date DATE,
  duration_weeks INTEGER DEFAULT 13,
  bill_rate NUMERIC,
  margin_target NUMERIC,
  status TEXT DEFAULT 'open',
  slots INTEGER DEFAULT 1,
  slots_filled INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Licenses ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id),
  state TEXT NOT NULL,
  license_type TEXT NOT NULL,
  license_number TEXT,
  is_compact BOOLEAN DEFAULT false,
  expiration_date DATE,
  status TEXT DEFAULT 'active',
  verified_at TIMESTAMPTZ,
  verification_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Certifications ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id),
  name TEXT NOT NULL,
  issuer TEXT,
  expiration_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Submittals ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submittals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  facility_id UUID NOT NULL REFERENCES public.facilities(id),
  status TEXT DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  interview_date TIMESTAMPTZ,
  offer_date TIMESTAMPTZ,
  decision_date TIMESTAMPTZ,
  rejection_reason TEXT,
  withdrawal_reason TEXT,
  am_feedback TEXT,
  competing_agencies TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Assignments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id),
  facility_id UUID NOT NULL REFERENCES public.facilities(id),
  job_id UUID REFERENCES public.jobs(id),
  submittal_id UUID REFERENCES public.submittals(id),
  start_date DATE NOT NULL,
  end_date DATE,
  extension_of UUID REFERENCES public.assignments(id),
  weekly_gross NUMERIC,
  hourly_rate NUMERIC,
  stipend_weekly NUMERIC,
  taxable_weekly NUMERIC,
  overtime_rate NUMERIC,
  callback_rate NUMERIC,
  status TEXT DEFAULT 'active',
  end_reason TEXT,
  end_notes TEXT,
  would_rehire BOOLEAN,
  manager_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Notes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID REFERENCES public.candidates(id),
  facility_id UUID REFERENCES public.facilities(id),
  job_id UUID REFERENCES public.jobs(id),
  submittal_id UUID REFERENCES public.submittals(id),
  assignment_id UUID REFERENCES public.assignments(id),
  content TEXT NOT NULL,
  note_type TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Pay Packages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pay_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id),
  job_id UUID REFERENCES public.jobs(id),
  facility_id UUID REFERENCES public.facilities(id),
  weekly_gross NUMERIC NOT NULL,
  hourly_rate NUMERIC,
  stipend_weekly NUMERIC,
  taxable_weekly NUMERIC,
  meals_weekly NUMERIC,
  travel_reimbursement NUMERIC,
  overtime_rate NUMERIC,
  callback_rate NUMERIC,
  status TEXT DEFAULT 'proposed',
  presented_at TIMESTAMPTZ DEFAULT now(),
  response_at TIMESTAMPTZ,
  candidate_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Contact Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id),
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,
  duration_seconds INTEGER,
  outcome TEXT,
  related_job_id UUID REFERENCES public.jobs(id),
  related_submittal_id UUID REFERENCES public.submittals(id),
  related_assignment_id UUID REFERENCES public.assignments(id),
  source TEXT DEFAULT 'manual',
  external_id TEXT,
  contacted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Updated_at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_candidates BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at_facilities BEFORE UPDATE ON public.facilities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at_jobs BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at_submittals BEFORE UPDATE ON public.submittals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at_assignments BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ─────────────────────────────────────────────────
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.candidates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.facilities FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.jobs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.licenses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.certifications FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.submittals FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.assignments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.notes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.pay_packages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_all ON public.contact_log FOR ALL USING (auth.role() = 'service_role');
