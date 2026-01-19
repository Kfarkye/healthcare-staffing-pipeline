/*
  # Create job_openings table

  1. New Tables
    - `job_openings`
      - `id` (bigint, primary key, auto-increment)
      - `job_id` (text, unique, not null)
      - `facility_name` (text)
      - `job_title` (text)
      - `profession` (text)
      - `specialty` (text)
      - `location_city` (text)
      - `location_state` (text)
      - `start_date` (date)
      - `posted_date` (date)
      - `updated_date` (date)
      - `open_positions` (integer, default 0)
      - `total_submittals` (integer, default 0)
      - `employment_type` (text)
      - `shift` (text)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `job_openings` table
    - Add policy for authenticated users to read all job openings
    - Add policy for authenticated users to insert job openings
    - Add policy for authenticated users to update job openings
*/

CREATE TABLE IF NOT EXISTS job_openings (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  job_id text UNIQUE NOT NULL,
  facility_name text,
  job_title text,
  profession text,
  specialty text,
  location_city text,
  location_state text,
  start_date date,
  posted_date date,
  updated_date date,
  open_positions integer DEFAULT 0,
  total_submittals integer DEFAULT 0,
  employment_type text,
  shift text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read job openings"
  ON job_openings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job openings"
  ON job_openings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job openings"
  ON job_openings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_job_openings_job_id ON job_openings(job_id);
CREATE INDEX IF NOT EXISTS idx_job_openings_facility_name ON job_openings(facility_name);
CREATE INDEX IF NOT EXISTS idx_job_openings_specialty ON job_openings(specialty);
CREATE INDEX IF NOT EXISTS idx_job_openings_location_state ON job_openings(location_state);