import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../shared';
import { getStaleSubmittals } from '../../../chat/command-center/lib/pipeline-queries';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/submittals/needs-followup — Stale submittals (48h+ default) */
export async function GET(req: NextRequest) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const hours = Number(req.nextUrl.searchParams.get('hours') || 48);
    const result = await getStaleSubmittals(sb, hours);

    if (!result.ok) return errorResponse(result.error);
    return jsonResponse(result);
}
