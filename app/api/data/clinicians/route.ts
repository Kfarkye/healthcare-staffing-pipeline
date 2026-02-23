/**
 * GET /api/data/clinicians
 *
 * Replaces direct Supabase queries in useClinicianDashboard.
 * Queries prospects_dashboard, submittals_dashboard, or active_assignments_dashboard.
 *
 * Query params:
 *   view  — required, one of the whitelisted views
 *   q     — optional, free text search
 *   limit — optional, default 200
 */

import { NextRequest } from "next/server";
import { db, json, error, searchParam, searchParamInt, validateView, safe } from "../_shared";

export const GET = safe(async (req: NextRequest) => {
    const view = searchParam(req, "view");
    if (!validateView(view)) {
        return error("Missing or invalid 'view' parameter", 400);
    }

    const q = searchParam(req, "q") || "";
    const limit = searchParamInt(req, "limit", 200);

    let query = db().from(view).select("*").limit(limit);

    // Server-side text search
    if (q.trim()) {
        const term = q.trim();
        query = query.or(
            `full_name.ilike.%${term}%,facility_name.ilike.%${term}%,location_city.ilike.%${term}%,location_state.ilike.%${term}%,raw_status.ilike.%${term}%,recruiter.ilike.%${term}%,job_id.ilike.%${term}%`
        );
    }

    const { data, error: queryError } = await query;
    if (queryError) {
        return error(queryError.message, 502);
    }

    return json({ rows: data || [], count: data?.length || 0 });
});
