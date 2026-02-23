/**
 * Prospect Repository
 *
 * Raw data access layer for the prospects table.
 * NO business logic — just queries. The service layer
 * calls these functions and adds validation, shaping, etc.
 *
 * @module app/api/data/prospects/repository
 */

import { db } from "../_shared";

const TABLE = "prospects" as const;

const LIST_COLUMNS = "*";
const SEARCH_COLUMNS =
    "id, candidate_id, name, email, phone, status, nova_url, recruiter, specialty, profession, home_state, licenses, engagement_level, created_at, updated_at";

/* ------------------------------------------------------------------ */
/*  Read                                                                */
/* ------------------------------------------------------------------ */

export async function selectAll(orderBy = "created_at", ascending = false) {
    return db()
        .from(TABLE)
        .select(LIST_COLUMNS)
        .order(orderBy, { ascending });
}

export async function selectByField(
    field: string,
    value: string | number,
    opts?: { ilike?: boolean; limit?: number; columns?: string }
) {
    const columns = opts?.columns || SEARCH_COLUMNS;
    let query = db().from(TABLE).select(columns);

    if (opts?.ilike) {
        query = query.ilike(field, String(value));
    } else {
        query = query.eq(field, value);
    }

    if (opts?.limit) {
        query = query.limit(opts.limit);
    }

    return query;
}

export async function selectOneByField(
    field: string,
    value: string | number,
    opts?: { ilike?: boolean }
) {
    let query = db().from(TABLE).select("*");

    if (opts?.ilike) {
        query = query.ilike(field, String(value));
    } else {
        query = query.eq(field, value);
    }

    return query.maybeSingle();
}

/* ------------------------------------------------------------------ */
/*  Write                                                               */
/* ------------------------------------------------------------------ */

export async function insertOne(payload: Record<string, any>) {
    return db()
        .from(TABLE)
        .insert(payload)
        .select("*")
        .single();
}

export async function updateById(id: number, updates: Record<string, any>) {
    return db()
        .from(TABLE)
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
}
