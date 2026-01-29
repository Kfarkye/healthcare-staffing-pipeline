type EnvKey =
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    | "SUPABASE_SERVICE_ROLE_KEY";

export function requireEnv(key: EnvKey): string {
    const v = process.env[key];
    if (!v || v.trim().length === 0) {
        throw new Error(`Missing required env var: ${key}`);
    }
    // Strip surrounding quotes (common copy-paste error from .env files)
    return v.trim().replace(/^["']|["']$/g, '');
}

export function requireHttpUrl(key: "NEXT_PUBLIC_SUPABASE_URL"): string {
    const v = requireEnv(key);
    let url: URL;
    try {
        url = new URL(v);
    } catch {
        throw new Error(`${key} is not a valid URL: "${v}"`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`${key} must start with http:// or https://. Got: "${v}"`);
    }
    return v;
}
