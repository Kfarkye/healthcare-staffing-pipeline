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
    MarginApprovalData,
    NormalizedMessage,
    Result,
    Logger,
    IntentType,
} from '../types/index';
import { MODEL_CONFIG } from './config';
import {
    logModelSelected,
    logModelResponseReceived,
    logModelResponseError,
} from './model-logging';

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
    "novaId": string | null,
    "novaUrl": string | null
}

Look for:
- Names (first and last)
- Email addresses
- Nova IDs (6-8 digit numbers)
- Full Nova URLs (look in the browser URL bar or any visible link text)

Rules:
1. If you see a Nova URL, return it exactly in novaUrl.
2. If you see a Nova ID in a URL like "/candidates/1234567", return "1234567" in novaId.
3. If both are present, return both.
4. Do NOT guess. Use null if not visible.

OUTPUT JSON ONLY:`;

const CANDIDATE_NAME_ONLY_PROMPT = `Extract the candidate's FULL NAME from the text or image.

OUTPUT: JSON only.

{
    "candidateName": string | null
}

Rules:
1. Return the full name exactly as seen (first + last, include middle/second last if present).
2. Do NOT infer or guess. Use null if not visible.
3. Ignore labels, IDs, emails, and job details.

OUTPUT JSON ONLY:`;

const LICENSING_EXTRACTION_PROMPT = `Extract licensing request details.

OUTPUT: JSON only.

{
    "specialty": string | null,
    "state": string | null
}

OUTPUT JSON ONLY:`;

const NOVA_LINK_EXTRACTION_PROMPT = `Extract Nova link information from the image.

OUTPUT: JSON only.

{
    "novaUrl": string | null,
    "novaId": string | null
}

Look for:
- Full Nova URLs in the browser address bar
- Candidate IDs in paths like "/recruiting/candidates/1234567"

Rules:
1. If you see a Nova URL, return it exactly in novaUrl.
2. If you see an ID, return the digits only in novaId.
3. If both are present, return both.
4. If not visible, use null.

OUTPUT JSON ONLY:`;

const MARGIN_APPROVAL_EXTRACTION_PROMPT = `Extract margin approval details from the image.

OUTPUT: JSON only.

{
    "candidateName": string | null,
    "marginPercentage": string | null,
    "reason": string | null,
    "placementType": string | null,
    "premiumNeeded": string | null,
    "sentToComp": string | null,
    "approverEmail": string | null,
    "novaUrl": string | null,
    "facility": string | null,
    "why": string | null,
    "distroResponse": string | null
}

Look for:
- "Margin Approval: Name - 13.75%" style headers
- "Actual Margin" percentage
- Reason needed for approval
- Placement type (New Placement / Extension / Change of Contract)
- Premium approval needed (Y/N)
- Sent to Comp Info (Y/N)
- Distro response (if present)
- Nova or facility links

Rules:
1. Extract EXACTLY what you see.
2. Return percentages without % symbol (e.g., "13.75").
3. For Y/N fields, return "Y" or "N" if visible.
4. If not visible, use null.

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
        requirements: [],
    };
}

function emptyMarginApprovalData(): MarginApprovalData {
    return {
        candidateName: null,
        marginPercentage: null,
        reason: null,
        placementType: null,
        premiumNeeded: null,
        sentToComp: null,
        approverEmail: null,
        novaUrl: null,
        facility: null,
        why: null,
        distroResponse: null,
    };
}

interface LLMLogContext {
    logger?: Logger;
    traceId?: string;
    intent?: IntentType | string;
    isFallback?: boolean;
    primaryModel?: string;
    reason?: string;
}

async function generateTextWithModelLogging(
    googleClient: any,
    request: {
        system: string;
        messages: any;
        temperature: number;
        maxRetries?: number;
    },
    logContext?: LLMLogContext
) {
    const modelName = MODEL_CONFIG.primary;
    const selection = logModelSelected({
        logger: logContext?.logger,
        traceId: logContext?.traceId,
        model: modelName,
        intent: logContext?.intent,
        isFallback: logContext?.isFallback ?? false,
        primaryModel: logContext?.primaryModel,
        reason: logContext?.reason ?? 'primary',
    });

    try {
        const result = await generateText({
            model: googleClient(modelName, {
                safetySettings: MODEL_CONFIG.safetySettings
            }),
            system: request.system,
            messages: request.messages,
            temperature: request.temperature,
            maxRetries: request.maxRetries,
        });
        logModelResponseReceived(selection, result);
        return result;
    } catch (error) {
        logModelResponseError(selection, error);
        throw error;
    }
}

/**
 * Extract pay package data from image
 */
