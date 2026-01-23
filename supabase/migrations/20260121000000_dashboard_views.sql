-- Dashboards Views Restoration
-- Created: 2026-01-21
-- Purpose: Restore missing submittals_dashboard and prospects_dashboard views for unified pipeline tracking.

-- Drop existing views to allow column changes
DROP VIEW IF EXISTS public.submittals_dashboard CASCADE;
DROP VIEW IF EXISTS public.prospects_dashboard CASCADE;

-- 1. SUBMITTALS DASHBOARD VIEW
CREATE OR REPLACE VIEW public.submittals_dashboard AS
-- PROSPECTS IN SUBMITTAL CYCLE
SELECT
  p.candidate_id,
  p.id AS prospect_id,
  NULL::bigint AS engagement_id,
  NULL::bigint AS job_id,
  NULL::bigint AS facility_id,
  p.name AS full_name,
  p.email,
  p.phone,
  p.nova_url,
  p.specialty AS primary_specialty,
  NULL::text AS engagement_specialty,
  p.home_state,
  p.licenses,
  p.recruiter,
  p.available_start_date::text,
  p.profile_complete,
  p.references_verified,
  p.rto_notes,
  p.facility AS facility_name,
  NULL::text AS location_city,
  NULL::text AS location_state,
  p.status AS raw_status,
  NULL::text AS stage,
  CASE
    WHEN p.status = 'Submittal Ready' THEN 'READY'
    WHEN p.status = 'Submitted' THEN 'SUBMITTED'
    WHEN p.status = 'Offer Extended' THEN 'OFFER'
    WHEN p.status = 'Hired' THEN 'PRESTART'
    ELSE 'KANBAN'
  END AS tab,
  NULL::boolean AS is_current,
  p.created_at AS submitted_at,
  p.available_start_date::text AS start_date,
  NULL::date AS end_date,
  NULL::date AS contract_end_date,
  NULL::numeric AS bill_rate,
  NULL::numeric AS actual_margin,
  p.notes AS engagement_notes,
  NULL::boolean AS seeking_new,
  NULL::text AS am_name,
  NULL::text AS ac_name,
  NULL::text AS extension_stage,
  true AS is_active_submittal,
  COALESCE(p.is_weekly_priority, false) AS is_weekly_priority,
  'PROSPECTING'::text AS primary_state,
  NULL::text AS aging_bucket,
  EXTRACT(DAY FROM NOW() - p.created_at)::integer AS days_since_submitted,
  NULL::integer AS days_to_end,
  NULL::text AS end_bucket,
  0 AS other_engagements_count,
  1 AS stage_rank,
  'Prospect'::text AS source_type,
  p.updated_at
FROM
  public.prospects p
WHERE
  p.status IN ('Submittal Ready', 'Submitted', 'Offer Extended', 'Hired')

UNION ALL

-- ACTIVE ASSIGNMENTS IN EXTENSION/RETENTION
SELECT
  p.candidate_id,
  p.id AS prospect_id,
  e.id AS engagement_id,
  e.job_id,
  NULL::bigint AS facility_id,
  p.name AS full_name,
  p.email,
  p.phone,
  p.nova_url,
  p.specialty AS primary_specialty,
  e.specialty AS engagement_specialty,
  p.home_state,
  p.licenses,
  p.recruiter,
  p.available_start_date::text,
  p.profile_complete,
  p.references_verified,
  p.rto_notes,
  e.facility_name,
  NULL::text AS location_city,
  NULL::text AS location_state,
  e.status::text AS raw_status,
  e.status::text AS stage,
  CASE
    WHEN e.extension_stage = 'outreach' THEN 'READY'
    WHEN e.extension_stage = 'interested' THEN 'SUBMITTED'
    WHEN e.extension_stage = 'extension_approved' THEN 'OFFER'
    WHEN e.extension_stage = 'signed' THEN 'PRESTART'
    ELSE 'READY'
  END AS tab,
  true AS is_current,
  e.created_at AS submitted_at,
  e.start_date::text,
  e.end_date,
  e.end_date AS contract_end_date,
  e.bill_rate,
  e.actual_margin,
  e.notes AS engagement_notes,
  e.is_looking_for_new_facility AS seeking_new,
  NULL::text AS am_name,
  NULL::text AS ac_name,
  e.extension_stage,
  true AS is_active_submittal,
  COALESCE(e.is_weekly_priority, false) AS is_weekly_priority,
  'ACTIVE'::text AS primary_state,
  NULL::text AS aging_bucket,
  EXTRACT(DAY FROM NOW() - e.updated_at)::integer AS days_since_submitted,
  COALESCE(e.end_date - CURRENT_DATE, 999) AS days_to_end,
  NULL::text AS end_bucket,
  0 AS other_engagements_count,
  2 AS stage_rank,
  CASE 
    WHEN e.is_looking_for_new_facility THEN 'Retention'
    ELSE 'Extension'
  END AS source_type,
  e.updated_at
FROM
  public.engagements e
  JOIN public.prospects p ON e.prospect_id = p.id
WHERE
  e.extension_stage IS NOT NULL AND e.extension_stage != 'not_started';

-- 2. PROSPECTS DASHBOARD VIEW (Alias for prospects table with standardized naming)
CREATE OR REPLACE VIEW public.prospects_dashboard AS
SELECT
  p.candidate_id,
  p.id AS prospect_id,
  NULL::bigint AS engagement_id,
  p.name AS full_name,
  p.email,
  p.phone,
  p.nova_url,
  p.specialty AS primary_specialty,
  p.home_state,
  p.recruiter,
  p.status AS raw_status,
  COALESCE(p.is_weekly_priority, false) AS is_weekly_priority,
  p.updated_at,
  'Prospect'::text AS source_type
FROM
  public.prospects p;

-- 3. GRANTS
GRANT SELECT ON public.submittals_dashboard TO authenticated, anon, service_role;
GRANT SELECT ON public.prospects_dashboard TO authenticated, anon, service_role;

-- 4. ADD is_weekly_priority TO ENGAGEMENTS IF MISSING
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engagements' AND column_name='is_weekly_priority') THEN
    ALTER TABLE public.engagements ADD COLUMN is_weekly_priority boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='is_weekly_priority') THEN
    ALTER TABLE public.prospects ADD COLUMN is_weekly_priority boolean DEFAULT false;
  END IF;
END $$;
