import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../shared';
import { getActivePipeline } from '../../chat/command-center/lib/pipeline-queries';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/candidates — Active pipeline overview */
export async function GET(req: NextRequest) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const params = req.nextUrl.searchParams;
    const result = await getActivePipeline(sb, {
        specialty: params.get('specialty') || undefined,
        status: params.get('status') || 'all',
        available_within_days: params.get('available_within_days')
            ? Number(params.get('available_within_days'))
            : undefined,
    });

    if (!result.ok) return errorResponse(result.error);
    return jsonResponse(result);
}
