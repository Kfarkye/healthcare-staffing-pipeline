/**
 * v1 Prospect Repository
 *
 * Raw data access for prospects, prospect_events, outreach_messages.
 * No business logic — the service layer handles shaping and validation.
 *
 * @module app/api/v1/prospects/repository
 */

import { db } from "../../data/_shared";

// ============================================================================
// Prospects
// ============================================================================

export async function selectProspectById(id: number) {
  return db()
    .from("prospects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
}

export async function selectProspectByCandidateId(candidateId: number) {
  return db()
    .from("prospects")
    .select("*")
    .eq("candidate_id", candidateId)
    .maybeSingle();
}

export interface ProspectSearchParams {
  specialty?: string[];
  status?: string[];
  stale_after_days?: number;
  min_years_at_facility?: number;
  stale_trigger?: string;
  updated_after?: string;
  updated_before?: string;
  name?: string;
  limit: number;
  cursor?: number;
}

export async function searchProspects(params: ProspectSearchParams) {
  // Use stale_prospects view when stale_trigger is requested (pre-computed)
  const table = params.stale_trigger ? "stale_prospects" : "prospects";

  let query = db()
    .from(table)
    .select("*", { count: "exact" });

  if (params.specialty && params.specialty.length > 0) {
    query = query.in("specialty", params.specialty);
  }

  if (params.status && params.status.length > 0) {
    query = query.in("status", params.status);
  }

  if (params.stale_after_days) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - params.stale_after_days);
    query = query.or(
      `last_contacted_at.is.null,last_contacted_at.lt.${threshold.toISOString()}`
    );
  }

  // Filter by minimum years at facility (for tenure-based triggers)
  if (params.min_years_at_facility && table === "stale_prospects") {
    query = query.gte("years_at_facility", params.min_years_at_facility);
  }

  // Filter by stale trigger (THREE_YEAR_ITCH or GENERAL_STALE)
  if (params.stale_trigger) {
    query = query.eq("stale_trigger", params.stale_trigger);
  }

  if (params.updated_after) {
    query = query.gte("updated_at", params.updated_after);
  }

  if (params.updated_before) {
    query = query.lte("updated_at", params.updated_before);
  }

  if (params.name) {
    query = query.ilike("name", params.name.includes("%") ? params.name : `%${params.name}%`);
  }

  if (params.cursor) {
    query = query.lt("id", params.cursor);
  }

  query = query
    .order("id", { ascending: false })
    .limit(params.limit);

  return query;
}

// ============================================================================
// Prospect Events
// ============================================================================

export async function selectEventsByProspectId(
  prospectId: number,
  opts?: { limit?: number; eventTypes?: string[] }
) {
  let query = db()
    .from("prospect_events")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("occurred_at", { ascending: false });

  if (opts?.eventTypes && opts.eventTypes.length > 0) {
    query = query.in("event_type", opts.eventTypes);
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  return query;
}

export async function insertEvent(payload: {
  prospect_id: number;
  event_type: string;
  actor_type: string;
  actor_id?: string | null;
  occurred_at?: string;
  payload: Record<string, unknown>;
  source: string;
  request_id?: string | null;
}) {
  return db()
    .from("prospect_events")
    .insert({
      prospect_id: payload.prospect_id,
      event_type: payload.event_type,
      actor_type: payload.actor_type,
      actor_id: payload.actor_id ?? null,
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
      payload: payload.payload,
      source: payload.source,
      request_id: payload.request_id ?? null,
    })
    .select("*")
    .single();
}

// ============================================================================
// Lineage (via RPC)
// ============================================================================

export async function getLineage(prospectId: number) {
  return db().rpc("get_prospect_lineage", { p_prospect_id: prospectId });
}

// ============================================================================
// Outreach Messages
// ============================================================================

export async function selectOutreachByProspectId(
  prospectId: number,
  opts?: { limit?: number }
) {
  let query = db()
    .from("outreach_messages")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  return query;
}

export async function insertOutreach(payload: {
  prospect_id: number;
  channel: string;
  template_id?: string | null;
  rendered_subject?: string | null;
  rendered_text: string;
  sent_at?: string | null;
  delivery_status: string;
  provider_message_id?: string | null;
  event_id?: number | null;
}) {
  return db()
    .from("outreach_messages")
    .insert(payload)
    .select("*")
    .single();
}
