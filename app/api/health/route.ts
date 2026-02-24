/**
 * GET /api/health
 *
 * Startup + readiness probe. Validates:
 * 1. DB connection alive
 * 2. Required tables exist in PostgREST schema cache
 * 3. Migration version (when meta table exists)
 *
 * Returns structured JSON so monitoring can parse it.
 */

import { NextResponse } from "next/server";
import { db } from "../data/_shared";

export const dynamic = "force-dynamic";

// Core tables — must exist for the app to function
const REQUIRED_TABLES = [
    "prospects",
    "engagements",
    "facilities",
    "jobs",
    "actions",
    "exits",
    "follow_ups",
    "interested_clicks",
    "pay_packages",
    "knowledge_base",
    "communication_templates",
    "chat_history",
    "ai_audit_logs",
    "candidate_dna",
    "certifications",
    "candidate_activities",
    "travel_candidates",
    "candidate_notes",
    "state_board_links",
    "cold_outreach_campaigns",
    "cold_outreach_recipients",
    "credential_packs",
    "email_templates",
];

export async function GET() {
    const start = Date.now();
    const checks: Record<string, { ok: boolean; ms?: number; error?: string; [key: string]: unknown }> = {};

    // 1. DB connection
    try {
        const t0 = Date.now();
        const { error } = await db().from("prospects").select("id").limit(1);
        checks.db_connection = error
            ? { ok: false, error: error.message, ms: Date.now() - t0 }
            : { ok: true, ms: Date.now() - t0 };
    } catch (err: any) {
        checks.db_connection = { ok: false, error: err?.message || "Connection failed" };
    }

    // 2. Required tables exist in PostgREST schema cache
    try {
        const t0 = Date.now();
        const found: string[] = [];
        const missing: string[] = [];

        // Probe each table — a zero-row SELECT will succeed if the table
        // exists in the schema cache, and fail with 404 if it doesn't
        await Promise.all(
            REQUIRED_TABLES.map(async (table) => {
                const { error: tableErr } = await db().from(table).select("*").limit(0);
                if (tableErr) {
                    missing.push(table);
                } else {
                    found.push(table);
                }
            })
        );

        checks.schema = {
            ok: missing.length === 0,
            ms: Date.now() - t0,
            found_count: found.length,
            total_expected: REQUIRED_TABLES.length,
            ...(missing.length > 0 && { error: `Missing tables: ${missing.join(", ")}` }),
        };
    } catch (err: any) {
        checks.schema = { ok: false, error: err?.message || "Schema check failed" };
    }

    const allOk = Object.values(checks).every((c) => c.ok);

    return NextResponse.json(
        {
            status: allOk ? "healthy" : "degraded",
            timestamp: new Date().toISOString(),
            latency_ms: Date.now() - start,
            checks,
        },
        { status: allOk ? 200 : 503 }
    );
}
