-- Storage Migration for Command Center Attachments
-- Created: 2026-01-20
-- Purpose: Create a private bucket for chat attachments with secure RLS.

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('command-center-attachments', 'command-center-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create POLICIES
-- Allow authenticated users to upload files to their own folder
DROP POLICY IF EXISTS "Users can upload attachments to their own folder" ON storage.objects;
CREATE POLICY "Users can upload attachments to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'command-center-attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own attachments
DROP POLICY IF EXISTS "Users can view their own attachments" ON storage.objects;
CREATE POLICY "Users can view their own attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'command-center-attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own attachments
DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;
CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'command-center-attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
