/**
 * /api/data/prospects
 *
 * GET   — List all prospects (replaces DataService.getProspects)
 * POST  — Create a prospect (replaces DataService.createProspect)
 * PATCH — Update a prospect (replaces DataService.updateProspect)
 *
 * All data access goes through the shared prospect service layer.
 */

import { NextRequest } from "next/server";
import { json, error, safe } from "../_shared";
import { listProspects, createProspect, updateProspect } from "./service";

export const GET = safe(async (_req: NextRequest) => {
    const result = await listProspects();

    if (result.error) {
        return error(result.error.message, 502);
    }

    return json({ rows: result.data });
});

export const POST = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { action, ...prospectData } = body;

    if (action !== "create") {
        return error("Unknown action. Expected 'create'.", 400);
    }

    const result = await createProspect(prospectData);

    if (result.error) {
        return error(result.error.message, 502);
    }

    return json({ data: result.data }, 201);
});

export const PATCH = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
        return error("Missing prospect id", 400);
    }

    const result = await updateProspect(id, updates);

    if (result.error) {
        return error(result.error.message, 502);
    }

    return json({ data: result.data });
});
