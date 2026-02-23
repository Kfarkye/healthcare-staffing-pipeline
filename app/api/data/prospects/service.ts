/**
 * Prospect Service Layer
 *
 * Shared data-access functions for the prospects table.
 * Used by BOTH /api/data/prospects route handlers AND
 * command-center tools — single source of truth, no
 * duplicate raw queries.
 *
 * @module app/api/data/prospects/service
 */

import { db } from "../_shared";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/** List all prospects, newest first. Used by GET /api/data/prospects. */
export async function listProspects(): Promise<{ data: ProspectRecord[]; error: any }> {
    const { data, error } = await db()
        .from("prospects")
        .select("*")
        .order("created_at", { ascending: false });
    return { data: data || [], error };
}

/**
 * Find prospects by candidate_id, email, or name (ILIKE).
 * Used by the lookup_candidate tool.
 */
export async function findProspects(
    options: FindProspectsOptions
): Promise<{ data: ProspectRecord[]; error: any }> {
    const limit = Math.min(options.limit || 5, 20);
    const columns =
        "id, candidate_id, name, email, phone, status, nova_url, recruiter, specialty, profession, home_state, licenses, engagement_level";

    let query = db().from("prospects").select(columns).limit(limit);

    if (options.candidate_id) {
        query = query.eq("candidate_id", options.candidate_id);
    } else if (options.email) {
        query = query.ilike("email", String(options.email).trim());
    } else if (options.name) {
        query = query.ilike("name", `%${String(options.name).trim()}%`);
    } else {
        return { data: [], error: null };
    }

    const { data, error } = await query;
    return { data: data || [], error };
}

/* ------------------------------------------------------------------ */
/*  Single-record lookups                                              */
/* ------------------------------------------------------------------ */

/** Find a single prospect by any supported identifier. */
export async function findProspectBy(
    field: "id" | "candidate_id" | "email",
    value: number | string
): Promise<{ data: ProspectRecord | null; error: any }> {
    let query = db().from("prospects").select("*");

    if (field === "email") {
        query = query.ilike("email", String(value));
    } else {
        query = query.eq(field, value);
    }

    const { data, error } = await query.maybeSingle();
    return { data, error };
}

/**
 * Resolve a prospect's internal `id` from various identifiers.
 * Returns null if not found.
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

/** Insert a new prospect. Used by POST /api/data/prospects & add_candidate tool. */
export async function createProspect(
    payload: ProspectPayload
): Promise<{ data: ProspectRecord | null; error: any }> {
    const { data, error } = await db()
        .from("prospects")
        .insert(payload)
        .select("*")
        .single();
    return { data, error };
}

/** Update an existing prospect by id. Used by PATCH /api/data/prospects & update_candidate tool. */
export async function updateProspect(
    id: number,
    updates: ProspectPayload
): Promise<{ data: ProspectRecord | null; error: any }> {
    const { data, error } = await db()
        .from("prospects")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
    return { data, error };
}
