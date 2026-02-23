/**
 * /api/data/prospects
 *
 * GET   — List all prospects (replaces DataService.getProspects)
 * POST  — Create a prospect (replaces DataService.createProspect)
 * PATCH — Update a prospect (replaces DataService.updateProspect)
 */

import { NextRequest } from "next/server";
import { db, json, error, safe } from "../_shared";

export const GET = safe(async (req: NextRequest) => {
    const { data, error: queryError } = await db()
        .from("prospects")
        .select("*")
        .order("created_at", { ascending: false });

    if (queryError) {
        return error(queryError.message, 502);
    }

    return json({ rows: data || [] });
});

export const POST = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { action, ...prospectData } = body;

    if (action !== "create") {
        return error("Unknown action. Expected 'create'.", 400);
    }

    const { data, error: insertError } = await db()
        .from("prospects")
        .insert(prospectData)
        .select()
        .single();

    if (insertError) {
        return error(insertError.message, 502);
    }

    return json({ data }, 201);
});

export const PATCH = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
        return error("Missing prospect id", 400);
    }

    const { data, error: updateError } = await db()
        .from("prospects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (updateError) {
        return error(updateError.message, 502);
    }

    return json({ data });
});
