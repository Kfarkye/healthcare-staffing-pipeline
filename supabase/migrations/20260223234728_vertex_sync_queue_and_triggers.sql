-- Vertex AI Search sync queue (initial version)
-- Superseded by vertex_sync_triggers_v2 but kept for migration chain integrity

CREATE TABLE IF NOT EXISTS public.vertex_sync_queue (
  candidate_id UUID PRIMARY KEY,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'completed', 'failed')),
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0
);

ALTER TABLE public.vertex_sync_queue ENABLE ROW LEVEL SECURITY;
