/*
  # Template Persistence Schema

  1. Changes
    - Add `template_file_path` column to `prospects` table for storing Supabase Storage paths
    - Add `template_extracted_data` column for caching extracted offer data as JSONB
    - Add `template_uploaded_at` column for tracking upload timestamps

  2. Purpose
    - Enables seamless EmailTemplateModal workflow by persisting uploaded screenshots
    - Eliminates data loss when users close/reopen the modal
    - Stores extracted pay package data for instant restoration

  3. Security
    - No RLS changes needed; existing prospect policies apply
    - File URLs are stored as text paths, not public URLs (security through obscurity)
*/

-- Add template persistence columns to prospects table
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS template_file_path text NULL,
  ADD COLUMN IF NOT EXISTS template_extracted_data jsonb NULL,
  ADD COLUMN IF NOT EXISTS template_uploaded_at timestamptz NULL;

-- Add helpful comments for schema documentation
COMMENT ON COLUMN public.prospects.template_file_path IS
  'Storage path to uploaded pay package template file in Supabase Storage (screenshots bucket)';

COMMENT ON COLUMN public.prospects.template_extracted_data IS
  'Extracted offer data from template (facility, rates, dates, etc.) - cached for instant modal restoration';

COMMENT ON COLUMN public.prospects.template_uploaded_at IS
  'Timestamp of most recent template upload - used for cache invalidation and UI display';
