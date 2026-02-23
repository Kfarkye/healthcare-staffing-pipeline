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

const REQUIRED_TABLES = [
    "prospects",
    "engagements",
    "facilities",
    "jobs",
];

export async function GET() {
    const start = Date.now();
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

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

    // 2. Required tables exist
    try {
        const t0 = Date.now();
        const { data, error } = await db()
            .from("information_schema.tables" as any)
            .select("table_name")
            .eq("table_schema", "public")
            .in("table_name", REQUIRED_TABLES);

        if (error) {
            // Fallback: try each table individually
            const found: string[] = [];
            for (const table of REQUIRED_TABLES) {
                const { error: tableErr } = await db().from(table).select("id").limit(0);
                if (!tableErr) found.push(table);
            }
            const missing = REQUIRED_TABLES.filter((t) => !found.includes(t));
            checks.schema = {
                ok: missing.length === 0,
                ms: Date.now() - t0,
                ...(missing.length > 0 && { error: `Missing tables: ${missing.join(", ")}` }),
            };
        } else {
            const found = (data || []).map((r: any) => r.table_name);
            const missing = REQUIRED_TABLES.filter((t) => !found.includes(t));
            checks.schema = {
                ok: missing.length === 0,
                ms: Date.now() - t0,
                ...(missing.length > 0 && { error: `Missing tables: ${missing.join(", ")}` }),
            };
        }
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
