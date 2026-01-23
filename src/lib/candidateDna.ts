/**
 * Candidate DNA Store
 * 
 * Persistent storage for structured candidate metadata ("Fact Sheet")
 * that powers the Stateful Submittal Engine.
 */

import { supabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface Certification {
    name: string;
    expiry?: string;
    verified: boolean;
    confidence?: number; // 0-1 confidence score
    extracted_at?: string;
}

// Skill with recency tracking
export interface SkillWithRecency {
    name: string;
    last_used?: number; // Year last used
    confidence?: number; // 0-1 confidence score
    source?: 'resume' | 'ocr' | 'recruiter' | 'ai';
}

export interface CandidateDna {
    id?: number;
    candidate_id: number;

    // Professional Summary
    title?: string;
    years_of_experience?: number;
    primary_specialty?: string;
    secondary_specialties?: string[];
    tenure_rating?: 'high' | 'medium' | 'low';

    // Clinical Competencies (v1 - simple arrays)
    charting_systems?: string[];
    max_patient_ratio?: string;
    facility_types?: string[];
    skills_keywords?: string[];

    // Clinical Competencies (v2 - with recency)
    charting_systems_v2?: SkillWithRecency[];
    skills_v2?: SkillWithRecency[];

    // Floating Preference
    willing_to_float?: boolean;
    eligible_units?: string[];

    // Anti-Skills (Hard No's)
    hard_no_skills?: string[];
    do_not_submit_to?: string[];

    // Compliance
    certifications?: Certification[];
    rto_history?: string;

    // Raw Knowledge Base
    extracted_snippets?: any[];

    // Verification & Confidence
    confidence_score?: number; // 0-1 overall confidence
    verified_by_recruiter?: boolean;
    verified_at?: string;
    verified_by?: string;

    // Metadata
    created_at?: string;
    last_updated_at?: string;
    update_source?: string;
}

export interface DnaUpdatePayload {
    title?: string;
    years_of_experience?: number;
    primary_specialty?: string;
    secondary_specialties?: string[];
    tenure_rating?: 'high' | 'medium' | 'low';
    charting_systems?: string[];
    charting_systems_v2?: SkillWithRecency[];
    max_patient_ratio?: string;
    facility_types?: string[];
    skills_keywords?: string[];
    skills_v2?: SkillWithRecency[];
    willing_to_float?: boolean;
    eligible_units?: string[];
    hard_no_skills?: string[];
    do_not_submit_to?: string[];
    certifications?: Certification[];
    rto_history?: string;
    confidence_score?: number;
    verified_by_recruiter?: boolean;
    verified_by?: string;
    extracted_snippet?: any;
    update_source?: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch the complete DNA profile for a candidate.
 */
export async function getCandidateDna(candidateId: number): Promise<CandidateDna | null> {
    const { data, error } = await supabase
        .from('candidate_dna')
        .select('*')
        .eq('candidate_id', candidateId)
        .maybeSingle();

    if (error) {
        console.error('Failed to fetch candidate DNA:', error);
        return null;
    }

    return data;
}

/**
 * Update candidate DNA using the smart upsert RPC.
 * - Override fields: title, years_of_experience, tenure_rating, max_patient_ratio
 * - Append fields: charting_systems, skills_keywords, facility_types, certifications
 */
export async function updateCandidateDna(
    candidateId: number,
    payload: DnaUpdatePayload
): Promise<CandidateDna | null> {
    const { data, error } = await supabase.rpc('upsert_candidate_dna', {
        p_candidate_id: candidateId,
        p_title: payload.title || null,
        p_years_of_experience: payload.years_of_experience || null,
        p_primary_specialty: payload.primary_specialty || null,
        p_secondary_specialties: payload.secondary_specialties || null,
        p_tenure_rating: payload.tenure_rating || null,
        p_charting_systems: payload.charting_systems || null,
        p_max_patient_ratio: payload.max_patient_ratio || null,
        p_facility_types: payload.facility_types || null,
        p_skills_keywords: payload.skills_keywords || null,
        p_willing_to_float: payload.willing_to_float ?? null,
        p_eligible_units: payload.eligible_units || null,
        p_certifications: payload.certifications ? JSON.stringify(payload.certifications) : null,
        p_rto_history: payload.rto_history || null,
        p_extracted_snippet: payload.extracted_snippet ? JSON.stringify(payload.extracted_snippet) : null,
        p_update_source: payload.update_source || 'api'
    });

    if (error) {
        console.error('Failed to update candidate DNA:', error);
        return null;
    }

    return data;
}

/**
 * Append skills to a candidate's DNA (convenience wrapper).
 */
export async function appendSkills(candidateId: number, skills: string[]): Promise<CandidateDna | null> {
    return updateCandidateDna(candidateId, {
        skills_keywords: skills,
        update_source: 'skill_append'
    });
}

/**
 * Append charting systems to a candidate's DNA.
 */
export async function appendChartingSystems(candidateId: number, systems: string[]): Promise<CandidateDna | null> {
    return updateCandidateDna(candidateId, {
        charting_systems: systems,
        update_source: 'charting_append'
    });
}

/**
 * Update certifications for a candidate.
 */
export async function updateCertifications(
    candidateId: number,
    certifications: Certification[]
): Promise<CandidateDna | null> {
    return updateCandidateDna(candidateId, {
        certifications,
        update_source: 'cert_update'
    });
}

/**
 * Store an extracted snippet from OCR/parsing.
 */
export async function storeExtractedSnippet(
    candidateId: number,
    snippet: { source: string; text: string; parsed_at: string }
): Promise<CandidateDna | null> {
    return updateCandidateDna(candidateId, {
        extracted_snippet: snippet,
        update_source: 'ocr_extraction'
    });
}

/**
 * Calculate tenure rating based on work history.
 */
export function calculateTenureRating(monthsAtCurrentFacility: number): 'high' | 'medium' | 'low' {
    if (monthsAtCurrentFacility >= 24) return 'high';
    if (monthsAtCurrentFacility >= 12) return 'medium';
    return 'low';
}

/**
 * Parse charting systems from free text.
 */
export function parseChartingSystems(text: string): string[] {
    const systems = [
        'Epic', 'Cerner', 'Meditech', 'Allscripts', 'NextGen',
        'Athena', 'eClinicalWorks', 'TruBridge', 'PointClickCare',
        'McKesson', 'Sunrise', 'Aria', 'Mosaiq', 'SPM', 'Censitrac'
    ];

    const found: string[] = [];
    const lowerText = text.toLowerCase();

    for (const system of systems) {
        if (lowerText.includes(system.toLowerCase())) {
            found.push(system);
        }
    }

    return found;
}

/**
 * Parse patient ratio from free text (e.g., "1:4" or "4 patients").
 */
export function parsePatientRatio(text: string): string | null {
    // Match patterns like "1:4", "1 to 4", "4 patients"
    const ratioMatch = text.match(/(\d+)\s*[:\-to]+\s*(\d+)/i);
    if (ratioMatch) {
        return `1:${ratioMatch[2]}`;
    }

    const patientMatch = text.match(/(\d+)\s*patients?/i);
    if (patientMatch) {
        return `1:${patientMatch[1]}`;
    }

    return null;
}

// ============================================================================
// V2 FUNCTIONS - Confidence, Verification, Anti-Skills
// ============================================================================

/**
 * Mark candidate DNA as verified by recruiter.
 */
export async function verifyDna(
    candidateId: number,
    recruiterName: string
): Promise<CandidateDna | null> {
    const { data, error } = await supabase
        .from('candidate_dna')
        .update({
            verified_by_recruiter: true,
            verified_at: new Date().toISOString(),
            verified_by: recruiterName,
            confidence_score: 1.0
        })
        .eq('candidate_id', candidateId)
        .select()
        .single();

    if (error) {
        console.error('Failed to verify DNA:', error);
        return null;
    }

    return data;
}

/**
 * Add a hard-no skill (something candidate refuses to do).
 */
export async function addHardNoSkill(
    candidateId: number,
    skill: string
): Promise<CandidateDna | null> {
    const { data, error } = await supabase.rpc('upsert_candidate_dna_v2', {
        p_candidate_id: candidateId,
        p_hard_no_skills: [skill],
        p_update_source: 'recruiter_note'
    });

    if (error) {
        console.error('Failed to add hard-no skill:', error);
        return null;
    }

    return data;
}

/**
 * Add facility to do-not-submit list.
 */
export async function addDoNotSubmit(
    candidateId: number,
    facility: string
): Promise<CandidateDna | null> {
    const { data, error } = await supabase.rpc('upsert_candidate_dna_v2', {
        p_candidate_id: candidateId,
        p_do_not_submit_to: [facility],
        p_update_source: 'recruiter_note'
    });

    if (error) {
        console.error('Failed to add do-not-submit:', error);
        return null;
    }

    return data;
}

/**
 * Check for conflicts between job requirements and candidate anti-skills.
 */
export function checkConflicts(
    dna: CandidateDna,
    jobRequirements: { units?: string[]; facility?: string }
): { hasConflict: boolean; conflicts: string[] } {
    const conflicts: string[] = [];

    // Check unit conflicts
    if (jobRequirements.units && dna.hard_no_skills) {
        for (const unit of jobRequirements.units) {
            if (dna.hard_no_skills.some(no => no.toLowerCase() === unit.toLowerCase())) {
                conflicts.push(`Candidate has "No ${unit}" in their profile`);
            }
        }
    }

    // Check facility conflicts
    if (jobRequirements.facility && dna.do_not_submit_to) {
        if (dna.do_not_submit_to.some(f => f.toLowerCase() === jobRequirements.facility?.toLowerCase())) {
            conflicts.push(`Candidate is on do-not-submit list for ${jobRequirements.facility}`);
        }
    }

    return {
        hasConflict: conflicts.length > 0,
        conflicts
    };
}

/**
 * Convert simple skills to v2 format with recency.
 */
export function toSkillsWithRecency(
    skills: string[],
    year: number,
    source: 'resume' | 'ocr' | 'recruiter' | 'ai' = 'resume',
    confidence: number = 0.8
): SkillWithRecency[] {
    return skills.map(name => ({
        name,
        last_used: year,
        confidence,
        source
    }));
}

/**
 * Get only skills used within the last N years.
 */
export function getRecentSkills(
    skills: SkillWithRecency[],
    withinYears: number = 5
): SkillWithRecency[] {
    const cutoffYear = new Date().getFullYear() - withinYears;
    return skills.filter(s => !s.last_used || s.last_used >= cutoffYear);
}

/**
 * Check if DNA needs recruiter verification (low confidence or OCR sourced).
 */
export function needsVerification(dna: CandidateDna): boolean {
    if (dna.verified_by_recruiter) return false;
    if ((dna.confidence_score ?? 0.5) < 0.7) return true;
    if (dna.update_source === 'ocr_extraction') return true;
    return false;
}

