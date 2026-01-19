/*
  # Create Interested Clicks Infrastructure

  1. New Tables
    - `interested_clicks` - Tracks candidates who clicked "interested" on job postings
      Columns: application_id, application_date, job_id, candidate details, job details, status, notes

  2. Views
    - `priority_interested_clicks` - Prioritized view with calculated fields for dashboard

  3. Security
    - Enable RLS on interested_clicks
    - Add policies for authenticated and anon users
*/

-- Create interested_clicks table
CREATE TABLE IF NOT EXISTS interested_clicks (
  id bigserial PRIMARY KEY,
  application_id bigint UNIQUE NOT NULL,
  application_date date NOT NULL,
  job_id text NOT NULL,
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  candidate_homestate text,
  job_city text,
  job_state text,
  profession text,
  specialty text,
  recruiter_name text,
  recruiter_email text,
  last_note text,
  last_note_date timestamptz,
  last_note_by text,
  status text DEFAULT 'New',
  facility_name text,
  shift_type text,
  start_date text,
  end_date text,
  pay_range text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE interested_clicks ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Authenticated users can read interested clicks"
  ON interested_clicks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert interested clicks"
  ON interested_clicks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update interested clicks"
  ON interested_clicks
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete interested clicks"
  ON interested_clicks
  FOR DELETE
  TO authenticated
  USING (true);

-- Policies for anon users (for CSV import functionality)
CREATE POLICY "Anon users can read interested clicks"
  ON interested_clicks
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert interested clicks"
  ON interested_clicks
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon users can update interested clicks"
  ON interested_clicks
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_interested_clicks_application_id ON interested_clicks(application_id);
CREATE INDEX IF NOT EXISTS idx_interested_clicks_job_id ON interested_clicks(job_id);
CREATE INDEX IF NOT EXISTS idx_interested_clicks_candidate_email ON interested_clicks(candidate_email);
CREATE INDEX IF NOT EXISTS idx_interested_clicks_status ON interested_clicks(status);
CREATE INDEX IF NOT EXISTS idx_interested_clicks_application_date ON interested_clicks(application_date DESC);

-- Create priority_interested_clicks view
CREATE OR REPLACE VIEW priority_interested_clicks AS
SELECT 
  ic.*,
  -- Calculate if recruiter contacted recently (within 7 days)
  CASE 
    WHEN ic.last_note_date >= NOW() - INTERVAL '7 days' THEN true
    ELSE false
  END AS recruiter_contacted_recently,
  -- Calculate days since application
  EXTRACT(DAY FROM NOW() - ic.application_date::timestamptz)::integer AS days_since_application
FROM interested_clicks ic
WHERE ic.status != 'Closed'
ORDER BY ic.application_date DESC;

-- Create updated_at trigger for interested_clicks
CREATE TRIGGER update_interested_clicks_updated_at
  BEFORE UPDATE ON interested_clicks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
