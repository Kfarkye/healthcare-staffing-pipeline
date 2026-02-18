/**
 * Pipeline API — Shared utilities
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export function createPipelineClient() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!url || !key) {
        return null;
    }
    return createClient(url.trim(), key.trim());
}

export function jsonResponse(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 500) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export function missingEnvResponse() {
    return errorResponse('Pipeline not configured', 503);
}
