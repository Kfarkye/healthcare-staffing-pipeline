// ============================================================================
// /src/shared/services/supabase.ts
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Next.js environment pattern - provide fallbacks for static generation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create a lazy-initialized client to avoid build-time errors
let _supabase: SupabaseClient | null = null;

export const supabase = (() => {
  if (_supabase) return _supabase;

  if (!supabaseUrl || !supabaseAnonKey) {
    // During static generation, return a dummy client that won't be used
    if (typeof window === 'undefined') {
      console.warn('[Supabase] Missing env vars during static generation - this is expected');
      // Return a placeholder that will be replaced on client
      return createClient('https://placeholder.supabase.co', 'placeholder-key');
    }
    console.error('Missing Supabase environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
})();