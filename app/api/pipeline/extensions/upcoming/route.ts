import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../shared';
import { getUpcomingExtensions } from '../../../chat/command-center/lib/pipeline-queries';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/extensions/upcoming — Assignments ending within 30 days */
export async function GET(req: NextRequest) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const days = Number(req.nextUrl.searchParams.get('days') || 30);
    const result = await getUpcomingExtensions(sb, days);

    if (!result.ok) return errorResponse(result.error);
    return jsonResponse(result);
}
