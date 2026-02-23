-- ============================================================================
-- Migration: Lock down RLS policies
--
-- Fixes:
--   1. Enable RLS on candidate_dna (currently has NONE)
--   2. Replace wide-open USING(true) policies on 14 tables with
--      authenticated-only access
--   3. Tables with existing scoped policies (chat_history, cold_outreach_*,
--      credential_packs, ai_audit_logs, communication_templates) are NOT
--      touched — they already have proper policies.
--
-- After this migration, the anon key can no longer write to core tables.
-- ============================================================================

-- ── 1. candidate_dna: enable RLS + add authenticated policy ──────────────

ALTER TABLE candidate_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access"
  ON candidate_dna FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 2. Replace open policies on core tables ──────────────────────────────
-- Strategy: drop the existing wide-open policy, create a new one scoped
-- to authenticated role only. We use DO blocks so the migration is
-- idempotent (won't fail if policy names differ).

DO $$
DECLARE
  t TEXT;
  p RECORD;
  tables_to_fix TEXT[] := ARRAY[
    'prospects',
    'facilities',
    'jobs',
    'engagements',
    'actions',
    'exits',
    'follow_ups',
    'interested_clicks',
    'pay_packages',
    'certifications',
    'candidate_activities',
    'travel_candidates',
    'candidate_notes',
    'state_board_links'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_fix
  LOOP
    -- Drop ALL existing policies on the table (they are wide open)
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p.policyname, t);
    END LOOP;

    -- Create authenticated-only policy for all operations
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );

    -- Create service_role bypass (for API routes using service key)
    EXECUTE format(
      'CREATE POLICY "service_role_bypass" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END
$$;

-- ── 3. Verify RLS is enabled on all tables (safety net) ─────────────────
-- candidate_dna was the only one missing ENABLE RLS, but let's be safe

DO $$
DECLARE
  t TEXT;
  tables_to_check TEXT[] := ARRAY[
    'candidate_dna',
    'prospects',
    'facilities',
    'jobs',
    'engagements',
    'actions',
    'exits',
    'follow_ups',
    'interested_clicks',
    'pay_packages',
    'certifications',
    'candidate_activities',
    'travel_candidates',
    'candidate_notes',
    'state_board_links'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_check
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
