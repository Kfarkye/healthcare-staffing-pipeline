import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../shared';
import { getActivePipeline } from '../../../chat/command-center/lib/pipeline-queries';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/submittals/active — All pending submittals */
export async function GET() {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const result = await getActivePipeline(sb, { status: 'active' });
    if (!result.ok) return errorResponse(result.error);
    return jsonResponse(result);
}
