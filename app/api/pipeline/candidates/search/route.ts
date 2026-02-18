import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../shared';
import { searchCandidates } from '../../../chat/command-center/lib/pipeline-queries';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/candidates/search — Query by specialty, location, availability */
export async function GET(req: NextRequest) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const p = req.nextUrl.searchParams;
    const result = await searchCandidates(sb, {
        specialty: p.get('specialty') || undefined,
        license_state: p.get('license_state') || undefined,
        available_before: p.get('available_before') || undefined,
        certification: p.get('certification') || undefined,
        preferred_location: p.get('preferred_location') || undefined,
        has_compact: p.get('has_compact') === 'true' ? true : undefined,
        limit: p.get('limit') ? Number(p.get('limit')) : undefined,
    });

    if (!result.ok) return errorResponse(result.error);
    return jsonResponse(result);
}
