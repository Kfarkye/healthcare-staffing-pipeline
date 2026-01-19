-- ============================================================================
-- Delete Imported Prospects (Keep 5 Original Records)
-- ============================================================================
-- INSTRUCTIONS:
-- 1. First run view-prospects-for-cleanup.sql to see all records
-- 2. Identify the 5 IDs you want to KEEP
-- 3. Replace the IDs in the IN clause below
-- 4. Run this script
-- ============================================================================

BEGIN;

-- Show current state
DO $$
DECLARE
    total_count INTEGER;
    to_keep INTEGER := 5;
    to_delete INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM public.prospects;
    to_delete := total_count - to_keep;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Before Cleanup';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total records: %', total_count;
    RAISE NOTICE 'Records to keep: %', to_keep;
    RAISE NOTICE 'Records to delete: %', to_delete;
    RAISE NOTICE '========================================';
END $$;

-- DELETE ALL EXCEPT the 5 original records
DELETE FROM public.prospects
WHERE id NOT IN (
    3,   -- Wonani Mhango (Behavioral Health RN)
    8,   -- Wonani Mhango (with template data)
    9,   -- Smith Vazquez (Surgical Tech)
    10,  -- Savannah Woodward (Phlebotomist)
    11   -- FANTA BANGURA (Behavioral Health RN)
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
    RAISE NOTICE 'Remaining records: %', final_count;
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- Verification: Show what's left
SELECT 
    id,
    candidate_id,
    name,
    email,
    status,
    created_at
FROM public.prospects
ORDER BY created_at ASC;
