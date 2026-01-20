-- AI Audit Logs Migration
-- Created: 2026-01-20
-- Purpose: Capture granular traces of all AI function invocations for debugging and observability.

-- ============================================================================
-- 1. AI AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  function_name text NOT NULL, -- 'chat-command-center', 'research-chat', 'extract-pay-package'
  
  -- Request
  input_message text,
  input_metadata jsonb DEFAULT '{}'::jsonb, -- e.g., attachment info, context
  
  -- Response
  output_text text,
  output_metadata jsonb DEFAULT '{}'::jsonb, -- e.g., grounding metadata, citations
  finish_reason text, -- 'STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER'
  
  -- Tool Usage
  tool_calls jsonb DEFAULT '[]'::jsonb, -- Array of { name, args, response }
  
  -- Performance & Errors
  latency_ms integer,
  error_message text,
  error_details jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_audit_user ON ai_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_function ON ai_audit_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_ai_audit_created ON ai_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_errors ON ai_audit_logs(error_message) WHERE error_message IS NOT NULL;

-- ============================================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view own ai_audit_logs" ON ai_audit_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access to ai_audit_logs" ON ai_audit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. PERMISSIONS
-- ============================================================================

GRANT ALL ON ai_audit_logs TO postgres, service_role;
GRANT SELECT ON ai_audit_logs TO authenticated;
