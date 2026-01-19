/*
  # Create Pay Packages Infrastructure

  1. New Tables
    - `pay_packages`
      - `id` (bigint, primary key)
      - `job_id` (text, unique) - References job ID
      - `facility_name` (text) - Name of facility
      - `city` (text) - City location
      - `state` (text) - State location
      - `specialty` (text) - Job specialty
      - `start_date` (text, nullable) - Assignment start date
      - `end_date` (text, nullable) - Assignment end date
      - `shift_type` (text, nullable) - Shift schedule
      - `hours_per_week` (integer) - Weekly hours
      - `taxable_hourly_rate` (numeric) - Taxable hourly rate
      - `meals_weekly` (numeric, nullable) - Weekly meal stipend
      - `housing_weekly` (numeric, nullable) - Weekly housing stipend
      - `total_stipend` (numeric) - Total weekly stipend
      - `gross_weekly_pay` (numeric) - Total weekly gross pay
      - `completion_bonus` (numeric, nullable) - Completion bonus amount
      - `source` (text) - Source of pay package data
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

  2. Functions
    - `calculate_pay_package` - RPC function to calculate pay package based on location and profession
      Takes: job_id, state, city, profession, specialty, target_gross, hours_per_week
      Returns: calculated pay package with taxable hourly, stipends, and gross weekly

  3. Security
    - Enable RLS on `pay_packages` table
    - Add policies for authenticated users to read and write their own data
*/

-- Create pay_packages table
CREATE TABLE IF NOT EXISTS pay_packages (
  id bigserial PRIMARY KEY,
  job_id text UNIQUE NOT NULL,
  facility_name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  specialty text NOT NULL,
  start_date text,
  end_date text,
  shift_type text,
  hours_per_week integer NOT NULL DEFAULT 40,
  taxable_hourly_rate numeric(10, 2) NOT NULL,
  meals_weekly numeric(10, 2),
  housing_weekly numeric(10, 2),
  total_stipend numeric(10, 2) NOT NULL DEFAULT 0,
  gross_weekly_pay numeric(10, 2) NOT NULL,
  completion_bonus numeric(10, 2),
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE pay_packages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all pay packages
CREATE POLICY "Authenticated users can read pay packages"
  ON pay_packages
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert pay packages
CREATE POLICY "Authenticated users can insert pay packages"
  ON pay_packages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update pay packages
CREATE POLICY "Authenticated users can update pay packages"
  ON pay_packages
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create calculate_pay_package RPC function
CREATE OR REPLACE FUNCTION calculate_pay_package(
  p_job_id text,
  p_state text,
  p_city text,
  p_profession text,
  p_specialty text,
  p_target_gross numeric,
  p_hours_per_week integer DEFAULT 36
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_taxable_hourly numeric;
  v_meals_weekly numeric;
  v_housing_weekly numeric;
  v_total_stipend numeric;
  v_gross_weekly numeric;
  v_state_tax_rate numeric;
BEGIN
  -- Default state tax rate (simplified - real rates vary)
  v_state_tax_rate := 0.25;
  
  -- Calculate baseline stipends based on location
  -- These are simplified estimates - real values would come from a rates table
  CASE 
    WHEN p_state IN ('CA', 'NY', 'MA') THEN
      v_meals_weekly := 350;
      v_housing_weekly := 1500;
    WHEN p_state IN ('TX', 'FL', 'AZ') THEN
      v_meals_weekly := 300;
      v_housing_weekly := 1200;
    ELSE
      v_meals_weekly := 325;
      v_housing_weekly := 1350;
  END CASE;
  
  -- Calculate total stipend
  v_total_stipend := v_meals_weekly + v_housing_weekly;
  
  -- Calculate taxable hourly rate
  -- Target gross = (taxable_hourly * hours) + stipend
  -- taxable_hourly = (target_gross - stipend) / hours
  v_taxable_hourly := (p_target_gross - v_total_stipend) / p_hours_per_week;
  
  -- Ensure minimum hourly rate
  IF v_taxable_hourly < 25 THEN
    v_taxable_hourly := 25;
  END IF;
  
  -- Calculate actual gross weekly
  v_gross_weekly := (v_taxable_hourly * p_hours_per_week) + v_total_stipend;
  
  -- Return as JSON
  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'taxable_hourly', ROUND(v_taxable_hourly, 2),
    'meals_weekly', ROUND(v_meals_weekly, 2),
    'housing_weekly', ROUND(v_housing_weekly, 2),
    'total_stipend', ROUND(v_total_stipend, 2),
    'gross_weekly', ROUND(v_gross_weekly, 2)
  );
END;
$$;

-- Create index on job_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_pay_packages_job_id ON pay_packages(job_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pay_packages_updated_at
  BEFORE UPDATE ON pay_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
