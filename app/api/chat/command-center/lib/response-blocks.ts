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
// Tool result → block mapping
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Given a tool result from lookup_candidate, emit the appropriate block(s).
 * Single match → CandidateCard. Multiple → PipelineTable.
 */
export function emitFromLookupResult(result: any): string {
    if (!result?.ok || !result?.matches?.length) return '';

    if (result.matches.length === 1) {
        const m = result.matches[0];
        return emitCandidateCard({
            candidate_id: m.candidate_id,
            name: m.name,
            email: m.email ?? null,
            phone: m.phone ?? null,
            specialty: m.specialty ?? null,
            profession: m.profession ?? null,
            home_state: m.home_state ?? null,
            status: m.status ?? 'Unknown',
            nova_url: m.nova_url ?? null,
            recruiter: m.recruiter ?? null,
            licenses: m.licenses ?? [],
            engagement_level: m.engagement_level ?? null,
        });
    }

    const columns = ['Name', 'Status', 'Specialty', 'Email'];
    const rows = result.matches.map((m: any) => ({
        Name: m.name,
        Status: m.status ?? '',
        Specialty: m.specialty ?? '',
        Email: m.email ?? '',
    }));

    return emitPipelineTable({
        title: `${result.matches.length} Candidates Found`,
        columns,
        rows,
        source_table: 'prospects',
    });
}
