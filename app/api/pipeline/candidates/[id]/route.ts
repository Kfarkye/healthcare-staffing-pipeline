import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../shared';
import { getCandidateProfile } from '../../../chat/command-center/lib/pipeline-queries';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/candidates/:id — Full candidate page (the URL) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const { id } = await params;
    const result = await getCandidateProfile(sb, id);

    if (!result.ok) return errorResponse(result.error, result.error === 'Candidate not found' ? 404 : 500);
    return jsonResponse(result.candidate);
}
