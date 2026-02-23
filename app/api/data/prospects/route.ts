/**
 * /api/data/prospects  (v1)
 *
 * GET   — List / search prospects
 *         Query params: name, email, candidate_id, limit
 *         No params → returns all prospects (newest first)
 * POST  — Create a prospect  (action: "create")
 * PATCH — Update a prospect  (requires id)
 *
 * Responses include schema_version + entity metadata for
 * deterministic Gemini grounding.
 *
 * Architecture: Route → Service → Repository → Postgres
 */

import { NextRequest } from "next/server";
import { json, error, safe, searchParam, searchParamInt } from "../_shared";
import {
    SCHEMA_VERSION,
    listProspects,
    findProspects,
    createProspect,
    updateProspect,
} from "./service";

export const dynamic = "force-dynamic";

export const GET = safe(async (req: NextRequest) => {
    const name = searchParam(req, "name");
    const email = searchParam(req, "email");
    const candidateIdRaw = searchParam(req, "candidate_id");
    const limit = searchParamInt(req, "limit", 20);

    // If any filter is present, use findProspects (targeted query)
    if (name || email || candidateIdRaw) {
        const candidateId = candidateIdRaw ? parseInt(candidateIdRaw, 10) : undefined;

        const result = await findProspects({
            name: name || undefined,
            email: email || undefined,
            candidate_id: Number.isFinite(candidateId) ? candidateId : undefined,
            limit,
        });

        if (result.error) {
            return error(result.error.message, 502);
        }

        return json({
            schema_version: SCHEMA_VERSION,
            entity: "prospect",
            count: result.data.length,
            rows: result.data,
        });
    }

    // No filter → list all
    const result = await listProspects();

    if (result.error) {
        return error(result.error.message, 502);
    }

    return json({
        schema_version: SCHEMA_VERSION,
        entity: "prospect",
        count: result.data.length,
        rows: result.data,
    });
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

    return json({
        schema_version: SCHEMA_VERSION,
        entity: "prospect",
        action: "created",
        data: result.data,
    }, 201);
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

    return json({
        schema_version: SCHEMA_VERSION,
        entity: "prospect",
        action: "updated",
        data: result.data,
    });
});
