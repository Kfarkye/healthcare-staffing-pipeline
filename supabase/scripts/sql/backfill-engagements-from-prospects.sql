-- Migration: Create Engagements from Imported Prospect Data
--
-- This script uses a temporary staging table to safely import your TSV data
-- and create corresponding 'engagements' for each prospect.
--
-- INSTRUCTIONS:
-- 1. Paste your TSV data after the "COPY prospect_staging..." line
-- 2. Ensure there is a blank line after your data and before the '\.' line
-- 3. Run this entire script in your Supabase SQL Editor

BEGIN;

-- 1. Create a temporary staging table to hold the raw TSV data
CREATE TEMP TABLE prospect_staging (
    candidate_id BIGINT,
    raw_col_2 TEXT,  -- Either 'Travel' or candidate name
    raw_col_3 TEXT,  -- Start date or phone
    raw_col_4 TEXT,  -- End date or start date
    raw_col_5 TEXT,  -- Facility or end date
    raw_col_6 TEXT,  -- Job ID or facility
    raw_col_7 TEXT,  -- Start date (Travel) or job ID
    raw_col_8 TEXT,  -- Blank or start date
    raw_col_9 TEXT,  -- AM info or blank
    raw_col_10 TEXT, -- Could be AM info
    raw_col_11 TEXT  -- Could be AM info
);

-- 2. Copy your local TSV data directly into the staging table
--    !!! PASTE YOUR FULL TSV DATA BELOW THIS LINE !!!
--    Example format:
--    4254046	Jahanna Perry-McElroy	7/20/25	10/11/25	Northwestern Medicine Palos Hospital	7345129	7/14/25		AM: Mitchell Moon
COPY prospect_staging (candidate_id, raw_col_2, raw_col_3, raw_col_4, raw_col_5, raw_col_6, raw_col_7, raw_col_8, raw_col_9, raw_col_10, raw_col_11) FROM stdin;
--- PASTE YOUR TSV DATA HERE (one line per record, tab-separated) ---
\.

-- 3. Insert into the 'engagements' table
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
    -- Try to find matching job by facility name and dates (since we don't have direct job_id)
    (
        SELECT j.id
        FROM public.jobs j
        JOIN public.facilities f ON f.id = j.facility_id
        WHERE f.name = (
            CASE
                WHEN s.raw_col_2 = 'Travel' THEN s.raw_col_5
                ELSE s.raw_col_5
            END
        )
        AND j.start_date = (
            CASE
                WHEN s.raw_col_2 = 'Travel' THEN TO_DATE(s.raw_col_4, 'MM/DD/YY')
                ELSE TO_DATE(s.raw_col_3, 'MM/DD/YY')
            END
        )
        LIMIT 1
    ) AS job_id,
    -- Start date
    (CASE
        WHEN s.raw_col_2 = 'Travel' THEN TO_DATE(s.raw_col_4, 'MM/DD/YY')
        ELSE TO_DATE(s.raw_col_3, 'MM/DD/YY')
    END)::date AS start_date,
    -- End date
    (CASE
        WHEN s.raw_col_2 = 'Travel' THEN TO_DATE(s.raw_col_5, 'MM/DD/YY')
        ELSE TO_DATE(s.raw_col_4, 'MM/DD/YY')
    END)::date AS end_date,
    -- Status
    'Active'::public.engagement_status_type AS status,
    -- Facility name
    (CASE
        WHEN s.raw_col_2 = 'Travel' THEN s.raw_col_5
        ELSE s.raw_col_5
    END) AS facility_name,
    -- Specialty (use default if not provided)
    'RN' AS specialty,
    -- Extension stage (MUST be lowercase with underscore)
    'not_started' AS extension_stage,
    -- Flags
    false AS is_looking_for_new_facility,
    false AS is_exiting,
    -- Timestamps
    NOW() AS created_at,
    NOW() AS updated_at
FROM
    prospect_staging s
-- Join to prospects on the candidate_id to get the correct internal prospect 'id'
JOIN
    public.prospects p ON p.candidate_id = s.candidate_id
WHERE
    -- Only insert if we found a matching job
    EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.facilities f ON f.id = j.facility_id
        WHERE f.name = (
            CASE
                WHEN s.raw_col_2 = 'Travel' THEN s.raw_col_5
                ELSE s.raw_col_5
            END
        )
    )
-- Prevent duplicate engagements
ON CONFLICT (prospect_id, job_id) DO NOTHING;

-- 4. Log results
DO $$
DECLARE
    engagement_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO engagement_count FROM public.engagements WHERE status = 'Active';
    RAISE NOTICE 'Total active engagements: %', engagement_count;
END $$;

-- 5. Clean up
DROP TABLE prospect_staging;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these AFTER the migration)
-- ============================================================================

-- Query 1: Count the new engagements
-- SELECT COUNT(*) FROM public.engagements WHERE status = 'Active';

-- Query 2: Check the active_assignments_dashboard view
-- SELECT * FROM public.active_assignments_dashboard ORDER BY end_date LIMIT 10;

-- Query 3: Check specific travelers
-- SELECT
--     p.name,
--     e.start_date,
--     e.end_date,
--     e.facility_name,
--     e.status,
--     e.extension_stage
-- FROM
--     public.engagements e
-- JOIN
--     public.prospects p ON e.prospect_id = p.id
-- WHERE
--     p.candidate_id IN (4254046, 2724343, 1625033)
-- ORDER BY e.start_date;
