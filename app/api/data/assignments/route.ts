/**
 * GET /api/data/assignments
 *
 * Replaces fetchActiveAssignments in src/lib/supabase/assignments.ts.
 * Queries active_assignments_dashboard view.
 *
 * Query params:
 *   search  — optional, client-side text filter
 *   stage   — optional, extension_stage filter
 *   weekMin — optional, days_to_end minimum
 *   weekMax — optional, days_to_end maximum
 *   looking — optional, is_looking_for_new_facility filter
 *   exiting — optional, is_exiting filter
 */

import { NextRequest } from "next/server";
import { db, json, error, searchParam, searchParamInt, searchParamBool, safe } from "../_shared";

export const GET = safe(async (req: NextRequest) => {
    let query = db()
        .from("active_assignments_dashboard")
        .select("*")
        .order("days_to_end", { ascending: true });

    const stage = searchParam(req, "stage");
    if (stage) {
        query = query.eq("extension_stage", stage);
    }

    const weekMin = searchParamInt(req, "weekMin", -1);
    const weekMax = searchParamInt(req, "weekMax", -1);
    if (weekMin >= 0 && weekMax >= 0) {
        query = query.gte("days_to_end", weekMin).lte("days_to_end", weekMax);
    }

    const looking = searchParamBool(req, "looking");
    if (looking === true) {
        query = query.eq("is_looking_for_new_facility", true);
    }

    const exiting = searchParamBool(req, "exiting");
    if (exiting === true) {
        query = query.eq("is_exiting", true);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
        return error(queryError.message, 502);
    }

    // Client-side search filter
    let rows = data || [];
    const search = searchParam(req, "search");
    if (search && search.trim()) {
        const term = search.toLowerCase();
        rows = rows.filter(
            (a: any) =>
                a.candidate_name?.toLowerCase().includes(term) ||
                a.facility_name?.toLowerCase().includes(term) ||
                a.specialty?.toLowerCase().includes(term)
        );
    }

    return json({ rows });
});
