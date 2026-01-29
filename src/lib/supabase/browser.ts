/**
 * Browser Supabase Client
 * 
 * Use this in Client Components ('use client') for browser-side data access.
 * Validates environment variables and fails fast if misconfigured.
 * 
 * @example
 * const supabase = createBrowserSupabaseClient();
 * const { data } = await supabase.from('table').select('*');
 * 
 * @module src/lib/supabase/browser
 */

import { createClient } from "@supabase/supabase-js";
import { requireEnv, requireHttpUrl } from "@/lib/env";

export function createBrowserSupabaseClient() {
    const url = requireHttpUrl("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    return createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
}
