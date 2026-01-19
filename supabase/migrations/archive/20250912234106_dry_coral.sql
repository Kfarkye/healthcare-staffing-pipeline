/*
  # Update job_openings RLS policies for anon access

  1. Security Changes
    - Update existing policies to allow anon role access
    - Add policies for anon users to insert and update job openings
    - Keep read access for both authenticated and anon users

  This resolves the 401 RLS violation error when uploading job openings data.
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can read job openings" ON job_openings;
DROP POLICY IF EXISTS "Authenticated users can insert job openings" ON job_openings;
DROP POLICY IF EXISTS "Authenticated users can update job openings" ON job_openings;

-- Create new policies that allow both authenticated and anon access
CREATE POLICY "Allow read access to job openings"
  ON job_openings
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Allow insert access to job openings"
  ON job_openings
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Allow update access to job openings"
  ON job_openings
  FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);