export async function extractPayPackageData(
    messages: NormalizedMessage[],
    googleClient: any,
    logContext?: LLMLogContext
): Promise<Result<PayPackageData>> {
    try {
        const result = await generateTextWithModelLogging(
            googleClient,
            {
                system: PAY_PACKAGE_EXTRACTION_PROMPT,
                messages: messages as any,
                temperature: MODEL_CONFIG.extraction.temperature,
                maxRetries: MODEL_CONFIG.extraction.maxRetries,
            },
            logContext
        );

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
    googleClient: any,
    logContext?: LLMLogContext
): Promise<Result<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null; novaUrl: string | null }>> {
    try {
        const result = await generateTextWithModelLogging(
            googleClient,
            {
                system: CANDIDATE_EXTRACTION_PROMPT,
                messages: [{ role: 'user', content: text }],
                temperature: MODEL_CONFIG.extraction.temperature,
            },
            logContext
        );

        const data = parseJson<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null; novaUrl?: string | null; nova_url?: string | null }>(result.text);
        const normalized = data
            ? {
                  candidateName: data.candidateName ?? null,
                  candidateEmail: data.candidateEmail ?? null,
                  novaId: data.novaId ?? null,
                  novaUrl: data.novaUrl ?? (data as any).nova_url ?? null,
              }
            : null;
        
        return {
            success: true,
            data: normalized || { candidateName: null, candidateEmail: null, novaId: null, novaUrl: null },
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
    googleClient: any,
    logContext?: LLMLogContext
): Promise<Result<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null; novaUrl: string | null }>> {
    try {
        const result = await generateTextWithModelLogging(
            googleClient,
            {
                system: CANDIDATE_EXTRACTION_PROMPT,
                messages: messages as any,
                temperature: MODEL_CONFIG.extraction.temperature,
                maxRetries: MODEL_CONFIG.extraction.maxRetries,
            },
            logContext
        );

        const data = parseJson<{ candidateName: string | null; candidateEmail: string | null; novaId: string | null; novaUrl?: string | null; nova_url?: string | null }>(result.text);
        const normalized = data
            ? {
                  candidateName: data.candidateName ?? null,
                  candidateEmail: data.candidateEmail ?? null,
                  novaId: data.novaId ?? null,
                  novaUrl: data.novaUrl ?? (data as any).nova_url ?? null,
              }
            : null;
        
        return {
            success: true,
            data: normalized || { candidateName: null, candidateEmail: null, novaId: null, novaUrl: null },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * Extract margin approval data from images
 */
export async function extractMarginApprovalDataFromMessages(
    messages: NormalizedMessage[],
    googleClient: any,
    logContext?: LLMLogContext
): Promise<Result<MarginApprovalData>> {
    try {
        const result = await generateTextWithModelLogging(
            googleClient,
            {
                system: MARGIN_APPROVAL_EXTRACTION_PROMPT,
                messages: messages as any,
                temperature: MODEL_CONFIG.extraction.temperature,
                maxRetries: MODEL_CONFIG.extraction.maxRetries,
            },
            logContext
        );

        const data = parseJson<MarginApprovalData>(result.text);

        if (!data) {
            return {
                success: true,
                data: emptyMarginApprovalData(),
            };
        }

        return {
            success: true,
            data: { ...emptyMarginApprovalData(), ...data },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * Extract candidate name only from messages (name-focused prompt).
 */
export async function extractCandidateNameFromMessages(
    messages: NormalizedMessage[],
    googleClient: any,
    logContext?: LLMLogContext
): Promise<Result<{ candidateName: string | null }>> {
    try {
        const result = await generateTextWithModelLogging(
            googleClient,
            {
                system: CANDIDATE_NAME_ONLY_PROMPT,
                messages: messages as any,
                temperature: MODEL_CONFIG.extraction.temperature,
                maxRetries: MODEL_CONFIG.extraction.maxRetries,
            },
            logContext
        );

        const data = parseJson<{ candidateName: string | null }>(result.text);
        return {
            success: true,
            data: data || { candidateName: null },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * Extract Nova URL/ID from messages (fast fallback)
 */
export async function extractNovaLinkFromMessages(
    messages: NormalizedMessage[],
    googleClient: any,
    logContext?: LLMLogContext
): Promise<Result<{ novaUrl: string | null; novaId: string | null }>> {
    try {
        const result = await generateTextWithModelLogging(
            googleClient,
            {
                system: NOVA_LINK_EXTRACTION_PROMPT,
                messages: messages as any,
                temperature: 0,
                maxRetries: 1,
            },
            logContext
        );

        const data = parseJson<{ novaUrl?: string | null; nova_url?: string | null; novaId?: string | null }>(result.text);
        const normalized = data
            ? {
                  novaUrl: data.novaUrl ?? (data as any).nova_url ?? null,
                  novaId: data.novaId ?? null,
              }
            : null;

        return {
            success: true,
            data: normalized || { novaUrl: null, novaId: null },
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
    googleClient: any,
    logContext?: LLMLogContext
): Promise<Result<{ specialty: string | null; state: string | null }>> {
    try {
        const result = await generateTextWithModelLogging(
            googleClient,
            {
                system: LICENSING_EXTRACTION_PROMPT,
                messages: [{ role: 'user', content: text }],
                temperature: MODEL_CONFIG.extraction.temperature,
            },
            logContext
        );

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

    return data;
}

/**
 * Extract margin approval fields from text (fallback/fast path)
 */
export function extractMarginApprovalFromText(text: string): Partial<MarginApprovalData> {
    const data: Partial<MarginApprovalData> = {};
    if (!text) return data;

    const subjectMatch = text.match(/margin approval[:\s-]+([a-z][a-z\s.'-]+?)\s*[-–]\s*([0-9.]+)\s*%/i);
    if (subjectMatch) {
        data.candidateName = subjectMatch[1].trim();
        data.marginPercentage = subjectMatch[2].trim();
    }

    const marginMatch = text.match(/\b(actual\s+margin|margin)\s*[:\-]?\s*([0-9.]+)\s*%/i);
    if (marginMatch && !data.marginPercentage) {
        data.marginPercentage = marginMatch[2].trim();
    }

    const reasonMatch = text.match(/reason needed for approval\??\s*[:\-]?\s*(.+)/i);
    if (reasonMatch?.[1]) data.reason = reasonMatch[1].trim();

    const placementMatch = text.match(/new placement,\s*extension,\s*or change of contract\??\s*[:\-]?\s*(.+)/i);
    if (placementMatch?.[1]) data.placementType = placementMatch[1].trim();

    const premiumMatch = text.match(/premium approval needed\??\s*[:\-]?\s*(.+)/i);
    if (premiumMatch?.[1]) data.premiumNeeded = premiumMatch[1].trim();

    const whyMatch = text.match(/\bwhy\?\s*[:\-]?\s*(.+)/i);
    if (whyMatch?.[1]) data.why = whyMatch[1].trim();

    const compMatch = text.match(/sent to comp info\s*\(y\/n\)\??\s*[:\-]?\s*(.+)/i);
    if (compMatch?.[1]) data.sentToComp = compMatch[1].trim();

    const distroMatch = text.match(/distro response\??\s*[:\-]?\s*(.+)/i);
    if (distroMatch?.[1]) data.distroResponse = distroMatch[1].trim();

    const novaUrlMatch = text.match(/https?:\/\/\S*nova\.ayahealthcare\.com\/\S+/i);
    if (novaUrlMatch?.[0]) data.novaUrl = novaUrlMatch[0];

    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch?.[1]) data.approverEmail = emailMatch[1];

    return data;
}

/**
 * Extract requirement/notes lines from freeform text for pay package drafts.
 * This ensures typed offer details are not lost when image extraction is thin.
 */
export function extractPayPackageNotesFromText(text: string): string[] {
    if (!text) return [];

    const cleaned = text
        // remove markdown attachment links
        .replace(/\[📎[^\]]+\]\([^)]+\)/g, '')
        // remove common "image.png" attachment lines
        .replace(/\bimage\.png\b/gi, '')
        .replace(/\u00a0/g, ' ');

    const rawLines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return [];

    const shouldIgnore = (line: string): boolean => {
        return /^(draft|pp|pay package|outreach|draft pp|draft pay package|please draft)\b/i.test(line);
    };

    const isRequirementLine = (line: string): boolean => {
        return (
            /(must|required|requirement|will accept|preferred|call requirement|weekend requirement|float requirement|client offer description|submit info|shift:|hours:|guaranteed hours|start|rnfa|stfa|csfa|cvor|evh|vein harvest|endoscopically|cardiac)/i.test(line)
        );
    };

    const splitCompound = (line: string): string[] => {
        return line
            .replace(/\s+(Call Requirement:)/ig, '\n$1')
            .replace(/\s+(Weekend Requirement:)/ig, '\n$1')
            .replace(/\s+(Float Requirement:)/ig, '\n$1')
            .replace(/\s+(Other requirements:)/ig, '\n$1')
            .replace(/\s+(Guaranteed Hours per Week:)/ig, '\n$1')
            .replace(/\s+(Shift:)/ig, '\n$1')
            .replace(/\s+(Hours:)/ig, '\n$1')
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);
    };

    const seen = new Set<string>();
    const results: string[] = [];

    for (const line of rawLines) {
        if (shouldIgnore(line)) continue;
        const segments = splitCompound(line);
        for (const segment of segments) {
            if (!segment) continue;
            if (!isRequirementLine(segment)) continue;
            const key = segment.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(segment);
        }
    }

    return results;
}
