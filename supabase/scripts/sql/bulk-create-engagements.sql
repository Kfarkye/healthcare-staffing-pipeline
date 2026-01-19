-- Bulk Create Engagements for Active Travelers
-- This script creates engagement records for all 87 imported travelers
-- Run this entire script in Supabase SQL Editor

BEGIN;

-- Show what we're starting with
DO $$
DECLARE
    prospect_count INTEGER;
    engagement_count_before INTEGER;
BEGIN
    SELECT COUNT(*) INTO prospect_count FROM public.prospects WHERE status = 'Contacted';
    SELECT COUNT(*) INTO engagement_count_before FROM public.engagements WHERE status = 'Active';

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting Import';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Prospects with status Contacted: %', prospect_count;
    RAISE NOTICE 'Existing active engagements: %', engagement_count_before;
    RAISE NOTICE '========================================';
END $$;

-- Create engagements for all prospects
-- Since we don't have job_id matching, we'll create a generic job per prospect
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
SELECT
    p.id AS prospect_id,
    -- Use any available job, or NULL (we'll handle this next)
    (SELECT j.id FROM public.jobs j LIMIT 1) AS job_id,
    -- Use created date as start, or current date
    COALESCE(p.created_at::date, CURRENT_DATE) AS start_date,
    -- End date is 13 weeks from start
    COALESCE(p.created_at::date + INTERVAL '13 weeks', CURRENT_DATE + INTERVAL '13 weeks')::date AS end_date,
    'Active'::public.engagement_status_type AS status,
    COALESCE(p.city, 'Unknown Facility') AS facility_name,
    'RN' AS specialty,
    'not_started' AS extension_stage,
    false AS is_looking_for_new_facility,
    false AS is_exiting,
    'Auto-created from imported prospect data' AS notes,
    NOW() AS created_at,
    NOW() AS updated_at
FROM
    public.prospects p
WHERE
    p.status = 'Contacted'
    -- Only create if engagement doesn't already exist
    AND NOT EXISTS (
        SELECT 1
        FROM public.engagements e
        WHERE e.prospect_id = p.id
    )
ON CONFLICT (prospect_id, job_id) DO NOTHING;

-- Show results
DO $$
DECLARE
    engagement_count_after INTEGER;
    prospect_count INTEGER;
    missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO engagement_count_after FROM public.engagements WHERE status = 'Active';
    SELECT COUNT(*) INTO prospect_count FROM public.prospects WHERE status = 'Contacted';
    SELECT COUNT(*) INTO missing_count
    FROM public.prospects p
    WHERE p.status = 'Contacted'
    AND NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.prospect_id = p.id);

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Import Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total active engagements: %', engagement_count_after;
    RAISE NOTICE 'Total prospects imported: %', prospect_count;
    RAISE NOTICE 'Prospects still missing engagements: %', missing_count;
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Uncomment and run these after the migration)
-- ============================================================================

-- View the active assignments dashboard
-- SELECT * FROM public.active_assignments_dashboard ORDER BY days_to_end LIMIT 20;

-- Count engagements by status
-- SELECT status, COUNT(*) FROM public.engagements GROUP BY status;

-- Find any prospects without engagements
-- SELECT p.id, p.name, p.candidate_id, p.status
-- FROM public.prospects p
-- WHERE p.status = 'Contacted'
-- AND NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.prospect_id = p.id)
-- ORDER BY p.created_at DESC;
