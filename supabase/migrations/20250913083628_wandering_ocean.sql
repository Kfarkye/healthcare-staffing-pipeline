/*
  # Fix RLS policies for hot_prospects table

  1. Security Updates
    - Add INSERT policy for authenticated users on hot_prospects table
    - Add SELECT policy for authenticated users on hot_prospects table  
    - Add UPDATE policy for authenticated users on hot_prospects table
    - Add DELETE policy for authenticated users on hot_prospects table

  This resolves the "new row violates row-level security policy" error by allowing
  authenticated users to perform CRUD operations on the hot_prospects table.
*/

-- Add RLS policies for hot_prospects table
CREATE POLICY "Authenticated users can insert hot prospects"
  ON hot_prospects
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read all hot prospects"
  ON hot_prospects
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update hot prospects"
  ON hot_prospects
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete hot prospects"
  ON hot_prospects
  FOR DELETE
  TO authenticated
  USING (true);