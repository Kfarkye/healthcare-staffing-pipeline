/*
  # Create reimbursement logs table

  1. New Tables
    - `reimbursement_logs`
      - `id` (bigint, primary key)
      - `candidate_id` (text)
      - `candidate_name` (text)
      - `cert_type` (text)
      - `amount` (numeric)
      - `transaction_date` (date)
      - `vendor` (text)
      - `notes` (text)
      - `status` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `reimbursement_logs` table
    - Add policy for authenticated users to manage reimbursement logs
*/

CREATE TABLE IF NOT EXISTS reimbursement_logs (
  id bigint PRIMARY KEY DEFAULT generate_random_bigint(),
  candidate_id text NOT NULL,
  candidate_name text NOT NULL,
  cert_type text NOT NULL,
  amount numeric(10,2) NOT NULL,
  transaction_date date NOT NULL,
  vendor text NOT NULL,
  notes text DEFAULT '',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE reimbursement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage reimbursement logs"
  ON reimbursement_logs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reimbursement_logs_candidate_id 
  ON reimbursement_logs(candidate_id);

CREATE INDEX IF NOT EXISTS idx_reimbursement_logs_created_at 
  ON reimbursement_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reimbursement_logs_status 
  ON reimbursement_logs(status);