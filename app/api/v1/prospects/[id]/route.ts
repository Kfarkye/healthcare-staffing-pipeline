/**
 * GET /api/v1/prospects/{id}
 *
 * Returns the deterministic prospect envelope with lineage.
 * This is the primary grounding endpoint for the LLM.
 *
 * The response shape is strict: no dynamic keys, explicit nullability.
 * The lineage block is computed from the prospect_events stream.
 */

import { NextRequest, NextResponse } from "next/server";
import { json, error } from "../../../data/_shared";
import { getProspectById, getProspectByCandidateId, getProspectEvents } from "../service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);

    if (!Number.isFinite(id) || id <= 0) {
      return error("Invalid prospect ID. Must be a positive integer.", 400);
    }

    // Check if caller wants events included
    const includeEvents = req.nextUrl.searchParams.get("include_events") === "true";

    // Support both prospect.id and candidate_id lookups
    const lookupBy = req.nextUrl.searchParams.get("lookup_by");

    let result;
    if (lookupBy === "candidate_id") {
      result = await getProspectByCandidateId(id);
    } else {
      result = await getProspectById(id);
    }

    if (result.error) {
      return error(result.error, 502);
    }

    if (!result.data) {
      return error("Prospect not found", 404);
    }

    // Optionally attach recent events
    if (includeEvents) {
      const eventsResult = await getProspectEvents(result.data.data.id, { limit: 20 });
      return json({
        ...result.data,
        events: eventsResult.data,
      });
    }

    return json(result.data);
  } catch (err: any) {
    const message = err?.message || "Internal server error";
    console.error(`[API] GET /v1/prospects/[id] →`, message);
    return error(message, 500);
  }
}
