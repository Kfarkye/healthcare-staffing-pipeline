-- Migration: Add trace_id and intent columns to ai_audit_logs
-- Purpose: Support the new v5.1 observability architecture
-- Created: 2026-01-27

-- Add trace_id for request tracing
ALTER TABLE ai_audit_logs 
ADD COLUMN IF NOT EXISTS trace_id text;

-- Add intent column for classification tracking
ALTER TABLE ai_audit_logs 
ADD COLUMN IF NOT EXISTS intent text;

-- Add validation_issues count
ALTER TABLE ai_audit_logs 
ADD COLUMN IF NOT EXISTS validation_issues integer DEFAULT 0;

-- Create index on trace_id for log correlation
CREATE INDEX IF NOT EXISTS idx_ai_audit_trace ON ai_audit_logs(trace_id) WHERE trace_id IS NOT NULL;

-- Create index on intent for analytics
CREATE INDEX IF NOT EXISTS idx_ai_audit_intent ON ai_audit_logs(intent) WHERE intent IS NOT NULL;

-- Update input_message to allow longer snippets
COMMENT ON COLUMN ai_audit_logs.input_message IS 'First 500 chars of user input (input_snippet in code maps here)';
