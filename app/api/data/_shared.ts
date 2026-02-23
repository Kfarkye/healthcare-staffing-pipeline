/**
 * API Route Utilities
 *
 * Shared helpers for all /api/data/* routes.
 * Consistent error responses, parameter parsing, admin client access.
 *
 * @module app/api/data/_shared
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function json<T>(data: T, status = 200) {
    return NextResponse.json(data, { status });
}

export function error(message: string, status = 500) {
    console.error(`[API ${status}] ${message}`);
    return NextResponse.json({ error: message }, { status });
}

// ============================================================================
// PARAMETER PARSING
// ============================================================================

export function searchParam(req: NextRequest, key: string): string | null {
    return req.nextUrl.searchParams.get(key);
}

export function searchParamInt(req: NextRequest, key: string, fallback: number): number {
    const val = req.nextUrl.searchParams.get(key);
    if (!val) return fallback;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? fallback : parsed;
}

export function searchParamBool(req: NextRequest, key: string): boolean | undefined {
    const val = req.nextUrl.searchParams.get(key);
    if (val === null) return undefined;
    return val === "true" || val === "1";
}

// ============================================================================
// DATABASE ACCESS
// ============================================================================

export function db() {
    return getAdminClient();
}

// ============================================================================
// SAFE HANDLER WRAPPER
// ============================================================================

type Handler = (req: NextRequest) => Promise<NextResponse>;

/**
 * Wraps a route handler with try/catch + structured error logging.
 * Prevents unhandled promise rejections from crashing the server.
 */
export function safe(handler: Handler): Handler {
    return async (req: NextRequest) => {
        try {
            return await handler(req);
        } catch (err: any) {
            const message = err?.message || "Internal server error";
            const status = err?.status || err?.statusCode || 500;
            console.error(`[API] ${req.method} ${req.nextUrl.pathname} →`, message);
            return error(message, status >= 400 && status < 600 ? status : 500);
        }
    };
}

// ============================================================================
// ALLOWED VIEWS WHITELIST
// ============================================================================

const ALLOWED_VIEWS = new Set([
    "prospects_dashboard",
    "submittals_dashboard",
    "active_assignments_dashboard",
    "engagements_dashboard",
    "active_dashboard_view",
]);

export function validateView(view: string | null): view is string {
    return !!view && ALLOWED_VIEWS.has(view);
}
