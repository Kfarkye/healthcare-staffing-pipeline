-- Migration: Create ai_audit_logs table with validation columns
-- Created: 2026-01-28
-- Purpose: Capture granular traces of all AI function invocations

-- ============================================================================
-- 1. CREATE TABLE (Full Schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  user_id uuid,
  function_name text NOT NULL,
  trace_id text,
  intent text,
  
  -- Request
  input_message text,
  input_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Response
  output_text text,
  output_metadata jsonb DEFAULT '{}'::jsonb,
  finish_reason text,
  
  -- Validation
  valid boolean DEFAULT true,
  validation_issues integer DEFAULT 0,
  
  -- Tool Usage
  tool_calls jsonb DEFAULT '[]'::jsonb,
  
  -- Performance & Errors
  latency_ms integer,
  error_message text,
  error_details jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ai_audit_function ON ai_audit_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_ai_audit_created ON ai_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_trace ON ai_audit_logs(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_audit_intent ON ai_audit_logs(intent) WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_audit_valid ON ai_audit_logs(valid) WHERE valid = false;
CREATE INDEX IF NOT EXISTS idx_ai_audit_errors ON ai_audit_logs(error_message) WHERE error_message IS NOT NULL;

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for Edge Functions and API routes)
DROP POLICY IF EXISTS "Service role full access to ai_audit_logs" ON ai_audit_logs;
CREATE POLICY "Service role full access to ai_audit_logs" ON ai_audit_logs
  FOR ALL USING (true);

-- ============================================================================
-- 4. PERMISSIONS
-- ============================================================================

GRANT ALL ON ai_audit_logs TO postgres, service_role, anon, authenticated;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE ai_audit_logs IS 'Audit log for all AI function invocations';
COMMENT ON COLUMN ai_audit_logs.trace_id IS 'Unique trace ID for request correlation';
COMMENT ON COLUMN ai_audit_logs.intent IS 'Classified intent of the request';
COMMENT ON COLUMN ai_audit_logs.valid IS 'Whether the AI response passed validation';
COMMENT ON COLUMN ai_audit_logs.validation_issues IS 'Count of validation issues found';
