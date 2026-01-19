/**
 * TSV Import Service
 *
 * Parses TSV data from Active Assignments export and imports into Supabase.
 * Handles multi-line AM/AC fields, filters WFD facilities, and creates prospects/facilities/jobs/engagements.
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface ParsedAssignment {
  candidate_id: number;
  candidate_name: string;
  start_date: string;
  end_date: string;
  facility_name: string;
  job_id: number;
  specialty: string | null;
  bill_rate: number | null;
  actual_margin: number | null;
  notes: string | null;
  nova_url: string;
  is_prestart: boolean;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

// ============================================================================
// PARSING LOGIC
// ============================================================================

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr.trim() === '') return null;

  // Handle MM/DD/YY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1; // 0-indexed
    const day = parseInt(parts[1]);
    let year = parseInt(parts[2]);

    // Handle 2-digit year
    if (year < 100) {
      year += 2000;
    }

    return new Date(year, month, day);
  }

  return null;
};

const calculateDaysToEnd = (endDate: Date): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = endDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const parseAssignmentRow = (row: string): ParsedAssignment | null => {
  const columns = row.split('\t');
  if (columns.length < 6) return null;

  try {
    // Handle both formats:
    // Format 1: CandidateID | Name | StartDate | EndDate | Facility | JobID | ...
    // Format 2: CandidateID | Travel | Name | StartDate | EndDate | Facility | JobID | ...

    let candidateId: number;
    let candidateName: string;
    let startDateStr: string;
    let endDateStr: string;
    let facilityName: string;
    let jobId: number;
    let amAcField = '';
    let recruiterField = '';

    // Detect format by checking if column 1 is "Travel"
    if (columns[1]?.trim().toLowerCase() === 'travel') {
      // Format 2 (with Travel indicator)
      candidateId = parseInt(columns[0]);
      candidateName = columns[2]?.trim();
      startDateStr = columns[3]?.trim();
      endDateStr = columns[4]?.trim();
      facilityName = columns[5]?.trim();
      jobId = parseInt(columns[6]);
      amAcField = columns[9] || '';
      recruiterField = columns[10] || '';
    } else {
      // Format 1 (original)
      candidateId = parseInt(columns[0]);
      candidateName = columns[1]?.trim();
      startDateStr = columns[2]?.trim();
      endDateStr = columns[3]?.trim();
      facilityName = columns[4]?.trim();
      jobId = parseInt(columns[5]);
      amAcField = columns[8] || '';
      recruiterField = columns[9] || '';
    }

    // Validation
    if (!candidateId || isNaN(candidateId)) return null;
    if (!candidateName) return null;
    if (!facilityName) return null;
    if (!jobId || isNaN(jobId)) return null;

    // Filter out WFD facilities
    if (facilityName.toLowerCase().includes('wfd')) {
      console.log(`[Parser] Skipping WFD facility: ${facilityName}`);
      return null;
    }

    // Parse dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    if (!endDate || endDate.toString() === 'Invalid Date') return null;

    // Calculate days to end
    const daysToEnd = calculateDaysToEnd(endDate);

    // Determine if prestart (start date is in the future)
    const isPrestart = startDate ? startDate > today : false;

    // Skip if assignment has already ended (negative days) AND it's not a prestart
    if (daysToEnd < 0 && !isPrestart) {
      console.log(`[Parser] Skipping expired assignment: ${candidateName} (${daysToEnd}d)`);
      return null;
    }

    // Extract AM/AC info
    let accountManager = '';
    let accountCoordinator = '';
    let recruiterName = '';

    if (amAcField.includes('AM:')) {
      const amMatch = amAcField.match(/AM:\s*([^\n]+)/);
      if (amMatch) accountManager = amMatch[1].trim();
    }
    if (amAcField.includes('AC:')) {
      const acMatch = amAcField.match(/AC:\s*([^\n]+)/);
      if (acMatch) accountCoordinator = acMatch[1].trim();
    }

    recruiterName = recruiterField.trim();

    // Build notes
    const noteParts = [];
    if (accountManager) noteParts.push(`AM: ${accountManager}`);
    if (accountCoordinator) noteParts.push(`AC: ${accountCoordinator}`);
    if (recruiterName) noteParts.push(`Recruiter: ${recruiterName}`);

    return {
      candidate_id: candidateId,
      candidate_name: candidateName,
      start_date: startDate ? startDate.toISOString().split('T')[0] : endDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      facility_name: facilityName,
      job_id: jobId,
      specialty: null, // Could extract from facility name if needed
      bill_rate: null,
      actual_margin: null,
      notes: noteParts.length > 0 ? noteParts.join(' | ') : null,
      nova_url: `https://nova.ayahealthcare.com/#/recruiting/candidates/${candidateId}/new-profile/about`,
      is_prestart: isPrestart,
    };
  } catch (error) {
    console.error('[Parser] Error parsing row:', error, row.substring(0, 100));
    return null;
  }
};

export const parseAssignmentData = (tsvData: string): ParsedAssignment[] => {
  const lines = tsvData.split('\n');
  const assignments: ParsedAssignment[] = [];
  const seenIds = new Set<string>();

  let currentRow = '';
  let totalRows = 0;
  let skippedWFD = 0;
  let skippedExpired = 0;
  let skippedDuplicates = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If line starts with a number (candidate ID), it's a new row
    if (/^\d+\t/.test(line)) {
      // Process previous row if exists
      if (currentRow) {
        totalRows++;
        const assignment = parseAssignmentRow(currentRow);
        if (assignment) {
          const uniqueKey = `${assignment.candidate_id}-${assignment.job_id}`;
          if (seenIds.has(uniqueKey)) {
            skippedDuplicates++;
          } else {
            assignments.push(assignment);
            seenIds.add(uniqueKey);
          }
        } else {
          // Check why it was skipped
          if (currentRow.toLowerCase().includes('wfd')) skippedWFD++;
          else if (currentRow.includes('\t')) skippedExpired++;
        }
      }
      currentRow = line;
    } else if (line.trim()) {
      // Continuation of previous row (AM/AC info on next line)
      currentRow += '\n' + line;
    }
  }

  // Process last row
  if (currentRow) {
    totalRows++;
    const assignment = parseAssignmentRow(currentRow);
    if (assignment) {
      const uniqueKey = `${assignment.candidate_id}-${assignment.job_id}`;
      if (!seenIds.has(uniqueKey)) {
        assignments.push(assignment);
        seenIds.add(uniqueKey);
      }
    }
  }

  console.log(`[Import Summary]
    Total rows processed: ${totalRows}
    ✓ Valid assignments: ${assignments.length}
      - Active: ${assignments.filter(a => !a.is_prestart).length}
      - Prestarts: ${assignments.filter(a => a.is_prestart).length}
    ⊗ Filtered out:
      - WFD facilities: ${skippedWFD}
      - Expired: ${skippedExpired}
      - Duplicates: ${skippedDuplicates}
  `);

  return assignments;
};

// ============================================================================
// IMPORT TO SUPABASE
// ============================================================================

export const importAssignmentsToSupabase = async (
  assignments: ParsedAssignment[]
): Promise<ImportResult> => {
  const result: ImportResult = {
    success: false,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (assignments.length === 0) {
    result.errors.push('No valid assignments to import');
    return result;
  }

  try {
    // Extract unique prospects and facilities
    const uniqueProspects = new Map<number, string>();
    const uniqueFacilities = new Set<string>();

    assignments.forEach(a => {
      uniqueProspects.set(a.candidate_id, a.candidate_name);
      uniqueFacilities.add(a.facility_name);
    });

    console.log(`[Import] Processing ${uniqueProspects.size} prospects, ${uniqueFacilities.size} facilities, ${assignments.length} engagements`);

    // Step 1: Upsert Prospects
    const prospectInserts = Array.from(uniqueProspects.entries()).map(([id, name]) => ({
      candidate_id: id,
      name: name,
      status: 'Contacted',
    }));

    const { error: prospectError } = await supabase
      .from('prospects')
      .upsert(prospectInserts, {
        onConflict: 'candidate_id',
        ignoreDuplicates: false,
      });

    if (prospectError) {
      result.errors.push(`Failed to insert prospects: ${prospectError.message}`);
      return result;
    }

    console.log(`[Import] ✓ Upserted ${prospectInserts.length} prospects`);

    // Step 2: Upsert Facilities
    const facilityInserts = Array.from(uniqueFacilities).map(name => ({
      name: name,
      city: 'Unknown',
      state: 'Unknown',
    }));

    const { error: facilityError } = await supabase
      .from('facilities')
      .upsert(facilityInserts, {
        onConflict: 'name',
        ignoreDuplicates: true,
      });

    if (facilityError) {
      result.errors.push(`Failed to insert facilities: ${facilityError.message}`);
      return result;
    }

    console.log(`[Import] ✓ Upserted ${facilityInserts.length} facilities`);

    // Step 3: Get facility IDs
    const { data: facilitiesData, error: facilityFetchError } = await supabase
      .from('facilities')
      .select('id, name')
      .in('name', Array.from(uniqueFacilities));

    if (facilityFetchError || !facilitiesData) {
      result.errors.push(`Failed to fetch facilities: ${facilityFetchError?.message}`);
      return result;
    }

    const facilityIdMap = new Map<string, number>();
    facilitiesData.forEach(f => facilityIdMap.set(f.name, f.id));

    // Step 4: Get prospect IDs
    const { data: prospectsData, error: prospectFetchError } = await supabase
      .from('prospects')
      .select('id, candidate_id')
      .in('candidate_id', Array.from(uniqueProspects.keys()));

    if (prospectFetchError || !prospectsData) {
      result.errors.push(`Failed to fetch prospects: ${prospectFetchError?.message}`);
      return result;
    }

    const prospectIdMap = new Map<number, number>();
    prospectsData.forEach(p => prospectIdMap.set(p.candidate_id, p.id));

    console.log(`[Import] ✓ Mapped ${prospectIdMap.size} prospect IDs`);

    // Step 5: Upsert Jobs
    const jobInserts = assignments.map(a => ({
      id: a.job_id,
      facility_id: facilityIdMap.get(a.facility_name)!,
      status: 'Filled',
      specialty: a.specialty || 'RN',
      shift: 'Days',
      hours_per_week: 36,
      start_date: a.start_date,
      duration_weeks: 13,
    }));

    const { error: jobError } = await supabase
      .from('jobs')
      .upsert(jobInserts, {
        onConflict: 'id',
        ignoreDuplicates: true,
      });

    if (jobError) {
      result.errors.push(`Failed to insert jobs: ${jobError.message}`);
      return result;
    }

    console.log(`[Import] ✓ Upserted ${jobInserts.length} jobs`);

    // Step 6: Insert Engagements
    // Validate that all prospects have been mapped
    const missingProspects = assignments.filter(a => !prospectIdMap.has(a.candidate_id));
    if (missingProspects.length > 0) {
      const missingIds = missingProspects.map(a => a.candidate_id).join(', ');
      result.errors.push(`Missing prospect IDs for candidate_ids: ${missingIds}`);
      return result;
    }

    const engagementInserts = assignments.map(a => ({
      prospect_id: prospectIdMap.get(a.candidate_id)!,
      job_id: a.job_id,
      status: 'Active',
      start_date: a.start_date,
      end_date: a.end_date,
      facility_name: a.facility_name,
      specialty: a.specialty,
      bill_rate: a.bill_rate,
      actual_margin: a.actual_margin,
      notes: a.notes,
      extension_stage: 'not_started',
      is_looking_for_new_facility: false,
      is_exiting: false,
    }));

    console.log(`[Import] Creating ${engagementInserts.length} engagement records...`);

    const { data: engagementsData, error: engagementError } = await supabase
      .from('engagements')
      .upsert(engagementInserts, {
        onConflict: 'prospect_id,job_id',
        ignoreDuplicates: true,
      })
      .select();

    if (engagementError) {
      result.errors.push(`Failed to insert engagements: ${engagementError.message}`);
      return result;
    }

    const importedCount = engagementsData?.length || 0;
    const skippedCount = assignments.length - importedCount;

    console.log(`[Import] ✓ Upserted ${importedCount} engagements (${skippedCount} duplicates skipped)`);

    if (importedCount === 0 && assignments.length > 0) {
      console.warn('[Import] ⚠️ No engagements were created! All were duplicates or failed constraints.');
    }

    result.success = true;
    result.imported = importedCount;
    result.skipped = skippedCount;

    return result;
  } catch (error) {
    console.error('[Import] Fatal error:', error);
    result.errors.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
};
