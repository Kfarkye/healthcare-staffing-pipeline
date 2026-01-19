/*
  # Create prospects table with RLS policies

  1. New Tables
    - `prospects`
      - `id` (bigint, primary key, auto-increment)
      - `candidate_id` (bigint, unique, references candidates table)
      - `name` (text, not null)
      - `email` (text, nullable)
      - `phone` (text, nullable)
      - `specialty` (text, nullable)
      - `recruiter` (text, nullable)
      - `notes` (text, nullable)
      - `status` (text, default 'New')
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `prospects` table
    - Add policy for authenticated users to read all prospects
    - Add policy for authenticated users to insert prospects
    - Add policy for authenticated users to update prospects
    - Add policy for authenticated users to delete prospects

  3. Indexes
    - Index on candidate_id for faster lookups
    - Index on status for filtering
*/

-- Create prospects table if it doesn't exist
CREATE TABLE IF NOT EXISTS prospects (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  candidate_id bigint UNIQUE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  specialty text,
  recruiter text,
  notes text,
  status text DEFAULT 'New',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can read all prospects"
  ON prospects
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert prospects"
  ON prospects
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update prospects"
  ON prospects
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete prospects"
  ON prospects
  FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prospects_candidate_id ON prospects(candidate_id);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_created_at ON prospects(created_at);