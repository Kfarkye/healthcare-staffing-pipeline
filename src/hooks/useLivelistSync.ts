import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Type Definitions
interface Job {
  job_id: string;
  facility_name: string;
  current_status_text: string;
  start_date?: string;
  status_note?: string;
}

interface ExtractedCandidate {
  candidate_name: string;
  specialty: string;
  candidate_id: string;
  jobs: Job[];
}

type EngagementStatus = 'Offer Extended' | 'Extension Request Sent' | 'Needs New Role' | 'Active' | 'Prospect' | 'Submitted' | 'Closed' | 'Interested' | null;

interface SyncResults {
    operationsCount: number;
    errorCount: number;
    totalCandidates: number;
}

const LIVELIST_EXTRACTION_PROMPT = `You are a highly specialized AI assistant that parses complex HTML from the Nova Live List application. Your task is to analyze the provided HTML source and extract candidate and all their associated jobs into a structured JSON array, correctly grouping all jobs under the appropriate candidate.

**CRITICAL INSTRUCTIONS FOR GROUPING:**
1.  A new candidate's record begins with a table row ("<tr class="k-master-row">") that contains the candidate's name in the first column ("<td>").
2.  Any subsequent rows that have an EMPTY first column but contain job or submittal information in other columns BELONG TO THE PREVIOUSLY IDENTIFIED CANDIDATE.
3.  You must aggregate all jobs found across these related rows into a single "jobs" array for that one candidate.

**Extraction Details:**
-   **candidate_name**: Found within an "<a>" tag in the first "<td>" of a starting row.
-   **profile_href**: From that same "<a>" tag, extract the value of the "href" attribute.
-   **candidate_id**: This is the numerical ID found within the profile_href. For example, in "/recruiting/profile/12345", the ID is "12345". Extract this number.
-   **specialty**: Found in the same starting row, labeled with "Expertise:".
-   **For each job/submittal found:**
    -   **job_id**: Find the Job ID (e.g., "3014168").
    -   **facility_name**: Find the facility name.
    -   **start_date**: Find the "Start Date" from the corresponding column. Return in "YYYY-MM-DD" format. If not present, return null.
    -   **current_status_text**: Your PRIMARY source for this is the text inside the "<span>" with attribute "data-qa-id="submittalStatusName"".
    -   **status_note**: If the status text is 'Pending Information', look for an accompanying note in the 'AM Note' column and extract its full text. If there's no note, this can be null.
-   **IMPORTANT:** If a candidate is present but has no jobs, you MUST still include them with their candidate_id and an empty "jobs" array ("[]").

Return ONLY the JSON array. Adhere strictly to the specified nested structure.`;

const translateStatus = (rawStatus: string): EngagementStatus => {
  if (!rawStatus) return null;
  const lowerCaseStatus = rawStatus.toLowerCase().trim();
  if (lowerCaseStatus.includes('offer')) return 'Offer Extended';
  if (lowerCaseStatus.includes('extension req')) return 'Extension Request Sent';
  if (lowerCaseStatus.includes('active - end') || lowerCaseStatus.includes('ending soon')) return 'Needs New Role';
  if (lowerCaseStatus.includes('prospect')) return 'Prospect';
  if (lowerCaseStatus.includes('not selected')) return 'Closed';
  if (lowerCaseStatus.includes('pending am review') || lowerCaseStatus.includes('sent to client') || lowerCaseStatus.includes('pending information') || lowerCaseStatus.includes('queued') || lowerCaseStatus.includes('active') || lowerCaseStatus.includes('submitted') || lowerCaseStatus.includes('reviewing')) {
    return 'Submitted';
  }
  return 'Submitted';
};

interface UseLivelistSyncProps {
  onNotification?: (message: string, type: 'success' | 'error' | 'info') => void;
  onSyncComplete?: () => void;
}

