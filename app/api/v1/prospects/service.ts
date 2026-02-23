/**
 * v1 Prospect Service Layer
 *
 * Business logic + response shaping. Computes lineage from events.
 * Enforces the deterministic envelope contract.
 *
 * Used by BOTH the v1 REST routes AND the Gemini grounding tools.
 *
 * @module app/api/v1/prospects/service
 */

import * as repo from "./repository";
import {
  API_VERSION,
  type ProspectData,
  type ProspectEnvelope,
  type Lineage,
  type SearchFilters,
  type SearchResponse,
  type LogEventInput,
  type EventRecord,
} from "./schemas";

// ============================================================================
// Helpers
// ============================================================================

function makeRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Map DB row to the strict ProspectData shape. Renames fields for contract. */
function toProspectData(row: Record<string, any>): ProspectData {
  return {
    id: row.id,
    candidate_id: row.candidate_id ?? null,
    full_name: row.name ?? "",
    email: row.email ?? null,
    phone: row.phone ?? null,
    specialty: row.specialty ?? null,
    profession: row.profession ?? null,
    current_facility: row.facility ?? null,
    home_state: row.home_state ?? null,
    status: row.status ?? "New",
    licenses: row.licenses ?? null,
    recruiter: row.recruiter ?? null,
    nova_url: row.nova_url ?? null,
    engagement_level: row.engagement_level ?? null,
    last_contacted_at: row.last_contacted_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

function toEventRecord(row: Record<string, any>): EventRecord {
  return {
    id: row.id,
    prospect_id: row.prospect_id,
    event_type: row.event_type,
    actor_type: row.actor_type,
    actor_id: row.actor_id ?? null,
    occurred_at: row.occurred_at,
    payload: row.payload ?? {},
    source: row.source,
    request_id: row.request_id ?? null,
    created_at: row.created_at,
  };
}

function emptyLineage(): Lineage {
  return {
    last_event_type: null,
    last_event_at: null,
    last_actor: null,
    last_contacted_at: null,
    event_count: 0,
  };
}

function toLineage(raw: Record<string, any> | null): Lineage {
  if (!raw) return emptyLineage();
  return {
    last_event_type: raw.last_event_type ?? null,
    last_event_at: raw.last_event_at ?? null,
    last_actor: raw.last_actor ?? null,
    last_contacted_at: raw.last_contacted_at ?? null,
    event_count: raw.event_count ?? 0,
  };
}

// ============================================================================
// GET /v1/prospects/{id}
// ============================================================================

export async function getProspectById(
  id: number
): Promise<{ data: ProspectEnvelope | null; error: string | null }> {
  const requestId = makeRequestId();

  const { data: row, error: dbErr } = await repo.selectProspectById(id);
  if (dbErr) return { data: null, error: dbErr.message };
  if (!row) return { data: null, error: null };

  // Compute lineage from events
  const { data: lineageRaw, error: lineageErr } = await repo.getLineage(id);
  const lineage = lineageErr ? emptyLineage() : toLineage(lineageRaw);

  const prospect = toProspectData(row);

  const envelope: ProspectEnvelope = {
    metadata: {
      version: API_VERSION,
      last_updated: prospect.updated_at,
      source: "system",
      request_id: requestId,
    },
    data: prospect,
    lineage,
  };

  return { data: envelope, error: null };
}

export async function getProspectByCandidateId(
  candidateId: number
): Promise<{ data: ProspectEnvelope | null; error: string | null }> {
  const { data: row, error: dbErr } =
    await repo.selectProspectByCandidateId(candidateId);
  if (dbErr) return { data: null, error: dbErr.message };
  if (!row) return { data: null, error: null };

  return getProspectById(row.id);
}

// ============================================================================
// POST /v1/prospects/search
// ============================================================================

export async function searchProspects(
  filters: SearchFilters
): Promise<{ data: SearchResponse | null; error: string | null }> {
  const requestId = makeRequestId();

  const { data: rows, error: dbErr, count } = await repo.searchProspects({
    specialty: filters.specialty,
    status: filters.status,
    stale_after_days: filters.stale_after_days,
    updated_after: filters.updated_after,
    updated_before: filters.updated_before,
    name: filters.name,
    limit: filters.limit,
    cursor: filters.cursor,
  });

  if (dbErr) return { data: null, error: dbErr.message };

  const prospects = (rows || []).map(toProspectData);
  const lastId = prospects.length > 0 ? prospects[prospects.length - 1].id : null;
  const hasMore = prospects.length === filters.limit;

  const response: SearchResponse = {
    metadata: {
      version: API_VERSION,
      last_updated: new Date().toISOString(),
      source: "system",
      request_id: requestId,
    },
    data: prospects,
    pagination: {
      count: count ?? prospects.length,
      limit: filters.limit,
      next_cursor: hasMore ? lastId : null,
    },
  };

  return { data: response, error: null };
}

// ============================================================================
// POST /v1/prospects/events — log a new event
// ============================================================================

export async function logEvent(
  input: LogEventInput
): Promise<{ data: EventRecord | null; error: string | null }> {
  // Verify prospect exists
  const { data: prospect, error: lookupErr } =
    await repo.selectProspectById(input.prospect_id);
  if (lookupErr) return { data: null, error: lookupErr.message };
  if (!prospect) return { data: null, error: "Prospect not found" };

  const { data: row, error: insertErr } = await repo.insertEvent({
    prospect_id: input.prospect_id,
    event_type: input.event_type,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    occurred_at: input.occurred_at,
    payload: input.payload,
    source: input.source,
    request_id: input.request_id ?? null,
  });

  if (insertErr) return { data: null, error: insertErr.message };

  return { data: toEventRecord(row), error: null };
}

// ============================================================================
// GET events for a prospect
// ============================================================================

export async function getProspectEvents(
  prospectId: number,
  opts?: { limit?: number; eventTypes?: string[] }
): Promise<{ data: EventRecord[]; error: string | null }> {
  const { data: rows, error: dbErr } = await repo.selectEventsByProspectId(
    prospectId,
    opts
  );
  if (dbErr) return { data: [], error: dbErr.message };
  return { data: (rows || []).map(toEventRecord), error: null };
}
