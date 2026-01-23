/**
 * Submittal Highlights Generator
 * 
 * Generates a structured "Submittal Highlights" summary from candidate profile data.
 * Follows a hierarchical bullet-point format for recruiter submittals.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WorkHistoryEntry {
    startMonth: string;
    startYear: string;
    endMonth: string;
    endYear: string;
    currentlyWorking: boolean;
    facility: string;
    city: string;
    state: string;
    positionHeld: string;
    unitSpecialty: string;
    employmentType: string;
    nursePatientRatio: string;
    chargeExperience: boolean;
    shift: string;
    chartingSystem: string;
    teachingFacility: boolean;
    traumaFacility: boolean;
    traumaLevel: string;
    magnetFacility: boolean;
    facilityBeds: string;
    unitBeds: string;
    responsibilities?: string;
}

export interface CandidateProfile {
    name: string;
    certifications: string[];
    workHistory: WorkHistoryEntry[];
    skills?: string[];
    profession?: string;
    bonus_bullet?: string; // Manual override for special skills (e.g., "Fluent in Spanish")
}

export interface SubmittalHighlights {
    titleLine: string;
    experienceLine: string;
    ratioLine: string | null;
    proficiencies: string[];
    chartingLine: string | null;
    tenureLine: string;
    floatingLine: string | null;
    bonusBullet: string | null;
    markdown: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate months between two dates.
 */
function calculateMonths(startMonth: string, startYear: string, endMonth: string, endYear: string, currentlyWorking: boolean): number {
    const start = new Date(parseInt(startYear), parseInt(startMonth) - 1);
    const end = currentlyWorking ? new Date() : new Date(parseInt(endYear), parseInt(endMonth) - 1);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return Math.max(0, months);
}

/**
 * Get unique charting systems from work history.
 */
function getChartingSystems(workHistory: WorkHistoryEntry[]): string[] {
    const systems = workHistory
        .map(w => w.chartingSystem)
        .filter(Boolean)
        .map(s => s.trim());
    return [...new Set(systems)];
}

/**
 * Get unique specialties from work history.
 */
function getSpecialties(workHistory: WorkHistoryEntry[]): string[] {
    const specialties = workHistory
        .map(w => w.unitSpecialty)
        .filter(Boolean)
        .map(s => s.trim());
    return [...new Set(specialties)];
}

/**
 * Get facility type descriptors.
 */
function getFacilityDescriptors(entry: WorkHistoryEntry): string[] {
    const descriptors: string[] = [];
    if (entry.magnetFacility) descriptors.push('Magnet');
    if (entry.traumaFacility && entry.traumaLevel) descriptors.push(`Level ${entry.traumaLevel} Trauma`);
    if (entry.teachingFacility) descriptors.push('Teaching');
    return descriptors;
}

/**
 * Get default proficiencies based on profession.
 */
