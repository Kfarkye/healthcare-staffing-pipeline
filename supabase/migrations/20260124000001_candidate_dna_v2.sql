-- ============================================================================
-- Candidate DNA Store v2 - Hardened Architecture
-- Adds: confidence scores, skill recency, anti-skills, verification flags
-- ============================================================================

-- Add new columns to candidate_dna
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS confidence_score real DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1);
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS verified_by_recruiter boolean DEFAULT false;
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS verified_by text;

-- Anti-skills: things the candidate will NOT do
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS hard_no_skills text[] DEFAULT '{}';
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS do_not_submit_to text[] DEFAULT '{}';

-- Convert simple arrays to JSONB for recency tracking
-- charting_systems_v2: [{ "name": "Epic", "last_used": 2024, "confidence": 0.9 }]
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS charting_systems_v2 jsonb DEFAULT '[]'::jsonb;
-- skills_v2: [{ "name": "Patient Intake", "last_used": 2024, "confidence": 0.8 }]
ALTER TABLE candidate_dna ADD COLUMN IF NOT EXISTS skills_v2 jsonb DEFAULT '[]'::jsonb;

-- Create function to check for conflicts between eligible_units and hard_no_skills
CREATE OR REPLACE FUNCTION check_dna_conflicts()
RETURNS TRIGGER AS $$
DECLARE
    conflict_skill text;
BEGIN
    -- Check if any eligible_unit is in hard_no_skills
    SELECT unnest(NEW.eligible_units) 
    INTO conflict_skill
    FROM unnest(NEW.eligible_units) AS u
    WHERE u = ANY(NEW.hard_no_skills)
    LIMIT 1;
    
    IF conflict_skill IS NOT NULL THEN
        RAISE EXCEPTION 'Conflict detected: "%" is in both eligible_units and hard_no_skills', conflict_skill;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for conflict detection
DROP TRIGGER IF EXISTS trigger_check_dna_conflicts ON candidate_dna;
CREATE TRIGGER trigger_check_dna_conflicts
    BEFORE INSERT OR UPDATE ON candidate_dna
    FOR EACH ROW
    EXECUTE FUNCTION check_dna_conflicts();

-- Update the upsert function to handle new fields
CREATE OR REPLACE FUNCTION upsert_candidate_dna_v2(
    p_candidate_id bigint,
    p_title text DEFAULT NULL,
    p_years_of_experience integer DEFAULT NULL,
    p_primary_specialty text DEFAULT NULL,
    p_secondary_specialties text[] DEFAULT NULL,
    p_tenure_rating text DEFAULT NULL,
    p_charting_systems text[] DEFAULT NULL,
    p_charting_systems_v2 jsonb DEFAULT NULL,
    p_max_patient_ratio text DEFAULT NULL,
    p_facility_types text[] DEFAULT NULL,
    p_skills_keywords text[] DEFAULT NULL,
    p_skills_v2 jsonb DEFAULT NULL,
    p_willing_to_float boolean DEFAULT NULL,
    p_eligible_units text[] DEFAULT NULL,
    p_certifications jsonb DEFAULT NULL,
    p_rto_history text DEFAULT NULL,
    p_hard_no_skills text[] DEFAULT NULL,
    p_do_not_submit_to text[] DEFAULT NULL,
    p_confidence_score real DEFAULT NULL,
    p_verified_by_recruiter boolean DEFAULT NULL,
    p_verified_by text DEFAULT NULL,
    p_extracted_snippet jsonb DEFAULT NULL,
    p_update_source text DEFAULT 'manual'
)
RETURNS candidate_dna AS $$
DECLARE
    result candidate_dna;
