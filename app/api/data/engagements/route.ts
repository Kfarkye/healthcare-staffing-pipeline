/**
 * /api/data/engagements
 *
 * GET  — List engagements (replaces useEngagementsDashboard direct query)
 * POST — Promote engagement (replaces promote() in useClinicianDashboard)
 *
 * GET query params:
 *   q        — optional, free text search
 *   bucket   — optional, aging bucket filter
 *   page     — optional, default 0
 *   pageSize — optional, default 50
 */

import { NextRequest } from "next/server";
import { db, json, error, searchParam, searchParamInt, safe } from "../_shared";

export const GET = safe(async (req: NextRequest) => {
    const q = searchParam(req, "q") || "";
    const bucket = searchParam(req, "bucket") || "ALL";
    const page = searchParamInt(req, "page", 0);
    const pageSize = searchParamInt(req, "pageSize", 50);

    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = db()
        .from("engagements_dashboard")
        .select("*", { count: "exact" })
        .order("stage_rank", { ascending: false })
        .order("submitted_at", { ascending: true, nullsFirst: true })
        .range(from, to);

    if (bucket !== "ALL") {
        query = query.eq("aging_bucket", bucket);
    }

    const { data, error: queryError, count } = await query;
    if (queryError) {
        return error(queryError.message, 502);
    }

    // Server-side text filter
    let rows = data || [];
    if (q.trim()) {
        const term = q.trim().toLowerCase();
        rows = rows.filter((r: any) =>
            [
                r.full_name,
                r.facility_name,
                r.specialty,
                r.location_city,
                r.location_state,
                r.raw_status,
                r.recruiter,
                r.job_id,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(term)
        );
    }

    const total = count ?? rows.length;
    const hasMore = to + 1 < total;

    return json({ rows, count: total, hasMore });
});

export const POST = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { action, engagementId, nextStage } = body;

    if (action !== "promote") {
        return error("Unknown action. Expected 'promote'.", 400);
    }

    if (!engagementId || !nextStage) {
        return error("Missing engagementId or nextStage", 400);
    }

    const { error: updateError } = await db()
        .from("engagements")
        .update({
            stage: nextStage,
            is_current: true,
            updated_at: new Date().toISOString(),
        })
        .eq("id", engagementId);

    if (updateError) {
        return error(updateError.message, 502);
    }

    return json({ success: true });
});
