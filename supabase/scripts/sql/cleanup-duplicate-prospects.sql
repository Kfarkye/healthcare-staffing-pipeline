-- ============================================================================
-- Remove Duplicate Prospects
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
    SELECT COUNT(*) INTO total_count FROM public.prospects;
    SELECT COUNT(DISTINCT candidate_id) INTO unique_candidates 
    FROM public.prospects 
    WHERE candidate_id IS NOT NULL;
    duplicate_count := total_count - unique_candidates;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Before Cleanup';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total records: %', total_count;
    RAISE NOTICE 'Unique candidates: %', unique_candidates;
    RAISE NOTICE 'Duplicates to remove: %', duplicate_count;
    RAISE NOTICE '========================================';
END $$;

-- Delete duplicates, keeping only the most recent record per candidate_id
DELETE FROM public.prospects
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            candidate_id,
            ROW_NUMBER() OVER (
                PARTITION BY candidate_id 
                ORDER BY created_at DESC, id DESC
            ) as row_num
        FROM public.prospects
        WHERE candidate_id IS NOT NULL
    ) ranked
    WHERE row_num > 1
);

-- Show results
DO $$
DECLARE
    final_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO final_count FROM public.prospects;

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
    COUNT(DISTINCT candidate_id) as unique_candidates,
    COUNT(*) - COUNT(DISTINCT candidate_id) as remaining_duplicates
FROM public.prospects
WHERE candidate_id IS NOT NULL;

-- Show sample of cleaned data
SELECT
    id,
    candidate_id,
    name,
    email,
    specialty,
    status,
    created_at
FROM public.prospects
ORDER BY created_at DESC
LIMIT 10;
