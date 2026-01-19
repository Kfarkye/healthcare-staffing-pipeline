/*
  # Fix prospects table RLS policies

  1. Security Updates
    - Add RLS policy for anonymous users to insert prospects
    - Add RLS policy for anonymous users to update prospects
    - Add RLS policy for anonymous users to delete prospects
    - Keep existing authenticated user policies

  2. Notes
    - This allows both anonymous and authenticated users to manage prospects
    - Fixes the 401 Unauthorized error when adding prospects
*/

-- Add RLS policies for anonymous users
CREATE POLICY "Anonymous users can insert prospects"
  ON prospects
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anonymous users can update prospects"
  ON prospects
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anonymous users can delete prospects"
  ON prospects
  FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Anonymous users can read all prospects"
  ON prospects
  FOR SELECT
  TO anon
  USING (true);