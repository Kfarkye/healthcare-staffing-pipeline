import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../../shared';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/facilities/:id/candidates — Everyone who's ever worked there */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const { id } = await params;
    const { data, error } = await sb
        .from('assignments')
        .select('id, start_date, end_date, status, weekly_gross, would_rehire, end_reason, candidates(id, first_name, last_name, specialty, email, phone)')
        .eq('facility_id', id)
        .order('start_date', { ascending: false })
        .limit(50);

    if (error) return errorResponse(error.message);

    return jsonResponse({
        ok: true,
        facility_id: id,
        candidates: (data || []).map((a: any) => ({
            candidate: a.candidates ? `${a.candidates.first_name} ${a.candidates.last_name}` : 'Unknown',
            candidate_id: a.candidates?.id,
            specialty: a.candidates?.specialty,
            dates: `${a.start_date} → ${a.end_date || 'ongoing'}`,
            status: a.status,
            weekly_gross: a.weekly_gross ? Number(a.weekly_gross) : null,
            would_rehire: a.would_rehire,
        })),
    });
}
