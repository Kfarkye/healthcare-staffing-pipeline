-- Simple: Create Engagements by Matching Prospects to Jobs
-- This assumes prospects and jobs were already imported via TSV
-- Run this in Supabase SQL Editor

BEGIN;

-- Create engagements by matching prospects to ANY available job
-- Since we may not have perfect job matching, we'll use the first available job per facility
INSERT INTO public.engagements (
    prospect_id,
    job_id,
    start_date,
    end_date,
    status,
    facility_name,
    specialty,
    extension_stage,
    is_looking_for_new_facility,
    is_exiting,
    notes,
    created_at,
    updated_at
)
SELECT DISTINCT ON (p.id)
    p.id AS prospect_id,
    j.id AS job_id,
    j.start_date,
    (j.start_date + (j.duration_weeks || ' weeks')::INTERVAL)::date AS end_date,
    'Active'::public.engagement_status_type AS status,
    f.name AS facility_name,
    j.specialty,
    'not_started' AS extension_stage,
    false AS is_looking_for_new_facility,
    false AS is_exiting,
    'Created from imported prospect/job data' AS notes,
    NOW() AS created_at,
    NOW() AS updated_at
FROM
    public.prospects p
JOIN
    public.jobs j ON j.status = 'Filled'
JOIN
    public.facilities f ON f.id = j.facility_id
WHERE
    p.status = 'Contacted'
    AND NOT EXISTS (
        SELECT 1 FROM public.engagements e WHERE e.prospect_id = p.id
    )
ORDER BY p.id, j.created_at DESC
ON CONFLICT (prospect_id, job_id) DO NOTHING;

-- Show results
DO $$
DECLARE
    total_engagements INTEGER;
    total_prospects INTEGER;
    created_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_prospects FROM public.prospects WHERE status = 'Contacted';
    SELECT COUNT(*) INTO total_engagements FROM public.engagements WHERE status = 'Active';
    SELECT COUNT(*) INTO created_count
    FROM public.prospects p
    WHERE p.status = 'Contacted'
    AND EXISTS (SELECT 1 FROM public.engagements e WHERE e.prospect_id = p.id);

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Engagement Creation Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total prospects (Contacted): %', total_prospects;
    RAISE NOTICE 'Prospects now with engagements: %', created_count;
    RAISE NOTICE 'Total active engagements: %', total_engagements;
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION: Check Active Assignments Dashboard
-- ============================================================================

SELECT
    candidate_name,
    facility_name,
    specialty,
    start_date,
    end_date,
    days_to_end,
    extension_stage,
    status
FROM public.active_assignments_dashboard
WHERE days_to_end IS NOT NULL
ORDER BY days_to_end
LIMIT 25;
