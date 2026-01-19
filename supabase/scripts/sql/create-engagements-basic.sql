-- Create Engagements for Imported Prospects (Basic Schema)
-- This works with the BASIC engagements schema (only core columns)
-- Run this in Supabase SQL Editor

BEGIN;

-- Show starting state
DO $$
DECLARE
    prospect_count INTEGER;
    job_count INTEGER;
    engagement_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO prospect_count FROM public.prospects WHERE status = 'Contacted';
    SELECT COUNT(*) INTO job_count FROM public.jobs;
    SELECT COUNT(*) INTO engagement_count FROM public.engagements;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting State';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Prospects (Contacted): %', prospect_count;
    RAISE NOTICE 'Jobs in database: %', job_count;
    RAISE NOTICE 'Existing engagements: %', engagement_count;
    RAISE NOTICE '========================================';
END $$;

-- Create engagements with ONLY the basic columns
INSERT INTO public.engagements (
    prospect_id,
    job_id,
    status,
    start_date,
    end_date,
    created_at,
    updated_at
)
SELECT DISTINCT ON (p.id)
    p.id AS prospect_id,
    j.id AS job_id,
    'Active'::public.engagement_status_type AS status,
    COALESCE(j.start_date, CURRENT_DATE) AS start_date,
    COALESCE(
        (j.start_date + (j.duration_weeks || ' weeks')::INTERVAL)::date,
        (CURRENT_DATE + INTERVAL '13 weeks')::date
    ) AS end_date,
    NOW() AS created_at,
    NOW() AS updated_at
FROM
    public.prospects p
CROSS JOIN
    public.jobs j
WHERE
    p.status = 'Contacted'
    AND j.status = 'Filled'
    AND NOT EXISTS (
        SELECT 1 FROM public.engagements e WHERE e.prospect_id = p.id
    )
ORDER BY p.id, j.created_at DESC
ON CONFLICT (prospect_id, job_id) DO NOTHING;

-- Show results
DO $$
DECLARE
    prospect_count INTEGER;
    created_count INTEGER;
    total_engagements INTEGER;
    missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO prospect_count FROM public.prospects WHERE status = 'Contacted';
    SELECT COUNT(*) INTO total_engagements FROM public.engagements WHERE status = 'Active';
    SELECT COUNT(*) INTO created_count
    FROM public.prospects p
    WHERE p.status = 'Contacted'
    AND EXISTS (SELECT 1 FROM public.engagements e WHERE e.prospect_id = p.id);
    
    missing_count := prospect_count - created_count;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Engagement Creation Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total prospects (Contacted): %', prospect_count;
    RAISE NOTICE 'Prospects with engagements: %', created_count;
    RAISE NOTICE 'Prospects still missing: %', missing_count;
    RAISE NOTICE 'Total active engagements: %', total_engagements;
    RAISE NOTICE '========================================';
    
    IF missing_count > 0 THEN
        RAISE NOTICE 'WARNING: % prospects do not have engagements!', missing_count;
        RAISE NOTICE 'This likely means there are no jobs in the database.';
        RAISE NOTICE 'Check: SELECT COUNT(*) FROM public.jobs;';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check active assignments (this might fail if view expects extra columns)
-- SELECT * FROM public.active_assignments_dashboard ORDER BY end_date LIMIT 10;

-- Check engagements directly
SELECT
    e.id,
    p.name AS prospect_name,
    p.candidate_id,
    e.status,
    e.start_date,
    e.end_date,
    e.end_date - CURRENT_DATE AS days_to_end
FROM public.engagements e
JOIN public.prospects p ON p.id = e.prospect_id
WHERE e.status = 'Active'
ORDER BY e.end_date
LIMIT 25;
