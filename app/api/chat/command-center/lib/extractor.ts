/**
 * ════════════════════════════════════════════════════════════════════════════════
 * EXTRACTOR — LLM Data Extraction (JSON Only)
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * The ONLY place where LLM generates content for email flows.
 * Output is always JSON. Never formatted text.
 *
 * @module lib/extractor
 * @version 1.0.0
 */

import { generateText } from 'ai';
import type { 
    PayPackageData, 
    NormalizedMessage,
    Result 
} from '../types/index';
import { MODEL_CONFIG } from './config';

// ════════════════════════════════════════════════════════════════════════════════
// Extraction Prompts
// ════════════════════════════════════════════════════════════════════════════════

const PAY_PACKAGE_EXTRACTION_PROMPT = `You are a data extraction agent. Extract structured data from the image.

OUTPUT: JSON object only. No markdown. No explanation. No other text.

SCHEMA:
{
    "candidateName": string | null,
    "candidateEmail": string | null,
    "facility": string | null,
    "location": string | null,
    "specialty": string | null,
    "startDate": string | null,
    "endDate": string | null,
    "shifts": string | null,
    "hoursPerWeek": string | null,
    "hourlyRate": string | null,
    "stipend": string | null,
    "weeklyTotal": string | null
}

RULES:
1. Extract EXACTLY what you see. Character by character.
2. For money, extract number only: "22.50" not "$22.50/hr"
3. For dates, use MM/DD/YYYY
4. If not visible, use null
5. Do not calculate or infer values

OUTPUT THE JSON OBJECT ONLY:`;

const CANDIDATE_EXTRACTION_PROMPT = `Extract candidate information from the text or image.

OUTPUT: JSON only.

{
    "candidateName": string | null,
    "candidateEmail": string | null,
    "novaId": string | null
}

Look for:
- Names (first and last)
- Email addresses
- Nova IDs (6-8 digit numbers)

OUTPUT JSON ONLY:`;

const LICENSING_EXTRACTION_PROMPT = `Extract licensing request details.

OUTPUT: JSON only.

{
    "specialty": string | null,
    "state": string | null
}

OUTPUT JSON ONLY:`;

// ════════════════════════════════════════════════════════════════════════════════
// Extraction Functions
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Parse JSON from LLM response
 */
function parseJson<T>(text: string): T | null {
    try {
        // Find JSON object in response
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        return JSON.parse(match[0]) as T;
    } catch {
        return null;
    }
}

/**
 * Create empty pay package data
 */
function emptyPayPackageData(): PayPackageData {
    return {
        candidateName: null,
        candidateEmail: null,
        facility: null,
        location: null,
        specialty: null,
        startDate: null,
        endDate: null,
        shifts: null,
        hoursPerWeek: null,
        hourlyRate: null,
        stipend: null,
        weeklyTotal: null,
    };
}

/**
 * Extract pay package data from image
 */
export async function extractPayPackageData(
    messages: NormalizedMessage[],
    googleClient: any
): Promise<Result<PayPackageData>> {
    try {
        const result = await generateText({
            model: googleClient(MODEL_CONFIG.primary, { 
                safetySettings: MODEL_CONFIG.safetySettings 
            }),
            system: PAY_PACKAGE_EXTRACTION_PROMPT,
            messages: messages as any,
            temperature: MODEL_CONFIG.extraction.temperature,
            maxRetries: MODEL_CONFIG.extraction.maxRetries,
        });

        const data = parseJson<PayPackageData>(result.text);
        
        if (!data) {
            return { 
                success: true, 
                data: emptyPayPackageData() 
            };
        }

        // Merge with defaults
        return {
            success: true,
            data: { ...emptyPayPackageData(), ...data },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * Extract candidate info from text
 */
export async function extractCandidateData(
    text: string,
    googleClient: any
): Promise<Result<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null }>> {
    try {
        const result = await generateText({
            model: googleClient(MODEL_CONFIG.primary, { 
                safetySettings: MODEL_CONFIG.safetySettings 
            }),
            system: CANDIDATE_EXTRACTION_PROMPT,
            messages: [{ role: 'user', content: text }],
            temperature: MODEL_CONFIG.extraction.temperature,
        });

        const data = parseJson<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null }>(result.text);
        
        return {
            success: true,
            data: data || { candidateName: null, candidateEmail: null, novaId: null },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * Extract candidate info from messages (supports images)
 */
export async function extractCandidateDataFromMessages(
    messages: NormalizedMessage[],
    googleClient: any
): Promise<Result<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null }>> {
    try {
        const result = await generateText({
            model: googleClient(MODEL_CONFIG.primary, { 
                safetySettings: MODEL_CONFIG.safetySettings 
            }),
            system: CANDIDATE_EXTRACTION_PROMPT,
            messages: messages as any,
            temperature: MODEL_CONFIG.extraction.temperature,
            maxRetries: MODEL_CONFIG.extraction.maxRetries,
        });

        const data = parseJson<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null }>(result.text);
        
        return {
            success: true,
            data: data || { candidateName: null, candidateEmail: null, novaId: null },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * Extract licensing request details
 */
export async function extractLicensingData(
    text: string,
    googleClient: any
): Promise<Result<{ specialty: string | null; state: string | null }>> {
    try {
        const result = await generateText({
            model: googleClient(MODEL_CONFIG.primary, { 
                safetySettings: MODEL_CONFIG.safetySettings 
            }),
            system: LICENSING_EXTRACTION_PROMPT,
            messages: [{ role: 'user', content: text }],
            temperature: MODEL_CONFIG.extraction.temperature,
        });

        const data = parseJson<{ specialty: string | null; state: string | null }>(result.text);
        
        return {
            success: true,
            data: data || { specialty: null, state: null },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * Simple regex-based extraction for common patterns
 * Used as fallback or for quick extraction without LLM
 */
export function extractWithRegex(text: string): Partial<PayPackageData> {
    const data: Partial<PayPackageData> = {};

    // Email
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) data.candidateEmail = emailMatch[1];

    // Money values
    const weeklyMatch = text.match(/\$?([\d,]+(?:\.\d{2})?)\s*\/?\s*(?:wk|week)/i);
    if (weeklyMatch) data.weeklyTotal = weeklyMatch[1].replace(/,/g, '');

    const hourlyMatch = text.match(/\$?([\d.]+)\s*\/?\s*(?:hr|hour)/i);
    if (hourlyMatch) data.hourlyRate = hourlyMatch[1];

    // Dates (MM/DD/YYYY)
    const dateMatches = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g);
    if (dateMatches && dateMatches.length >= 1) data.startDate = dateMatches[0];
    if (dateMatches && dateMatches.length >= 2) data.endDate = dateMatches[1];

    // Nova ID
    const novaMatch = text.match(/\b(\d{6,8})\b/);
    if (novaMatch) data.candidateName = novaMatch[1]; // Store as reference

    return data;
}
