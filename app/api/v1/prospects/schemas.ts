/**
 * v1 Prospect API — Zod Schemas (Boundary Enforcement)
 *
 * Every field has explicit nullability. No dynamic keys.
 * Unknown fields are rejected. Enums are strict.
 * This is the contract the LLM is grounded against.
 *
 * @module app/api/v1/prospects/schemas
 */

import { z } from "zod";

// ============================================================================
// Enums — strict, no freeform strings
// ============================================================================

export const ProspectStatus = z.enum([
  "New",
  "Contacted",
  "Interested",
  "Profile Updates",
  "Submittal Ready",
  "Submitted",
  "Exited",
]);
export type ProspectStatusType = z.infer<typeof ProspectStatus>;

export const EventType = z.enum([
  "PROSPECT_CREATED",
  "PROSPECT_UPDATED",
  "OUTREACH_SENT",
  "OUTREACH_FAILED",
  "RESPONSE_RECEIVED",
  "STATUS_CHANGED",
  "SUBMITTED",
  "INTERVIEW_SCHEDULED",
  "OFFERED",
  "DECLINED",
  "HIRED",
  "NOTE_ADDED",
  "FOLLOWUP_SCHEDULED",
  "FOLLOWUP_COMPLETED",
]);
export type EventTypeValue = z.infer<typeof EventType>;

export const ActorType = z.enum(["RECRUITER", "SYSTEM", "CANDIDATE"]);

export const EventSource = z.enum([
  "MANUAL",
  "COMMAND_CENTER",
  "NOVA_SYNC",
  "SMS_AUTOMATION",
  "EMAIL_AUTOMATION",
  "BULK_IMPORT",
  "API",
]);

export const OutreachChannel = z.enum(["EMAIL", "SMS", "LINKEDIN", "PHONE"]);

export const DeliveryStatus = z.enum([
  "DRAFT",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "FAILED",
  "OPENED",
  "CLICKED",
  "REPLIED",
]);

// ============================================================================
// Response Shapes — deterministic, no dynamic keys
// ============================================================================

/** The prospect data object returned by GET /v1/prospects/{id} */
export const ProspectDataSchema = z
  .object({
    id: z.number().int(),
    candidate_id: z.number().int().nullable(),
    full_name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    specialty: z.string().nullable(),
    profession: z.string().nullable(),
    current_facility: z.string().nullable(),
    home_state: z.string().nullable(),
    status: z.string(),
    licenses: z.array(z.string()).nullable(),
    recruiter: z.string().nullable(),
    nova_url: z.string().nullable(),
    engagement_level: z.string().nullable(),
    facility_start_date: z.string().nullable(),
    years_at_facility: z.number().nullable(),
    last_contacted_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

export type ProspectData = z.infer<typeof ProspectDataSchema>;

/** Stale trigger signal — server-computed, not model-guessed */
export const StaleTrigger = z.enum([
  "THREE_YEAR_ITCH",
  "GENERAL_STALE",
]).nullable();

/** Lineage block — computed from prospect_events */
export const LineageSchema = z
  .object({
    last_event_type: z.string().nullable(),
    last_event_at: z.string().nullable(),
    last_actor: z
      .object({
        actor_type: z.string(),
        actor_id: z.string().nullable(),
      })
      .nullable(),
    last_contacted_at: z.string().nullable(),
    days_since_contact: z.number().int().nullable(),
    event_count: z.number().int(),
    stale_trigger: StaleTrigger,
  })
  .strict();

export type Lineage = z.infer<typeof LineageSchema>;

/** Response metadata */
export const MetadataSchema = z
  .object({
    version: z.string(),
    last_updated: z.string(),
    source: z.string(),
    request_id: z.string().nullable(),
  })
  .strict();

/** Full GET /v1/prospects/{id} response envelope */
export const ProspectEnvelopeSchema = z
  .object({
    metadata: MetadataSchema,
    data: ProspectDataSchema,
    lineage: LineageSchema,
  })
  .strict();

export type ProspectEnvelope = z.infer<typeof ProspectEnvelopeSchema>;

// ============================================================================
// Search — strict filters only, no freeform
// ============================================================================

export const SearchFiltersSchema = z
  .object({
    specialty: z.array(z.string()).optional(),
    status: z.array(ProspectStatus).optional(),
    stale_after_days: z.number().int().positive().optional(),
    min_years_at_facility: z.number().positive().optional(),
    stale_trigger: z.enum(["THREE_YEAR_ITCH", "GENERAL_STALE"]).optional(),
    updated_after: z.string().datetime().optional(),
    updated_before: z.string().datetime().optional(),
    name: z.string().optional(),
    limit: z.number().int().positive().max(100).default(20),
    cursor: z.number().int().optional(),
  })
  .strict();

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

/** Search response — array of prospect data with pagination */
export const SearchResponseSchema = z
  .object({
    metadata: MetadataSchema,
    data: z.array(ProspectDataSchema),
    pagination: z
      .object({
        count: z.number().int(),
        limit: z.number().int(),
        next_cursor: z.number().int().nullable(),
      })
      .strict(),
  })
  .strict();

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ============================================================================
// Event logging — strict input validation
// ============================================================================

export const LogEventInputSchema = z
  .object({
    prospect_id: z.number().int().positive(),
    event_type: EventType,
    actor_type: ActorType.default("SYSTEM"),
    actor_id: z.string().uuid().nullable().optional(),
    occurred_at: z.string().datetime().optional(),
    payload: z.record(z.unknown()).default({}),
    source: EventSource.default("COMMAND_CENTER"),
    request_id: z.string().nullable().optional(),
  })
  .strict();

export type LogEventInput = z.infer<typeof LogEventInputSchema>;

export const EventRecordSchema = z
  .object({
    id: z.number().int(),
    prospect_id: z.number().int(),
    event_type: z.string(),
    actor_type: z.string(),
    actor_id: z.string().nullable(),
    occurred_at: z.string(),
    payload: z.record(z.unknown()),
    source: z.string(),
    request_id: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();

export type EventRecord = z.infer<typeof EventRecordSchema>;

// ============================================================================
// Constants
// ============================================================================

export const API_VERSION = "1.2.0";
