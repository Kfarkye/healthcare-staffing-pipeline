-- ============================================================================
-- 2026-01-19: Credential Packs (Encrypted Sharing)
-- ============================================================================

-- Table for encrypted pack metadata
CREATE TABLE IF NOT EXISTS public.credential_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
    encrypted_data TEXT NOT NULL, -- The AES-GCM ciphertext + IV
    pack_name TEXT, -- Optional, also encrypted ideally but plaintext for index is fine
    view_count INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.credential_packs ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert (anonymous uploads)
CREATE POLICY "Public anonymous insert" ON public.credential_packs
FOR INSERT TO anon
WITH CHECK (true);

-- Policy: Anyone can read if they have the ID
CREATE POLICY "Public read by ID" ON public.credential_packs
FOR SELECT TO anon
USING (true);

-- Storage Bucket for Encrypted Files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('credential-packs', 'credential-packs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Public anonymous storage upload" ON storage.objects
FOR INSERT TO anon
WITH CHECK (bucket_id = 'credential-packs');

CREATE POLICY "Public storage read" ON storage.objects
FOR SELECT TO anon
USING (bucket_id = 'credential-packs');

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_credential_packs_expires_at ON public.credential_packs (expires_at);
