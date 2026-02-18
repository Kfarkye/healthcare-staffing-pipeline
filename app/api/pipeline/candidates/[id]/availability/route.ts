import { createPipelineClient, jsonResponse, missingEnvResponse } from '../../../shared';
import { getCandidateAvailability } from '../../../../chat/command-center/lib/pipeline-queries';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/candidates/:id/availability — License states, dates, preferences */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const { id } = await params;
    const result = await getCandidateAvailability(sb, id);

    return jsonResponse(result);
}
