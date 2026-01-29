/**
 * Server Supabase Client (Next.js 15 Compatible)
 * 
 * Use this in Server Components, Route Handlers, and Server Actions.
 * Handles cookies for session management with async Next.js 15 API.
 * 
 * @example
 * const supabase = await createServerSupabaseClient();
 * const { data } = await supabase.from('table').select('*');
 * 
 * @module src/lib/supabase/server
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireEnv, requireHttpUrl } from "@/lib/env";

export async function createServerSupabaseClient() {
    const cookieStore = await cookies();
    const url = requireHttpUrl("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    return createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                // Next.js allows setting cookies in Route Handlers / Server Actions.
                // In Server Components during prerender, this is a no-op by design.
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                } catch {
                    // Ignore: build-time/prerender has no mutable response cookies.
                }
            },
        },
    });
}
