-- Fix RLS policy for ai_audit_logs to allow service role inserts
-- The original policy only had USING clause, which doesn't work for INSERT operations
-- ALTER TABLE requires WITH CHECK clause for INSERT validation

-- Drop existing service role policy
DROP POLICY IF EXISTS "Service role full access to ai_audit_logs" ON ai_audit_logs;

-- Recreate with both USING (for SELECT/UPDATE/DELETE) and WITH CHECK (for INSERT/UPDATE)
CREATE POLICY "Service role full access to ai_audit_logs" ON ai_audit_logs
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Also add a permissive insert policy for Edge Functions without auth context
-- Edge Functions may not have a proper auth.role() set, so we need a fallback
DROP POLICY IF EXISTS "Allow anon insert to ai_audit_logs" ON ai_audit_logs;

CREATE POLICY "Allow anon insert to ai_audit_logs" ON ai_audit_logs
  FOR INSERT 
  WITH CHECK (true);
