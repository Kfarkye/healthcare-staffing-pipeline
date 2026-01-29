-- Migration: Add validation columns to ai_audit_logs
-- Created: 2026-01-28
-- Purpose: Track validation results for AI responses

-- Add trace_id if not exists (from previous migration)
ALTER TABLE ai_audit_logs 
ADD COLUMN IF NOT EXISTS trace_id text;

-- Add intent column if not exists
ALTER TABLE ai_audit_logs 
ADD COLUMN IF NOT EXISTS intent text;

-- Add validation tracking columns
ALTER TABLE ai_audit_logs 
ADD COLUMN IF NOT EXISTS valid boolean DEFAULT true;

ALTER TABLE ai_audit_logs 
ADD COLUMN IF NOT EXISTS validation_issues integer DEFAULT 0;

-- Create index for validation queries
CREATE INDEX IF NOT EXISTS idx_ai_audit_valid ON ai_audit_logs(valid) WHERE valid = false;

-- Comments for documentation
COMMENT ON COLUMN ai_audit_logs.valid IS 'Whether the AI response passed validation';
COMMENT ON COLUMN ai_audit_logs.validation_issues IS 'Count of validation issues found';
COMMENT ON COLUMN ai_audit_logs.trace_id IS 'Unique trace ID for request correlation';
COMMENT ON COLUMN ai_audit_logs.intent IS 'Classified intent of the request';
