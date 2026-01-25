-- ============================================================================
-- AUDIT: Prospect Nova ID Data Quality Check
-- 
-- Purpose: Identify prospects with potentially incorrect candidate_id values
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. FULL EXPORT: All prospects with their candidate_id values
-- Export this to compare against Nova source data
SELECT 
    id AS internal_id,
    candidate_id AS current_nova_id,
    name,
    email,
    specialty,
    status,
    nova_url,
    created_at
FROM prospects
ORDER BY name;

-- 2. SUSPICIOUS PATTERNS: candidate_id values that look like timestamps
-- If candidate_id was accidentally set from Date.now(), values would be ~1.7 trillion
-- Valid Nova IDs are typically 6-8 digits (under 100 million)
SELECT 
    id AS internal_id,
    candidate_id AS suspicious_nova_id,
    name,
    email,
    'Possible timestamp ID - likely incorrect' AS issue
FROM prospects
WHERE candidate_id > 100000000  -- Greater than 100 million suggests timestamp-based ID
ORDER BY candidate_id DESC;

-- 3. MISSING NOVA URLs: Records that need nova_url populated
SELECT 
    id AS internal_id,
    candidate_id,
    name,
    'Missing nova_url - needs population' AS issue
FROM prospects
WHERE nova_url IS NULL OR nova_url = ''
ORDER BY name;

-- 4. DUPLICATE NAMES: Multiple records for same person
SELECT 
    name,
    COUNT(*) AS record_count,
    array_agg(candidate_id) AS all_candidate_ids,
    array_agg(id) AS all_internal_ids
FROM prospects
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY record_count DESC;

-- 5. SUMMARY STATS
SELECT 
    COUNT(*) AS total_prospects,
    COUNT(CASE WHEN candidate_id > 100000000 THEN 1 END) AS suspicious_timestamp_ids,
    COUNT(CASE WHEN nova_url IS NULL OR nova_url = '' THEN 1 END) AS missing_nova_urls,
    COUNT(DISTINCT name) AS unique_names,
    COUNT(*) - COUNT(DISTINCT name) AS potential_duplicates
FROM prospects;
