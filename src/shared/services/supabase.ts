// ============================================================================
// /src/shared/services/supabase.ts
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Next.js environment pattern - provide fallbacks for static generation
// Next.js environment pattern - provide fallbacks for static generation
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawSupabaseUrl.trim().replace(/^["']|["']$/g, '');

const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAnonKey = rawSupabaseAnonKey.trim().replace(/^["']|["']$/g, '');

// Create client - handle missing env vars during SSG gracefully
function getSupabaseClient(): SupabaseClient {
  // If env vars are missing (happens during static generation on Vercel)
  if (!supabaseUrl || !supabaseAnonKey) {
    // Use a valid placeholder URL that Supabase will accept
    // This client won't be used for actual requests during SSG
    return createClient(
      'https://placeholder-project.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.placeholder'
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = getSupabaseClient();