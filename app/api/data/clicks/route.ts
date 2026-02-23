/**
 * /api/data/clicks
 *
 * GET   — List clicks or get candidate history (replaces DataService.getClicks + getCandidateHistory)
 * PATCH — Update a click (replaces DataService.updateClick)
 *
 * GET query params:
 *   email   — optional, if provided along with history=true, returns candidate history
 *   history — optional, set to "true" for cross-table lookup
 */

import { NextRequest } from "next/server";
import { db, json, error, searchParam, searchParamBool, safe } from "../_shared";

export const GET = safe(async (req: NextRequest) => {
    const email = searchParam(req, "email");
    const history = searchParamBool(req, "history");

    // Candidate history mode: cross-table lookup
    if (email && history) {
        const supabase = db();

        const [clicksResult, prospectsResult] = await Promise.all([
            supabase
                .from("priority_interested_clicks")
                .select("*")
                .eq("candidate_email", email),
            supabase
                .from("prospects")
                .select("*")
                .eq("email", email),
        ]);

        const clicks = clicksResult.data || [];
        const prospects = prospectsResult.data || [];

        return json({
            clicks,
            prospects,
            totalInteractions: clicks.length + prospects.length,
        });
    }

    // Default: list all clicks
    const { data, error: queryError } = await db()
        .from("priority_interested_clicks")
        .select("*")
        .order("application_date", { ascending: false });

    if (queryError) {
        return error(queryError.message, 502);
    }

    return json({ rows: data || [] });
});

export const PATCH = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
        return error("Missing click id", 400);
    }

    const { data, error: updateError } = await db()
        .from("priority_interested_clicks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (updateError) {
        return error(updateError.message, 502);
    }

    return json({ data });
});
