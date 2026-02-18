import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../../shared';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/facilities/:id/openings — Current open jobs */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const { id } = await params;
    const { data, error } = await sb
        .from('jobs')
        .select('id, title, specialty, sub_specialty, shift, hours_per_week, start_date, duration_weeks, bill_rate, margin_target, status, slots, slots_filled')
        .eq('facility_id', id)
        .eq('status', 'open')
        .order('start_date', { ascending: true });

    if (error) return errorResponse(error.message);

    return jsonResponse({
        ok: true,
        facility_id: id,
        openings: data || [],
    });
}
