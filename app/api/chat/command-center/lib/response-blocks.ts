/**
 * ════════════════════════════════════════════════════════════════════════════════
 * RESPONSE BLOCKS — Structured response emission helpers
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Emit tagged JSON blocks that the frontend extracts and renders as rich
 * components (CandidateCard, PipelineTable, LicensureCard, PayPackageCard).
 *
 * Wire format:
 *   [RESPONSE_BLOCK:<kind>]{...json...}[/RESPONSE_BLOCK]
 *
 * The AI writes prose. These helpers append structured blocks alongside it.
 *
 * @module lib/response-blocks
 * @version 1.0.0
 */

import type {
    CandidateCardData,
    PipelineTableData,
    LicensureCardData,
    PayPackageCardData,
    CitationData,
} from '../types/index';

// ════════════════════════════════════════════════════════════════════════════════
// Core emitter
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Serialize a response block into the tagged wire format.
 */
export function emitBlock(kind: string, data: object): string {
    return `\n[RESPONSE_BLOCK:${kind}]${JSON.stringify(data)}[/RESPONSE_BLOCK]\n`;
}

// ════════════════════════════════════════════════════════════════════════════════
// Typed emitters
// ════════════════════════════════════════════════════════════════════════════════

export function emitCandidateCard(data: CandidateCardData): string {
    return emitBlock('candidate_card', data);
}

export function emitPipelineTable(data: PipelineTableData): string {
    return emitBlock('pipeline_table', data);
}

export function emitLicensureCard(data: LicensureCardData): string {
    return emitBlock('licensure_card', data);
}

export function emitPayPackageCard(data: PayPackageCardData): string {
    return emitBlock('pay_package_card', data);
}

export function emitCitations(citations: CitationData[]): string {
    return emitBlock('citation_set', citations);
}

// ════════════════════════════════════════════════════════════════════════════════
// Prospect → CandidateCardData mapping (single source of truth)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Map a raw prospect/match record to CandidateCardData.
 * Used by emitFromLookupResult, and directly by handleChatIntent for
 * add_candidate / update_candidate tool results.
 */
export function prospectToCardData(p: any): CandidateCardData {
    return {
        candidate_id: p.candidate_id ?? p.id,
        name: p.name,
        email: p.email ?? null,
        phone: p.phone ?? null,
        specialty: p.specialty ?? null,
        profession: p.profession ?? null,
        home_state: p.home_state ?? null,
        status: p.status ?? 'Unknown',
        nova_url: p.nova_url ?? null,
        recruiter: p.recruiter ?? null,
        licenses: p.licenses ?? [],
        engagement_level: p.engagement_level ?? null,
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// Tool result → block mapping
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Given a tool result from lookup_candidate, emit the appropriate block(s).
 * Single match → CandidateCard. Multiple → PipelineTable.
 */
export function emitFromLookupResult(result: any): string {
    if (!result?.ok || !result?.matches?.length) return '';

    if (result.matches.length === 1) {
        return emitCandidateCard(prospectToCardData(result.matches[0]));
    }

    const columns = ['Name', 'Specialty', 'Status', 'State', 'Email'];
    const rows = result.matches.map((m: any) => ({
        Name: m.name,
        Specialty: m.specialty ?? '',
        Status: m.status ?? '',
        State: m.home_state ?? '',
        Email: m.email ?? '',
    }));

    return emitPipelineTable({
        title: `${result.matches.length} Candidates Found`,
        columns,
        rows,
        source_table: 'prospects',
    });
}
