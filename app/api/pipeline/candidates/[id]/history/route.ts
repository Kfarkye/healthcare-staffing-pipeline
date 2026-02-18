import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../../shared';
import { getCandidateHistory } from '../../../../chat/command-center/lib/pipeline-queries';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/candidates/:id/history — Full interaction history */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const { id } = await params;
    const result = await getCandidateHistory(sb, id);

    return jsonResponse(result);
}
