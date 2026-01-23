-- ============================================================================
-- Candidate DNA Store
-- Purpose: Persistent storage for structured candidate metadata ("Fact Sheet")
-- that powers the Stateful Submittal Engine
-- ============================================================================

-- Create the candidate_dna table
CREATE TABLE IF NOT EXISTS candidate_dna (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    candidate_id bigint UNIQUE NOT NULL,
    
    -- Professional Summary
    title text,
    years_of_experience integer,
    primary_specialty text,
    secondary_specialties text[] DEFAULT '{}',
    tenure_rating text CHECK (tenure_rating IN ('high', 'medium', 'low')),
    
    -- Clinical Competencies
    charting_systems text[] DEFAULT '{}',
    max_patient_ratio text,
    facility_types text[] DEFAULT '{}',
    skills_keywords text[] DEFAULT '{}',
    
    -- Floating Preference
    willing_to_float boolean DEFAULT false,
    eligible_units text[] DEFAULT '{}',
    
    -- Compliance Snapshots
    certifications jsonb DEFAULT '[]'::jsonb,
    rto_history text,
    
    -- Raw Knowledge Base (OCR text snippets from uploads)
    extracted_snippets jsonb DEFAULT '[]'::jsonb,
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    last_updated_at timestamptz DEFAULT now(),
    update_source text,
    
    -- Foreign key (soft reference - may not exist)
    CONSTRAINT fk_candidate FOREIGN KEY (candidate_id) 
        REFERENCES prospects(candidate_id) ON DELETE CASCADE
);

-- Index for fast lookups by candidate_id
CREATE INDEX IF NOT EXISTS idx_candidate_dna_candidate_id 
    ON candidate_dna(candidate_id);

-- Trigger to auto-update last_updated_at
CREATE OR REPLACE FUNCTION update_candidate_dna_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_candidate_dna_timestamp ON candidate_dna;
CREATE TRIGGER trigger_update_candidate_dna_timestamp
    BEFORE UPDATE ON candidate_dna
    FOR EACH ROW
    EXECUTE FUNCTION update_candidate_dna_timestamp();

-- RPC function to upsert DNA with smart merging
CREATE OR REPLACE FUNCTION upsert_candidate_dna(
    p_candidate_id bigint,
    p_title text DEFAULT NULL,
    p_years_of_experience integer DEFAULT NULL,
    p_primary_specialty text DEFAULT NULL,
    p_secondary_specialties text[] DEFAULT NULL,
    p_tenure_rating text DEFAULT NULL,
    p_charting_systems text[] DEFAULT NULL,
    p_max_patient_ratio text DEFAULT NULL,
    p_facility_types text[] DEFAULT NULL,
    p_skills_keywords text[] DEFAULT NULL,
    p_willing_to_float boolean DEFAULT NULL,
    p_eligible_units text[] DEFAULT NULL,
    p_certifications jsonb DEFAULT NULL,
    p_rto_history text DEFAULT NULL,
    p_extracted_snippet jsonb DEFAULT NULL,
    p_update_source text DEFAULT 'manual'
)
RETURNS candidate_dna AS $$
DECLARE
    result candidate_dna;
BEGIN
    INSERT INTO candidate_dna (
        candidate_id, title, years_of_experience, primary_specialty,
        secondary_specialties, tenure_rating, charting_systems, max_patient_ratio,
        facility_types, skills_keywords, willing_to_float, eligible_units,
        certifications, rto_history, update_source
    ) VALUES (
        p_candidate_id,
        p_title,
        p_years_of_experience,
        p_primary_specialty,
        COALESCE(p_secondary_specialties, '{}'::text[]),
        p_tenure_rating,
        COALESCE(p_charting_systems, '{}'::text[]),
        p_max_patient_ratio,
        COALESCE(p_facility_types, '{}'::text[]),
        COALESCE(p_skills_keywords, '{}'::text[]),
        COALESCE(p_willing_to_float, false),
        COALESCE(p_eligible_units, '{}'::text[]),
        COALESCE(p_certifications, '[]'::jsonb),
        p_rto_history,
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
        
        -- Append certifications (merge JSON arrays)
        certifications = candidate_dna.certifications || COALESCE(EXCLUDED.certifications, '[]'::jsonb),
        
        -- Append extracted snippets
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
GRANT ALL ON candidate_dna TO authenticated;
GRANT ALL ON candidate_dna TO service_role;
