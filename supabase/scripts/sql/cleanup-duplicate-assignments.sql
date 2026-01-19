-- ============================================================================
-- Remove Duplicate Active Assignments
-- ============================================================================
-- Keeps the most recently created record for each candidate_id
-- Deletes all older duplicates

BEGIN;

-- Show current state
DO $$
DECLARE
    total_count INTEGER;
    unique_candidates INTEGER;
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM public.active_assignments;
    SELECT COUNT(DISTINCT candidate_id) INTO unique_candidates FROM public.active_assignments;
    duplicate_count := total_count - unique_candidates;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Before Cleanup';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total records: %', total_count;
    RAISE NOTICE 'Unique candidates: %', unique_candidates;
    RAISE NOTICE 'Duplicates to remove: %', duplicate_count;
    RAISE NOTICE '========================================';
END $$;

-- Delete duplicates, keeping only the most recent record per candidate
DELETE FROM public.active_assignments
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY candidate_id 
                ORDER BY created_at DESC, id DESC
            ) as row_num
        FROM public.active_assignments
    ) ranked
    WHERE row_num > 1
);

-- Show results
DO $$
DECLARE
    final_count INTEGER;
    removed_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO final_count FROM public.active_assignments;
    removed_count := (SELECT COUNT(*) FROM public.active_assignments WHERE created_at < NOW() - INTERVAL '1 hour');

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Cleanup Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Final record count: %', final_count;
    RAISE NOTICE 'All duplicates removed ✓';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION: View Cleaned Data
-- ============================================================================

SELECT
    COUNT(*) as total_records,
    COUNT(DISTINCT candidate_id) as unique_candidates
FROM public.active_assignments;

-- Show first 10 records
SELECT
    candidate_id,
    candidate_name,
    facility_name,
    end_date,
    extension_stage,
    created_at
FROM public.active_assignments
ORDER BY end_date
LIMIT 10;