function getDefaultProficiencies(profession?: string): string[] {
    const lowerProfession = (profession || '').toLowerCase();

    if (lowerProfession.includes('nurse') || lowerProfession.includes('rn') || lowerProfession.includes('lpn')) {
        return ['Patient Intake', 'Vitals Monitoring', 'Acute Care Settings'];
    }
    if (lowerProfession.includes('medical assistant') || lowerProfession.includes('ma') || lowerProfession.includes('cma')) {
        return ['Patient Intake', 'Vitals', 'Acute Care Settings'];
    }
    if (lowerProfession.includes('sterile') || lowerProfession.includes('spt')) {
        return ['Instrument Processing', 'Decontamination', 'Case Cart Preparation'];
    }

    return ['Patient Care', 'Clinical Documentation'];
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate Submittal Highlights from a candidate profile.
 */
export function generateSubmittalHighlights(profile: CandidateProfile): SubmittalHighlights {
    const { certifications, workHistory, skills, profession } = profile;

    // Sort work history by recency (most recent first)
    const sortedHistory = [...workHistory].sort((a, b) => {
        const aDate = new Date(parseInt(a.startYear), parseInt(a.startMonth) - 1);
        const bDate = new Date(parseInt(b.startYear), parseInt(b.startMonth) - 1);
        return bDate.getTime() - aDate.getTime();
    });

    const mostRecent = sortedHistory[0];
    const secondMostRecent = sortedHistory[1];

    // 1. Title/Certs Line
    const titleLine = certifications.length > 0
        ? certifications.join(' | ')
        : (mostRecent?.positionHeld || 'Healthcare Professional');

    // 2. Experience Summary Line
    let experienceLine = '';
    if (mostRecent) {
        const specialties = getSpecialties(sortedHistory.slice(0, 2));
        const descriptors = getFacilityDescriptors(mostRecent);
        const facilityType = descriptors.length > 0 ? descriptors.join('/') + ' Center' : 'Healthcare Facility';
        experienceLine = `Experience in ${specialties.join(', ')} at ${facilityType}`;
    } else {
        experienceLine = 'Healthcare experience';
    }

    // 3. Ratios Line
    let ratioLine: string | null = null;
    const ratios = sortedHistory.map(w => w.nursePatientRatio).filter(Boolean);
    if (ratios.length > 0) {
        ratioLine = `Comfortable with ${ratios[0]} Patient Ratios`;
    }

    // 4. Proficiencies
    const defaultProfs = getDefaultProficiencies(profession || mostRecent?.positionHeld);
    const proficiencies = skills && skills.length > 0
        ? [...new Set([...defaultProfs, ...skills])].slice(0, 6)
        : defaultProfs;

    // 5. Charting Systems Line
    const chartingSystems = getChartingSystems(sortedHistory);
    const chartingLine = chartingSystems.length > 0
        ? `Proficient in: ${chartingSystems.join(', ')}`
        : null;

    // 6. Tenure Line
    let tenureLine = '';
    if (mostRecent) {
        const months = calculateMonths(
            mostRecent.startMonth,
            mostRecent.startYear,
            mostRecent.endMonth,
            mostRecent.endYear,
            mostRecent.currentlyWorking
        );
        const years = Math.floor(months / 12);

        if (years >= 2) {
            tenureLine = `Excellent professional stability with ${years}+ years at current facility`;
        } else if (months >= 12) {
            tenureLine = `Strong stability with 1+ year at current facility`;
        } else if (months >= 6) {
            tenureLine = `${months} months at current facility`;
        } else {
            tenureLine = 'Recently started at current facility';
        }
    } else {
        tenureLine = 'Tenure information unavailable';
    }

    // 7. Floating Line (if 3+ distinct specialties)
    const uniqueSpecialties = getSpecialties(sortedHistory);
    const floatingLine = uniqueSpecialties.length >= 3
        ? `Comfortable floating between ${uniqueSpecialties.slice(0, 3).join(', ')}`
        : null;

    // Build Markdown Output
    const lines: string[] = [
        `• **${titleLine}**`,
        `• ${experienceLine}`,
    ];

    if (ratioLine) lines.push(`• ${ratioLine}`);

    lines.push(`• **Highly Proficient In:**`);
    proficiencies.forEach(p => lines.push(`  - ${p}`));

    if (chartingLine) lines.push(`• ${chartingLine}`);
    lines.push(`• ${tenureLine}`);
    if (floatingLine) lines.push(`• ${floatingLine}`);

    // 8. Bonus Bullet (manual override for special skills)
    const bonusBullet = profile.bonus_bullet || null;
    if (bonusBullet) lines.push(`• ${bonusBullet}`);

    const markdown = lines.join('\n');

    return {
        titleLine,
        experienceLine,
        ratioLine,
        proficiencies,
        chartingLine,
        tenureLine,
        floatingLine,
        bonusBullet,
        markdown
    };
}

/**
 * Generate Submittal Highlights with AI enhancement for proficiencies.
 * This version calls an AI to extract skills from responsibilities text.
 */
export async function generateSubmittalHighlightsWithAI(
    profile: CandidateProfile,
    aiCallFn?: (responsibilities: string) => Promise<string[]>
): Promise<SubmittalHighlights> {
    // If AI function provided, enhance proficiencies
    if (aiCallFn && profile.workHistory.length > 0) {
        const responsibilities = profile.workHistory
            .map(w => w.responsibilities)
            .filter(Boolean)
            .join(' ');

        if (responsibilities.length > 50) {
            try {
                const aiSkills = await aiCallFn(responsibilities);
                profile.skills = [...(profile.skills || []), ...aiSkills];
            } catch (error) {
                console.warn('AI skill extraction failed, using defaults:', error);
            }
        }
    }

    return generateSubmittalHighlights(profile);
}
