-- ============================================================================
-- Patch Migration: Cold Outreach Blast System Hardening (Additive)
-- No drops. No feature removal.
-- Addresses: Ownership RLS, Dedupe Guard, updated_at trigger, Storage Path
-- ============================================================================

-- 0) Extensions (gen_random_uuid requires pgcrypto in many setups)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) ADD OWNERSHIP (audit-grade)
-- ============================================================================
ALTER TABLE cold_outreach_campaigns
  ADD COLUMN IF NOT EXISTS owner_id UUID;

-- Backfill owner_id if null (will be set by app code on insert going forward)
-- Note: auth.uid() only works in RLS context, so we leave NULL for existing rows
-- App code MUST set owner_id on insert

-- ============================================================================
-- 2) ADD RECIPIENT updated_at + TRIGGER
-- ============================================================================
ALTER TABLE cold_outreach_recipients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_recipients_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_recipients_timestamp ON cold_outreach_recipients;

CREATE TRIGGER tr_update_recipients_timestamp
BEFORE UPDATE ON cold_outreach_recipients
FOR EACH ROW
EXECUTE FUNCTION update_recipients_timestamp();

-- ============================================================================
-- 3) DEDUPE: Prevent double entries per campaign
-- ============================================================================
-- Add normalized email column for case-insensitive uniqueness
ALTER TABLE cold_outreach_recipients
  ADD COLUMN IF NOT EXISTS email_normalized TEXT;

-- Backfill existing rows
UPDATE cold_outreach_recipients
SET email_normalized = LOWER(TRIM(email))
WHERE email_normalized IS NULL;

-- Unique index on (campaign_id, email_normalized) prevents double-sends
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipients_campaign_email
ON cold_outreach_recipients (campaign_id, email_normalized);

-- Index for fast lookup by normalized email
CREATE INDEX IF NOT EXISTS idx_recipients_email_normalized
ON cold_outreach_recipients (email_normalized);

-- ============================================================================
-- 4) STORE PAY PACKAGE STORAGE KEY/PATH (additive, keep URL too)
-- ============================================================================
ALTER TABLE cold_outreach_campaigns
  ADD COLUMN IF NOT EXISTS pay_package_path TEXT;

COMMENT ON COLUMN cold_outreach_campaigns.pay_package_path IS 'Storage key/path for pay package file. Generate signed URLs at render time.';
COMMENT ON COLUMN cold_outreach_campaigns.pay_package_url IS 'DEPRECATED: Use pay_package_path and generate signed URLs instead.';

-- ============================================================================
-- 5) TIGHTEN RLS (replace open policies with ownership-based)
-- ============================================================================
-- RLS already enabled in original migration

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated" ON cold_outreach_campaigns;
DROP POLICY IF EXISTS "Allow all for authenticated" ON cold_outreach_recipients;

-- Campaigns: only owner can read/write
CREATE POLICY "campaigns_owner_select"
ON cold_outreach_campaigns
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "campaigns_owner_insert"
ON cold_outreach_campaigns
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "campaigns_owner_update"
ON cold_outreach_campaigns
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "campaigns_owner_delete"
ON cold_outreach_campaigns
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Recipients: access through ownership of parent campaign
CREATE POLICY "recipients_owner_select"
ON cold_outreach_recipients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM cold_outreach_campaigns c
    WHERE c.id = cold_outreach_recipients.campaign_id
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY "recipients_owner_insert"
ON cold_outreach_recipients
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cold_outreach_campaigns c
    WHERE c.id = cold_outreach_recipients.campaign_id
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY "recipients_owner_update"
ON cold_outreach_recipients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM cold_outreach_campaigns c
    WHERE c.id = cold_outreach_recipients.campaign_id
      AND c.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cold_outreach_campaigns c
    WHERE c.id = cold_outreach_recipients.campaign_id
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY "recipients_owner_delete"
ON cold_outreach_recipients
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM cold_outreach_campaigns c
    WHERE c.id = cold_outreach_recipients.campaign_id
      AND c.owner_id = auth.uid()
  )
);

-- ============================================================================
-- 6) HELPFUL COMMENTS
-- ============================================================================
COMMENT ON COLUMN cold_outreach_campaigns.owner_id IS 'User who created the campaign. MUST be set by app code on insert.';
COMMENT ON COLUMN cold_outreach_recipients.email_normalized IS 'Lowercase trimmed email for deduplication. Auto-populated.';
COMMENT ON COLUMN cold_outreach_recipients.updated_at IS 'Last modification timestamp. Auto-updated by trigger.';
