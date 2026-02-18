import { createPipelineClient, jsonResponse, errorResponse, missingEnvResponse } from '../../shared';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/pipeline/contact-log/recent — Last 24h of contacts */
export async function GET(req: NextRequest) {
    const sb = createPipelineClient();
    if (!sb) return missingEnvResponse();

    const hours = Number(req.nextUrl.searchParams.get('hours') || 24);
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();

    const { data, error } = await sb
        .from('contact_log')
        .select('id, candidate_id, channel, direction, subject, body_preview, outcome, contacted_at, candidates(first_name, last_name)')
        .gte('contacted_at', since)
        .order('contacted_at', { ascending: false })
        .limit(100);

    if (error) return errorResponse(error.message);

    return jsonResponse({
        ok: true,
        since,
        contacts: (data || []).map((c: any) => ({
            id: c.id,
            candidate: c.candidates ? `${c.candidates.first_name} ${c.candidates.last_name}` : 'Unknown',
            candidate_id: c.candidate_id,
            channel: c.channel,
            direction: c.direction,
            subject: c.subject,
            preview: c.body_preview,
            outcome: c.outcome,
            contacted_at: c.contacted_at,
        })),
    });
}
