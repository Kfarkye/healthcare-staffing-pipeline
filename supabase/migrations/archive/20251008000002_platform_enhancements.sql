/*
  # Platform Enhancements: Email Drafts, Bulk Operations, Search, and Schema Utilities

  1. New Tables
    - `email_drafts` - Cross-device email draft persistence with RLS
      - `id` (uuid, primary key)
      - `prospect_id` (bigint, FK to prospects)
      - `user_id` (uuid, FK to auth.users)
      - `subject` (text)
      - `body` (text)
      - `created_at`, `updated_at` (timestamptz)
      - Unique constraint: one draft per user per prospect

  2. New Functions
    - `get_enum_values(table_name, column_name)` - Dynamically fetch ENUM options for UI dropdowns
    - `bulk_update_prospect_status(prospect_ids[], new_status)` - Efficient bulk status updates

  3. Search Optimization
    - Add `search_vector` tsvector column to prospects table for full-text search
    - Generated column automatically updates on row changes
    - GIN index for fast full-text queries

  4. Security
    - RLS enabled on email_drafts table
    - Policy: Users can only access their own drafts
    - Functions use SECURITY DEFINER with explicit grants
*/

-- ============================================================================
-- EMAIL DRAFTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id bigint NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_drafts_unique_per_prospect_user UNIQUE (prospect_id, user_id)
);

-- Index for fast lookup by prospect and user
CREATE INDEX IF NOT EXISTS idx_email_drafts_prospect_user
  ON public.email_drafts(prospect_id, user_id);

-- Enable RLS and create policy
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own drafts"
  ON public.email_drafts
  FOR ALL
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_email_drafts_updated_at
  BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.email_drafts IS
  'Stores email draft state per user per prospect for cross-device sync';

-- ============================================================================
-- DYNAMIC ENUM FETCHER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_enum_values(table_name text, column_name text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  enum_type text;
  enum_values text[];
BEGIN
  -- Get the enum type name from the column definition
  SELECT udt_name INTO enum_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = get_enum_values.table_name
    AND column_name = get_enum_values.column_name;

  IF enum_type IS NULL THEN
    RAISE EXCEPTION 'Column %.% not found or is not an ENUM type', table_name, column_name;
  END IF;

  -- Fetch all enum values in order
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO enum_values
  FROM pg_enum
  WHERE enumtypid = ('public.' || enum_type)::regtype;

  RETURN enum_values;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_enum_values(text, text) TO authenticated;

COMMENT ON FUNCTION public.get_enum_values IS
  'Dynamically fetches ENUM values for a table column - useful for generating UI dropdowns';

-- ============================================================================
-- BULK STATUS UPDATE RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_prospect_status(
  prospect_ids bigint[],
  new_status text
)
RETURNS TABLE (id bigint, status text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.prospects
  SET
    status = new_status::text,
    updated_at = now()
  WHERE public.prospects.id = ANY(prospect_ids)
  RETURNING public.prospects.id, public.prospects.status::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_prospect_status(bigint[], text) TO authenticated;

COMMENT ON FUNCTION public.bulk_update_prospect_status IS
  'Efficiently updates status for multiple prospects in a single transaction';

-- ============================================================================
-- FULL-TEXT SEARCH OPTIMIZATION
-- ============================================================================

-- Add generated tsvector column for full-text search
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(specialty, '') || ' ' ||
      coalesce(profession, '') || ' ' ||
      coalesce(facility, '')
    )
  ) STORED;

-- Create GIN index for fast full-text queries
CREATE INDEX IF NOT EXISTS idx_prospects_search
  ON public.prospects USING GIN (search_vector);

COMMENT ON COLUMN public.prospects.search_vector IS
  'Generated tsvector for full-text search across name, email, specialty, profession, and facility';
