import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

const STORAGE_PREFIX = 'cc:';

const storage = {
    getItem: async (key: string) => {
        const k = STORAGE_PREFIX + key;
        const v = await window.electronAPI?.secureGet?.(k);
        return v ?? null;
    },
    setItem: async (key: string, value: string) => {
        const k = STORAGE_PREFIX + key;
        await window.electronAPI?.secureSet?.(k, value);
    },
    removeItem: async (key: string) => {
        const k = STORAGE_PREFIX + key;
        await window.electronAPI?.secureDelete?.(k);
    }
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
    if (client) return client;
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
        }
    });
    return client;
}

export type ParsedOAuth = {
    access_token: string;
    refresh_token: string;
};

export function parseOAuthCallback(url: string): ParsedOAuth | null {
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return null;
    const fragment = url.slice(hashIndex + 1);
    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token') ?? '';
    const refresh_token = params.get('refresh_token') ?? '';
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
}
