-- ============================================================================
-- Migration: Revoke anon write access to core tables
--
-- The initial migration granted ALL ON ALL TABLES to anon. This revokes
-- INSERT, UPDATE, DELETE from anon on every core table.
--
-- After this migration:
--   - anon can still SELECT (needed for Realtime subscriptions if any)
--   - anon can still INSERT to credential_packs (public sharing feature)
--   - authenticated gets full access via RLS policies
--   - service_role bypasses everything (used by API routes)
--
-- This pairs with 20260223000001_lockdown_rls_policies.sql which replaced
-- the wide-open RLS policies with authenticated-only policies.
-- ============================================================================

-- ── Revoke write access from anon on core tables ─────────────────────────

DO $$
DECLARE
  t TEXT;
  core_tables TEXT[] := ARRAY[
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
    'state_board_links',
    'candidate_dna',
    'chat_history',
    'communication_templates',
    'cold_outreach_campaigns',
    'cold_outreach_recipients',
    'ai_audit_logs',
    'email_templates',
    'knowledge_base'
  ];
BEGIN
  FOREACH t IN ARRAY core_tables
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM anon', t);
  END LOOP;
END
$$;

-- ── Keep anon INSERT on credential_packs (public sharing) ────────────────
-- credential_packs already has proper RLS (anon insert + read, 7-day expiry)
-- so we only revoke UPDATE and DELETE, not INSERT

REVOKE UPDATE, DELETE ON credential_packs FROM anon;

-- ── Revoke anon EXECUTE on sensitive functions ───────────────────────────

DO $$
DECLARE
  fn TEXT;
  sensitive_fns TEXT[] := ARRAY[
    'bulk_update_extension_stage',
    'toggle_assignment_flag',
    'set_extension_dates',
    'create_follow_up',
    'complete_follow_up',
    'reschedule_follow_up',
    'upsert_candidate_dna',
    'upsert_candidate_dna_v2'
  ];
BEGIN
  FOREACH fn IN ARRAY sensitive_fns
  LOOP
    -- Revoke from anon; these use SECURITY DEFINER so they run as owner,
    -- but we don't want anon to be able to invoke them at all
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I FROM anon', fn);
    EXCEPTION WHEN undefined_function THEN
      -- Function may have parameters; skip if exact match not found
      NULL;
    END;
  END LOOP;
END
$$;
