export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const EDGE_FUNCTION_PATH = (import.meta.env.VITE_EDGE_FUNCTION_PATH ?? '/functions/v1/chat-command-center').trim();

export function edgeEndpoint(): string {
    if (!SUPABASE_URL) return '';
    return `${SUPABASE_URL.replace(/\/+$/, '')}${EDGE_FUNCTION_PATH.startsWith('/') ? '' : '/'}${EDGE_FUNCTION_PATH}`;
}

export function configOk(): boolean {
    return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}
