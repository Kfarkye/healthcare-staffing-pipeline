-- Backfill Active Assignments from Imported Prospects
-- Populates the active_assignments table with your 87 travelers

BEGIN;

-- Show current state
DO $$
DECLARE
    prospect_count INTEGER;
    assignment_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO prospect_count FROM public.prospects WHERE status = 'Contacted';
    SELECT COUNT(*) INTO assignment_count FROM public.active_assignments;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting Backfill';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Prospects (status=Contacted): %', prospect_count;
    RAISE NOTICE 'Existing active_assignments: %', assignment_count;
    RAISE NOTICE '========================================';
END $$;

-- Insert prospects into active_assignments table
INSERT INTO public.active_assignments (
    candidate_id,
    candidate_name,
    facility_name,
    start_date,
    end_date,
    job_number,
    notes,
    extension_stage,
    is_prestart,
    is_looking_for_new_facility,
    is_exiting,
    created_at,
    updated_at
)
SELECT
    p.candidate_id,
    p.name AS candidate_name,
    COALESCE(p.city, 'Unknown Facility') AS facility_name,
    COALESCE(p.created_at::date, CURRENT_DATE) AS start_date,
    COALESCE(p.created_at::date + INTERVAL '13 weeks', CURRENT_DATE + INTERVAL '13 weeks')::date AS end_date,
    NULL AS job_number,
    'Imported from prospects on ' || CURRENT_DATE AS notes,
    'not_started' AS extension_stage,
    false AS is_prestart,
    false AS is_looking_for_new_facility,
    false AS is_exiting,
    NOW() AS created_at,
    NOW() AS updated_at
FROM
    public.prospects p
WHERE
    p.status = 'Contacted'
    -- Prevent duplicates
    AND NOT EXISTS (
        SELECT 1 FROM public.active_assignments a
        WHERE a.candidate_id = p.candidate_id
    );

-- Show results
DO $$
DECLARE
    total_assignments INTEGER;
    new_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_assignments FROM public.active_assignments;
    SELECT COUNT(*) INTO new_count FROM public.active_assignments WHERE created_at > NOW() - INTERVAL '1 minute';

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Backfill Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'New assignments created: %', new_count;
    RAISE NOTICE 'Total assignments in table: %', total_assignments;
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION: View Active Assignments
-- ============================================================================

SELECT
    id,
    candidate_id,
    candidate_name,
    facility_name,
    start_date,
    end_date,
    end_date - CURRENT_DATE AS days_to_end,
    extension_stage,
    is_looking_for_new_facility,
    is_exiting
FROM public.active_assignments
ORDER BY end_date
LIMIT 25;
