-- ============================================================================
-- Delete ALL Prospects from Import
-- ============================================================================
-- WARNING: This will delete ALL records from the prospects table
-- Use this if you want to completely clear out the imported data

BEGIN;

-- Show current state
DO $$
DECLARE
    total_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM public.prospects;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Current State';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total prospects to delete: %', total_count;
    RAISE NOTICE '========================================';
END $$;

-- Delete ALL prospects
DELETE FROM public.prospects;

-- Show results
DO $$
DECLARE
    final_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO final_count FROM public.prospects;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Deletion Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Remaining records: %', final_count;
    RAISE NOTICE 'All prospects deleted ✓';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- Verification
SELECT COUNT(*) as remaining_records FROM public.prospects;