export const useLivelistSync = ({ onNotification, onSyncComplete }: UseLivelistSyncProps = {}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncResults, setSyncResults] = useState<SyncResults | null>(null);
  const [showResultsScreen, setShowResultsScreen] = useState<boolean>(false);

  const startSync = useCallback(async () => {
    let htmlToProcess = '';
    try {
      htmlToProcess = await navigator.clipboard.readText();
      if (!htmlToProcess || !htmlToProcess.includes('nova-grid')) {
        onNotification?.('HTML for Livelist not found in clipboard.', 'error');
        return;
      }
    } catch (err) {
      onNotification?.('Could not read from clipboard. Please allow access.', 'error');
      return;
    }

    setIsLoading(true);
    setShowResultsScreen(false);
    setSyncResults(null);
    setSyncProgress(0);

    let extractedData: ExtractedCandidate[] = [];
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlToProcess, "text/html");
        const tableBody = doc.querySelector('tbody[kendogridtablebody]');
        if (!tableBody) throw new Error("Could not find candidate table in HTML.");
        const cleanHtml = tableBody.outerHTML;
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("API key not configured.");
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: LIVELIST_EXTRACTION_PROMPT }, { text: cleanHtml }] }], generationConfig: { response_mime_type: "application/json", temperature: 0.1 } };
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error('AI service communication failed.');
        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        extractedData = JSON.parse(textResponse);
        if (!Array.isArray(extractedData)) throw new Error('AI did not return a valid list.');
        onNotification?.(`Extraction complete. Syncing ${extractedData.length} candidates...`, 'info');
    } catch (err: any) {
        onNotification?.(err.message || 'Extraction error.', 'error');
        setIsLoading(false);
        return;
    }

    setIsLoading(false);
    setIsSyncing(true);
    
    let operationsCount = 0;
    let errorCount = 0;

    for (const [index, candidate] of extractedData.entries()) {
        let prospectHasError = false;

        // --- NEW LOGIC: Determine the most advanced status for the prospect ---
        let bestProspectStatus: EngagementStatus = 'Prospect';
        const statusHierarchy: EngagementStatus[] = ['Offer Extended', 'Submitted', 'Prospect'];

        if (candidate.jobs && candidate.jobs.length > 0) {
            for (const job of candidate.jobs) {
                const currentJobStatus = translateStatus(job.current_status_text);
                const currentIndex = statusHierarchy.indexOf(currentJobStatus);
                const bestIndex = statusHierarchy.indexOf(bestProspectStatus);
                if (currentIndex !== -1 && currentIndex < bestIndex) {
                    bestProspectStatus = currentJobStatus;
                }
            }
        }
        
        // Map 'Offer Extended' to 'Interested' for the prospect board
        if (bestProspectStatus === 'Offer Extended') {
            bestProspectStatus = 'Interested'; 
        }

        // 1. Prepare and upsert data for the 'prospects' table
        const prospectData = {
            candidate_id: candidate.candidate_id,
            name: candidate.candidate_name,
            specialty: candidate.specialty,
            status: bestProspectStatus, // The crucial update
            available_start_date: candidate.jobs[0]?.start_date,
        };

        const { error: prospectError } = await supabase
            .from('prospects')
            .upsert(prospectData, { onConflict: 'candidate_id' });
        
        if (prospectError) {
            errorCount++;
            prospectHasError = true;
            console.error(`Error syncing prospect ${candidate.name}:`, prospectError);
        } else {
            operationsCount++;
        }

        // 2. Loop through jobs again to update individual engagements
        if (!prospectHasError && candidate.jobs && candidate.jobs.length > 0) {
            for (const job of candidate.jobs) {
                const engagementStatus = translateStatus(job.current_status_text);
                if (!engagementStatus || !job.job_id || !candidate.candidate_id) continue;
                
                const engagementData = {
                    candidate_id: candidate.candidate_id,
                    job_id: job.job_id,
                    status: engagementStatus,
                    facility_name: job.facility_name,
                    candidate_name: candidate.candidate_name,
                    specialty: candidate.specialty
                };

                const { error: engagementError } = await supabase
                    .from('engagements')
                    .upsert(engagementData, { onConflict: 'candidate_id,job_id' });
                
                if (engagementError) {
                    errorCount++;
                    console.error(`Error syncing engagement for ${candidate.name}:`, engagementError);
                } else {
                    operationsCount++;
                }
            }
        }
        setSyncProgress(((index + 1) / extractedData.length) * 100);
    }
    
    setSyncResults({ operationsCount, errorCount, totalCandidates: extractedData.length });
    setIsSyncing(false);
    setShowResultsScreen(true);
    
    if (onSyncComplete) {
      onSyncComplete();
    }
  }, [onNotification, onSyncComplete]);

  const resetSync = useCallback(() => {
    setShowResultsScreen(false);
    setSyncResults(null);
    setSyncProgress(0);
  }, []);

  return {
    startSync,
    resetSync,
    isLoading,
    isSyncing,
    syncProgress,
    syncResults,
    showResultsScreen,
  };
};