BEGIN
    INSERT INTO candidate_dna (
        candidate_id, title, years_of_experience, primary_specialty,
        secondary_specialties, tenure_rating, charting_systems, charting_systems_v2,
        max_patient_ratio, facility_types, skills_keywords, skills_v2,
        willing_to_float, eligible_units, certifications, rto_history,
        hard_no_skills, do_not_submit_to, confidence_score, 
        verified_by_recruiter, verified_by, update_source
    ) VALUES (
        p_candidate_id,
        p_title,
        p_years_of_experience,
        p_primary_specialty,
        COALESCE(p_secondary_specialties, '{}'::text[]),
        p_tenure_rating,
        COALESCE(p_charting_systems, '{}'::text[]),
        COALESCE(p_charting_systems_v2, '[]'::jsonb),
        p_max_patient_ratio,
        COALESCE(p_facility_types, '{}'::text[]),
        COALESCE(p_skills_keywords, '{}'::text[]),
        COALESCE(p_skills_v2, '[]'::jsonb),
        COALESCE(p_willing_to_float, false),
        COALESCE(p_eligible_units, '{}'::text[]),
        COALESCE(p_certifications, '[]'::jsonb),
        p_rto_history,
        COALESCE(p_hard_no_skills, '{}'::text[]),
        COALESCE(p_do_not_submit_to, '{}'::text[]),
        COALESCE(p_confidence_score, 0.5),
        COALESCE(p_verified_by_recruiter, false),
        p_verified_by,
        p_update_source
    )
    ON CONFLICT (candidate_id) DO UPDATE SET
        -- Override fields (latest wins)
        title = COALESCE(EXCLUDED.title, candidate_dna.title),
        years_of_experience = COALESCE(EXCLUDED.years_of_experience, candidate_dna.years_of_experience),
        primary_specialty = COALESCE(EXCLUDED.primary_specialty, candidate_dna.primary_specialty),
        tenure_rating = COALESCE(EXCLUDED.tenure_rating, candidate_dna.tenure_rating),
        max_patient_ratio = COALESCE(EXCLUDED.max_patient_ratio, candidate_dna.max_patient_ratio),
        rto_history = COALESCE(EXCLUDED.rto_history, candidate_dna.rto_history),
        willing_to_float = COALESCE(EXCLUDED.willing_to_float, candidate_dna.willing_to_float),
        
        -- Confidence and verification
        confidence_score = CASE 
            WHEN EXCLUDED.confidence_score IS NOT NULL THEN EXCLUDED.confidence_score
            ELSE candidate_dna.confidence_score
        END,
        verified_by_recruiter = CASE 
            WHEN EXCLUDED.verified_by_recruiter = true THEN true
            ELSE candidate_dna.verified_by_recruiter
        END,
        verified_at = CASE 
            WHEN EXCLUDED.verified_by_recruiter = true AND candidate_dna.verified_by_recruiter = false THEN now()
            ELSE candidate_dna.verified_at
        END,
        verified_by = CASE 
            WHEN EXCLUDED.verified_by IS NOT NULL THEN EXCLUDED.verified_by
            ELSE candidate_dna.verified_by
        END,
        
        -- Append fields (merge arrays, dedupe)
        secondary_specialties = ARRAY(
            SELECT DISTINCT unnest(candidate_dna.secondary_specialties || COALESCE(EXCLUDED.secondary_specialties, '{}'::text[]))
        ),
        charting_systems = ARRAY(
            SELECT DISTINCT unnest(candidate_dna.charting_systems || COALESCE(EXCLUDED.charting_systems, '{}'::text[]))
        ),
        facility_types = ARRAY(
            SELECT DISTINCT unnest(candidate_dna.facility_types || COALESCE(EXCLUDED.facility_types, '{}'::text[]))
        ),
        skills_keywords = ARRAY(
            SELECT DISTINCT unnest(candidate_dna.skills_keywords || COALESCE(EXCLUDED.skills_keywords, '{}'::text[]))
        ),
        eligible_units = ARRAY(
            SELECT DISTINCT unnest(candidate_dna.eligible_units || COALESCE(EXCLUDED.eligible_units, '{}'::text[]))
        ),
        hard_no_skills = ARRAY(
            SELECT DISTINCT unnest(candidate_dna.hard_no_skills || COALESCE(EXCLUDED.hard_no_skills, '{}'::text[]))
        ),
        do_not_submit_to = ARRAY(
            SELECT DISTINCT unnest(candidate_dna.do_not_submit_to || COALESCE(EXCLUDED.do_not_submit_to, '{}'::text[]))
        ),
        
        -- Merge v2 JSONB arrays (skills with recency)
        charting_systems_v2 = candidate_dna.charting_systems_v2 || COALESCE(EXCLUDED.charting_systems_v2, '[]'::jsonb),
        skills_v2 = candidate_dna.skills_v2 || COALESCE(EXCLUDED.skills_v2, '[]'::jsonb),
        
        -- Append certifications and snippets
        certifications = candidate_dna.certifications || COALESCE(EXCLUDED.certifications, '[]'::jsonb),
        extracted_snippets = CASE 
            WHEN p_extracted_snippet IS NOT NULL 
            THEN candidate_dna.extracted_snippets || jsonb_build_array(p_extracted_snippet)
            ELSE candidate_dna.extracted_snippets
        END,
        
        update_source = p_update_source
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION upsert_candidate_dna_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_candidate_dna_v2 TO service_role;
