-- Simplified Migration: Create Engagements from Existing Prospects and Jobs
--
-- ASSUMPTIONS:
-- 1. Prospects already exist in the database (imported from TSV)
-- 2. Jobs already exist in the database (imported from TSV)
-- 3. We just need to create the engagement records linking them
--
-- This approach is simpler and faster if you've already run the TSV import

BEGIN;

-- Create engagements for all prospects that have status 'Contacted'
-- This assumes the TSV import already created prospects and jobs
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
    created_at,
    updated_at
)
SELECT
    p.id AS prospect_id,
    -- Find a job that matches this prospect's details
    (
        SELECT j.id
        FROM public.jobs j
        JOIN public.facilities f ON f.id = j.facility_id
        WHERE f.name ILIKE '%' || COALESCE(p.city, '') || '%'
        OR j.start_date::date BETWEEN NOW() - INTERVAL '6 months' AND NOW() + INTERVAL '6 months'
        ORDER BY j.created_at DESC
        LIMIT 1
    ) AS job_id,
    -- Use reasonable defaults for dates if not available
    COALESCE(p.created_at::date, CURRENT_DATE) AS start_date,
    COALESCE(p.created_at::date + INTERVAL '13 weeks', CURRENT_DATE + INTERVAL '13 weeks')::date AS end_date,
    'Active'::public.engagement_status_type AS status,
    p.city AS facility_name,
    'RN' AS specialty,
    'not_started' AS extension_stage,
    false AS is_looking_for_new_facility,
    false AS is_exiting,
    NOW() AS created_at,
    NOW() AS updated_at
FROM
    public.prospects p
WHERE
    -- Only create engagements for prospects that don't have one yet
    p.status = 'Contacted'
    AND NOT EXISTS (
        SELECT 1
        FROM public.engagements e
        WHERE e.prospect_id = p.id
    )
    -- Make sure we found a valid job
    AND EXISTS (
        SELECT 1
        FROM public.jobs j
    )
ON CONFLICT (prospect_id, job_id) DO NOTHING;

-- Log results
DO $$
DECLARE
    engagement_count INTEGER;
    prospect_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO engagement_count FROM public.engagements;
    SELECT COUNT(*) INTO prospect_count FROM public.prospects WHERE status = 'Contacted';

    RAISE NOTICE 'Total engagements created: %', engagement_count;
    RAISE NOTICE 'Total prospects with status Contacted: %', prospect_count;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check the active assignments dashboard
-- SELECT * FROM public.active_assignments_dashboard ORDER BY days_to_end LIMIT 10;

-- Count engagements by status
-- SELECT status, COUNT(*) FROM public.engagements GROUP BY status;

-- Show prospects without engagements
-- SELECT p.id, p.name, p.status
-- FROM public.prospects p
-- WHERE NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.prospect_id = p.id)
-- LIMIT 10;
