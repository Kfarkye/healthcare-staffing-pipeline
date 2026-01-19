-- ============================================================================
-- View All Prospects to Identify Which 5 to Keep
-- ============================================================================

-- Total count
SELECT COUNT(*) as total_prospects FROM public.prospects;

-- Show all prospects ordered by creation date
SELECT 
    id,
    candidate_id,
    name,
    email,
    specialty,
    status,
    recruiter,
    created_at
FROM public.prospects
ORDER BY created_at ASC;

-- Group by status to see distribution
SELECT 
    status,
    COUNT(*) as count
FROM public.prospects
GROUP BY status
ORDER BY count DESC;
