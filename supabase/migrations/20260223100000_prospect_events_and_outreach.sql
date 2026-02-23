-- ============================================================================
-- Migration: Canonical Event Stream + Outreach Messages
--
-- Implements three corrections to the Grounding-First Architecture:
--   1. prospect_events — append-only event log for deterministic lineage
--   2. outreach_messages — channel-level delivery tracking
--   3. Freshness view — computes last_contacted_at from events, not guesses
--
-- The LLM grounding layer reads lineage from events, not from the prospect
-- row alone. "Julia was last contacted 4 days ago by Sarah" becomes a
-- guaranteed fact derived from the event stream.
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prospect_event_type') THEN
    CREATE TYPE prospect_event_type AS ENUM (
      'PROSPECT_CREATED',
      'PROSPECT_UPDATED',
      'OUTREACH_SENT',
      'OUTREACH_FAILED',
      'RESPONSE_RECEIVED',
      'STATUS_CHANGED',
      'SUBMITTED',
      'INTERVIEW_SCHEDULED',
      'OFFERED',
      'DECLINED',
      'HIRED',
      'NOTE_ADDED',
      'FOLLOWUP_SCHEDULED',
      'FOLLOWUP_COMPLETED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_actor_type') THEN
    CREATE TYPE event_actor_type AS ENUM (
      'RECRUITER',
      'SYSTEM',
      'CANDIDATE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_source_type') THEN
    CREATE TYPE event_source_type AS ENUM (
      'MANUAL',
      'COMMAND_CENTER',
      'NOVA_SYNC',
      'SMS_AUTOMATION',
      'EMAIL_AUTOMATION',
      'BULK_IMPORT',
      'API'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_channel') THEN
    CREATE TYPE outreach_channel AS ENUM (
      'EMAIL',
      'SMS',
      'LINKEDIN',
      'PHONE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status_type') THEN
    CREATE TYPE delivery_status_type AS ENUM (
      'DRAFT',
      'QUEUED',
      'SENT',
      'DELIVERED',
      'BOUNCED',
      'FAILED',
      'OPENED',
      'CLICKED',
      'REPLIED'
    );
  END IF;
END $$;

-- ── 2. prospect_events (append-only) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prospect_events (
  id           bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  prospect_id  bigint NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  event_type   prospect_event_type NOT NULL,
  actor_type   event_actor_type NOT NULL DEFAULT 'SYSTEM',
  actor_id     uuid NULL,                         -- auth.users FK when actor_type = RECRUITER
  occurred_at  timestamptz NOT NULL DEFAULT now(), -- authoritative timestamp
  payload      jsonb NOT NULL DEFAULT '{}',        -- validated per event schema
  source       event_source_type NOT NULL DEFAULT 'MANUAL',
  request_id   text NULL,                          -- trace ID for debugging
  created_at   timestamptz NOT NULL DEFAULT now()  -- row insertion time (immutable)
);

-- This table is append-only: no UPDATE or DELETE from application code.
-- The created_at = insertion time; occurred_at = when the event actually happened.

COMMENT ON TABLE prospect_events IS 'Append-only event stream for prospect lifecycle. Source of truth for lineage and freshness.';
COMMENT ON COLUMN prospect_events.occurred_at IS 'Authoritative event timestamp. Use this for freshness, not created_at.';
COMMENT ON COLUMN prospect_events.payload IS 'Event-specific data. Schema varies by event_type. Validated at API boundary.';

-- ── 3. outreach_messages ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outreach_messages (
  id                  bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  prospect_id         bigint NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  channel             outreach_channel NOT NULL,
  template_id         text NULL,                          -- references template registry
  rendered_subject    text NULL,                          -- email subject (null for SMS)
  rendered_text       text NOT NULL,                      -- the actual message body
  sent_at             timestamptz NULL,                   -- null = draft/queued
  delivery_status     delivery_status_type NOT NULL DEFAULT 'DRAFT',
  provider_message_id text NULL,                          -- external tracking ID
  event_id            bigint NULL REFERENCES prospect_events(id), -- links to OUTREACH_SENT event
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE outreach_messages IS 'Channel-level outreach tracking. Separates message content from the event log.';

-- ── 4. Indexes ──────────────────────────────────────────────────────────────

-- prospect_events: query by prospect, by type, by time
CREATE INDEX IF NOT EXISTS idx_prospect_events_prospect_id
  ON prospect_events(prospect_id);

CREATE INDEX IF NOT EXISTS idx_prospect_events_occurred_at
  ON prospect_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_events_type
  ON prospect_events(event_type);

CREATE INDEX IF NOT EXISTS idx_prospect_events_prospect_time
  ON prospect_events(prospect_id, occurred_at DESC);

-- outreach_messages: query by prospect, by status
CREATE INDEX IF NOT EXISTS idx_outreach_messages_prospect_id
  ON outreach_messages(prospect_id);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_delivery_status
  ON outreach_messages(delivery_status);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_sent_at
  ON outreach_messages(sent_at DESC NULLS LAST);

-- ── 5. Triggers ─────────────────────────────────────────────────────────────

CREATE TRIGGER update_outreach_messages_updated_at
  BEFORE UPDATE ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE prospect_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access"
  ON prospect_events FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_bypass"
  ON prospect_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access"
  ON outreach_messages FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_bypass"
  ON outreach_messages FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── 7. Freshness function ───────────────────────────────────────────────────
-- Computes lineage from the event stream. This is the grounding signal.

CREATE OR REPLACE FUNCTION get_prospect_lineage(p_prospect_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'last_event_type', sub.event_type,
    'last_event_at', sub.occurred_at,
    'last_actor', jsonb_build_object(
      'actor_type', sub.actor_type,
      'actor_id', sub.actor_id
    ),
    'last_contacted_at', (
      SELECT occurred_at
      FROM prospect_events
      WHERE prospect_id = p_prospect_id
        AND event_type IN ('OUTREACH_SENT', 'RESPONSE_RECEIVED')
      ORDER BY occurred_at DESC
      LIMIT 1
    ),
    'event_count', (
      SELECT count(*)
      FROM prospect_events
      WHERE prospect_id = p_prospect_id
    )
  )
  FROM (
    SELECT event_type, occurred_at, actor_type, actor_id
    FROM prospect_events
    WHERE prospect_id = p_prospect_id
    ORDER BY occurred_at DESC
    LIMIT 1
  ) sub;
$$;

COMMENT ON FUNCTION get_prospect_lineage IS 'Returns deterministic lineage for a prospect. Used by AI grounding layer.';

-- ── 8. Auto-emit events on status changes ───────────────────────────────────

CREATE OR REPLACE FUNCTION emit_prospect_status_event()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO prospect_events (prospect_id, event_type, actor_type, payload, source)
    VALUES (
      NEW.id,
      'STATUS_CHANGED',
      'SYSTEM',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      ),
      'API'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prospect_status_event
  AFTER UPDATE ON prospects
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION emit_prospect_status_event();

-- ── 9. Sync last_contacted_at from events ───────────────────────────────────
-- Keeps the materialized column in sync for fast queries without joins.

CREATE OR REPLACE FUNCTION sync_prospect_last_contacted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type IN ('OUTREACH_SENT', 'RESPONSE_RECEIVED') THEN
    UPDATE prospects
    SET last_contacted_at = NEW.occurred_at
    WHERE id = NEW.prospect_id
      AND (last_contacted_at IS NULL OR last_contacted_at < NEW.occurred_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_last_contacted
  AFTER INSERT ON prospect_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('OUTREACH_SENT', 'RESPONSE_RECEIVED'))
  EXECUTE FUNCTION sync_prospect_last_contacted();

-- ── 10. Grants ──────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON prospect_events TO authenticated, service_role;
GRANT ALL ON outreach_messages TO authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_prospect_lineage TO authenticated, service_role;
