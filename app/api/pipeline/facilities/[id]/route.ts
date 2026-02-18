import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../shared';
import { getFacilityProfile } from '../../../chat/command-center/lib/pipeline-queries';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/facilities/:id — Full facility page */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const { id } = await params;
    const result = await getFacilityProfile(sb, id);

    if (!result.ok) return errorResponse(result.error, result.error === 'Facility not found' ? 404 : 500);
    return jsonResponse(result.facility);
}
