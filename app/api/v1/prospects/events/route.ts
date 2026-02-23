/**
 * POST /api/v1/prospects/events
 *
 * Append a new event to the prospect event stream.
 * This is the canonical way to record actions — the LLM calls
 * log_event tool which hits this endpoint.
 *
 * GET /api/v1/prospects/events?prospect_id=123
 *
 * Fetch recent events for a prospect.
 */

import { NextRequest } from "next/server";
import { json, error, safe, searchParamInt } from "../../../data/_shared";
import { LogEventInputSchema } from "../schemas";
import { logEvent, getProspectEvents } from "../service";

export const dynamic = "force-dynamic";

export const POST = safe(async (req: NextRequest) => {
  const body = await req.json();

  // Strict validation at boundary
  const parsed = LogEventInputSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    return error(`Invalid event: ${issues.join("; ")}`, 400);
  }

  const result = await logEvent(parsed.data);

  if (result.error) {
    return error(result.error, result.error === "Prospect not found" ? 404 : 502);
  }

  return json(result.data, 201);
});

export const GET = safe(async (req: NextRequest) => {
  const prospectIdRaw = req.nextUrl.searchParams.get("prospect_id");
  if (!prospectIdRaw) {
    return error("prospect_id query parameter is required", 400);
  }

  const prospectId = parseInt(prospectIdRaw, 10);
  if (!Number.isFinite(prospectId) || prospectId <= 0) {
    return error("prospect_id must be a positive integer", 400);
  }

  const limit = searchParamInt(req, "limit", 50);

  const eventTypesRaw = req.nextUrl.searchParams.get("event_types");
  const eventTypes = eventTypesRaw
    ? eventTypesRaw.split(",").map((t) => t.trim())
    : undefined;

  const result = await getProspectEvents(prospectId, { limit, eventTypes });

  if (result.error) {
    return error(result.error, 502);
  }

  return json({
    prospect_id: prospectId,
    count: result.data.length,
    events: result.data,
  });
});
