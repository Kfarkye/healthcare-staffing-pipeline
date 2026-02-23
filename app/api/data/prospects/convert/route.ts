/**
 * POST /api/data/prospects/convert
 *
 * Replaces DataService.convertClickToProspect.
 * Fetches a click by ID and creates a prospect from it.
 *
 * Body: { clickId: number }
 */

import { NextRequest } from "next/server";
import { db, json, error, safe } from "../../_shared";

export const POST = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { clickId } = body;

    if (!clickId) {
        return error("Missing clickId", 400);
    }

    const supabase = db();

    // Fetch the click
    const { data: click, error: fetchError } = await supabase
        .from("priority_interested_clicks")
        .select("*")
        .eq("id", clickId)
        .single();

    if (fetchError || !click) {
        return error(fetchError?.message || "Click not found", fetchError ? 502 : 404);
    }

    // Create a prospect from the click
    const { data: prospect, error: insertError } = await supabase
        .from("prospects")
        .insert({
            candidate_id: click.application_id,
            name: click.candidate_name,
            email: click.candidate_email,
            phone: null,
            specialty: click.specialty,
            recruiter: click.recruiter_name,
            notes: `Converted from interested click on ${new Date().toLocaleDateString()}`,
            status: "New",
            facility: null,
            job_id: click.job_id,
            profession: click.profession,
        })
        .select()
        .single();

    if (insertError) {
        return error(insertError.message, 502);
    }

    return json({ data: prospect }, 201);
});
