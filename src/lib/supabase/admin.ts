/**
 * Admin Supabase Client (Service Role)
 *
 * Server-only singleton client using the service role key.
 * Used exclusively by API routes in /app/api/data/*.
 *
 * NEVER import this file from client components or browser code.
 *
 * @module src/lib/supabase/admin
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv, requireHttpUrl } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
    if (adminClient) return adminClient;

    const url = requireHttpUrl("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    adminClient = createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    return adminClient;
}
