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

/** Compute years at facility from facility_start_date. Server-side, not guessed. */
function computeYearsAtFacility(facilityStartDate: string | null): number | null {
  if (!facilityStartDate) return null;
  const start = new Date(facilityStartDate);
  if (isNaN(start.getTime())) return null;
  const years = (Date.now() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.round(years * 10) / 10; // 1 decimal place
}

/** Compute days since last contact. Null if never contacted. */
function computeDaysSinceContact(lastContactedAt: string | null): number | null {
  if (!lastContactedAt) return null;
  const d = new Date(lastContactedAt);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Compute the stale trigger signal server-side.
 * - THREE_YEAR_ITCH: at facility >= 2.8 years, actionable status, stale >= 14 days
 * - GENERAL_STALE: any actionable status, no contact in 7+ days
 */
function computeStaleTrigger(
  status: string,
  yearsAtFacility: number | null,
  daysSinceContact: number | null,
  lastContactedAt: string | null,
): "THREE_YEAR_ITCH" | "GENERAL_STALE" | null {
  const actionableStatuses = new Set(["New", "Contacted", "Interested", "Profile Updates"]);
  if (!actionableStatuses.has(status)) return null;

  const threeYearItchStatuses = new Set(["New", "Contacted", "Interested"]);

  if (
    yearsAtFacility !== null &&
    yearsAtFacility >= 2.8 &&
    threeYearItchStatuses.has(status) &&
    (lastContactedAt === null || (daysSinceContact !== null && daysSinceContact >= 14))
  ) {
    return "THREE_YEAR_ITCH";
  }

  if (
    lastContactedAt === null ||
    (daysSinceContact !== null && daysSinceContact >= 7)
  ) {
    return "GENERAL_STALE";
  }

  return null;
}

/** Map DB row to the strict ProspectData shape. Renames fields for contract. */
function toProspectData(row: Record<string, any>): ProspectData {
  const facilityStartDate = row.facility_start_date ?? null;
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
    facility_start_date: facilityStartDate,
    years_at_facility: computeYearsAtFacility(facilityStartDate),
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
    days_since_contact: null,
    event_count: 0,
    stale_trigger: null,
  };
}

function toLineage(
  raw: Record<string, any> | null,
  prospect?: ProspectData,
): Lineage {
  if (!raw) return emptyLineage();

  const lastContactedAt = raw.last_contacted_at ?? null;
  const daysSince = computeDaysSinceContact(lastContactedAt);

  return {
    last_event_type: raw.last_event_type ?? null,
    last_event_at: raw.last_event_at ?? null,
    last_actor: raw.last_actor ?? null,
    last_contacted_at: lastContactedAt,
    days_since_contact: daysSince,
    event_count: raw.event_count ?? 0,
    stale_trigger: prospect
      ? computeStaleTrigger(
          prospect.status,
          prospect.years_at_facility,
          daysSince,
          lastContactedAt,
        )
      : null,
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

  const prospect = toProspectData(row);

  // Compute lineage from events, passing prospect for stale trigger
  const { data: lineageRaw, error: lineageErr } = await repo.getLineage(id);
  const lineage = lineageErr ? emptyLineage() : toLineage(lineageRaw, prospect);

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
    min_years_at_facility: filters.min_years_at_facility,
    stale_trigger: filters.stale_trigger,
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
