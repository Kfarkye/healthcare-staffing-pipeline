/**
 * Prospect Service Layer
 *
 * Business logic + response shaping for prospects.
 * Calls the repository for raw DB access.
 * Used by BOTH /api/data/prospects route handlers AND
 * command-center tools — single source of truth.
 *
 * @module app/api/data/prospects/service
 */

import * as repo from "./repository";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export const SCHEMA_VERSION = "1.0.0";

export interface FindProspectsOptions {
    candidate_id?: number;
    email?: string;
    name?: string;
    limit?: number;
}

export interface ProspectRecord {
    id: number;
    candidate_id?: number | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: string | null;
    nova_url?: string | null;
    recruiter?: string | null;
    specialty?: string | null;
    profession?: string | null;
    home_state?: string | null;
    licenses?: string[] | null;
    engagement_level?: string | null;
    facility?: string | null;
    followup_stage?: string | null;
    notes?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    [key: string]: any;
}

export type ProspectPayload = Omit<Partial<ProspectRecord>, "id">;

/* ------------------------------------------------------------------ */
/*  List / Search                                                      */
/* ------------------------------------------------------------------ */

/** List all prospects, newest first. */
export async function listProspects(): Promise<{ data: ProspectRecord[]; error: any }> {
    const { data, error } = await repo.selectAll("created_at", false);
    return { data: data || [], error };
}

/**
 * Find prospects by candidate_id, email, or name (ILIKE).
 */
export async function findProspects(
    options: FindProspectsOptions
): Promise<{ data: ProspectRecord[]; error: any }> {
    const limit = Math.min(options.limit || 5, 20);

    if (options.candidate_id) {
        const { data, error } = await repo.selectByField(
            "candidate_id", options.candidate_id, { limit }
        );
        return { data: data || [], error };
    }

    if (options.email) {
        const { data, error } = await repo.selectByField(
            "email", String(options.email).trim(), { ilike: true, limit }
        );
        return { data: data || [], error };
    }

    if (options.name) {
        const { data, error } = await repo.selectByField(
            "name", `%${String(options.name).trim()}%`, { ilike: true, limit }
        );
        return { data: data || [], error };
    }

    return { data: [], error: null };
}

/* ------------------------------------------------------------------ */
/*  Single-record lookups                                              */
/* ------------------------------------------------------------------ */

/** Find a single prospect by any supported identifier. */
export async function findProspectBy(
    field: "id" | "candidate_id" | "email",
    value: number | string
): Promise<{ data: ProspectRecord | null; error: any }> {
    const { data, error } = await repo.selectOneByField(
        field, value, { ilike: field === "email" }
    );
    return { data, error };
}

/**
 * Resolve a prospect's internal `id` from various identifiers.
 */
export async function resolveProspectId(input: {
    prospect_id?: number;
    candidate_id?: number;
    email?: string;
}): Promise<number | null> {
    if (input.prospect_id) return input.prospect_id;

    if (input.candidate_id) {
        const { data } = await findProspectBy("candidate_id", input.candidate_id);
        return data?.id ?? null;
    }

    if (input.email) {
        const { data } = await findProspectBy("email", input.email);
        return data?.id ?? null;
    }

    return null;
}

/* ------------------------------------------------------------------ */
/*  Create / Update                                                    */
/* ------------------------------------------------------------------ */

/** Insert a new prospect. */
export async function createProspect(
    payload: ProspectPayload
): Promise<{ data: ProspectRecord | null; error: any }> {
    const { data, error } = await repo.insertOne(payload);
    return { data, error };
}

/** Update an existing prospect by id. */
export async function updateProspect(
    id: number,
    updates: ProspectPayload
): Promise<{ data: ProspectRecord | null; error: any }> {
    const { data, error } = await repo.updateById(id, updates);
    return { data, error };
}
