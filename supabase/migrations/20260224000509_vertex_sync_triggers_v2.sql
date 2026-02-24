-- Vertex AI Search incremental sync triggers (v2)
-- Fires async HTTP request to vertex-sync Edge Function on candidate data changes.
-- Uses pg_net for non-blocking fire-and-forget.
--
-- PREREQUISITE: Set the service role key:
--   ALTER DATABASE postgres SET "app.settings.service_role_key" = 'your-service-role-key';

-- Enqueue function (deduplicates via UPSERT)
CREATE OR REPLACE FUNCTION public.enqueue_vertex_sync()
RETURNS TRIGGER AS $$
DECLARE
  target_candidate_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'candidates' THEN
    target_candidate_id := NEW.id;
  ELSE
    target_candidate_id := NEW.candidate_id;
  END IF;

  INSERT INTO public.vertex_sync_queue (candidate_id, queued_at, status, attempts)
  VALUES (target_candidate_id, now(), 'pending', 0)
  ON CONFLICT (candidate_id)
  DO UPDATE SET queued_at = now(), status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Flush function: processes the debounced queue
CREATE OR REPLACE FUNCTION public.flush_vertex_sync_queue()
RETURNS JSONB AS $$
DECLARE
  rec RECORD;
  edge_url TEXT := 'https://hixjxztrblfjbwavyyph.supabase.co/functions/v1/vertex-sync';
  svc_key TEXT;
  synced_count INT := 0;
BEGIN
  svc_key := current_setting('app.settings.service_role_key', true);

  IF svc_key IS NULL OR svc_key = '' THEN
    RAISE EXCEPTION 'app.settings.service_role_key not configured';
  END IF;

  FOR rec IN
    SELECT candidate_id
    FROM public.vertex_sync_queue
    WHERE status = 'pending'
      AND queued_at < now() - INTERVAL '30 seconds'
    ORDER BY queued_at ASC
    LIMIT 20
  LOOP
    UPDATE public.vertex_sync_queue
    SET status = 'syncing', attempts = attempts + 1
    WHERE candidate_id = rec.candidate_id;

    PERFORM net.http_get(
      url := edge_url || '?mode=incremental&candidate_id=' || rec.candidate_id::text,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || svc_key,
        'Content-Type', 'application/json'
      )
    );

    UPDATE public.vertex_sync_queue
    SET status = 'completed', synced_at = now()
    WHERE candidate_id = rec.candidate_id;

    synced_count := synced_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'synced', synced_count,
    'remaining', (SELECT count(*) FROM public.vertex_sync_queue WHERE status = 'pending')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers on all candidate-related tables
CREATE TRIGGER vertex_sync_candidates
  AFTER INSERT OR UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_vertex_sync();

CREATE TRIGGER vertex_sync_certifications
  AFTER INSERT OR UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_vertex_sync();

CREATE TRIGGER vertex_sync_licenses
  AFTER INSERT OR UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_vertex_sync();

CREATE TRIGGER vertex_sync_notes
  AFTER INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_vertex_sync();

CREATE TRIGGER vertex_sync_assignments
  AFTER INSERT OR UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_vertex_sync();
