/// <reference types="vite/client" />

// Extend ImportMeta for Vite environment variables
interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string;
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_OPENAI_API_KEY?: string;
    readonly VITE_API_URL?: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
