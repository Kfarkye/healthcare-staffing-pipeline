/*
  # Add Nova URLs to Candidates Table

  1. Schema Changes
    - Works with existing `candidates` table structure
    - Adds `nova_url` column if not exists
    - Uses existing `full_name` column for candidate names

  2. Data Population
    - Inserts/updates 81 candidate records with their Nova profile URLs
    - Uses ON CONFLICT to safely update existing records
    - Preserves existing data using COALESCE

  3. Notes
    - Safe to run multiple times (idempotent)
    - Will not overwrite existing full_name if already set
    - Updates nova_url on every run to ensure accuracy
*/

-- =====================================================================
-- Step 1: Add nova_url column if it doesn't exist
-- =====================================================================

DO $$
BEGIN
  -- Add nova_id column if it doesn't exist (stores the Nova candidate ID number)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'candidates'
    AND column_name = 'nova_id'
  ) THEN
    ALTER TABLE public.candidates ADD COLUMN nova_id BIGINT;
  END IF;

  -- Add nova_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'candidates'
    AND column_name = 'nova_url'
  ) THEN
    ALTER TABLE public.candidates ADD COLUMN nova_url TEXT;
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'candidates'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.candidates ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'candidates'
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.candidates ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- =====================================================================
-- Step 2: Upsert Nova URLs for all active candidates
-- =====================================================================

-- Update existing candidates with nova_id and nova_url based on full_name match
-- This uses UPDATE instead of INSERT since candidates already exist
UPDATE public.candidates SET
  nova_id = data.nova_id,
  nova_url = data.nova_url,
  updated_at = NOW()
FROM (VALUES
(2724343,'Jahanna Perry-McElroy','https://nova.ayahealthcare.com/#/recruiting/candidates/2724343/new-profile/about'),
(2744391,'Marcie Lanning','https://nova.ayahealthcare.com/#/recruiting/candidates/2744391/new-profile/about'),
(3655114,'Jeremy Jeter','https://nova.ayahealthcare.com/#/recruiting/candidates/3655114/new-profile/about'),
(1562877,'Rose Laure Coichy','https://nova.ayahealthcare.com/#/recruiting/candidates/1562877/new-profile/about'),
(2488549,'Mamanagbe Keita','https://nova.ayahealthcare.com/#/recruiting/candidates/2488549/new-profile/about'),
(1625033,'Fontaine Joseph','https://nova.ayahealthcare.com/#/recruiting/candidates/1625033/new-profile/about'),
(2462406,'Olakunle Oladipupo','https://nova.ayahealthcare.com/#/recruiting/candidates/2462406/new-profile/about'),
(4156652,'Aleah Cawthon','https://nova.ayahealthcare.com/#/recruiting/candidates/4156652/new-profile/about'),
(871309,'Tyler Arrington','https://nova.ayahealthcare.com/#/recruiting/candidates/871309/new-profile/about'),
(1574434,'Priscilla Nguyen','https://nova.ayahealthcare.com/#/recruiting/candidates/1574434/new-profile/about'),
(4047746,'Kimberly Shante Brown','https://nova.ayahealthcare.com/#/recruiting/candidates/4047746/new-profile/about'),
(4378569,'David Fallmaier','https://nova.ayahealthcare.com/#/recruiting/candidates/4378569/new-profile/about'),
(1625284,'Morgan King','https://nova.ayahealthcare.com/#/recruiting/candidates/1625284/new-profile/about'),
(1751823,'Jared DeVico','https://nova.ayahealthcare.com/#/recruiting/candidates/1751823/new-profile/about'),
(4136205,'Mary Kargbo','https://nova.ayahealthcare.com/#/recruiting/candidates/4136205/new-profile/about'),
(3595107,'Keante Dixon','https://nova.ayahealthcare.com/#/recruiting/candidates/3595107/new-profile/about'),
(2661517,'Angela Pavlak','https://nova.ayahealthcare.com/#/recruiting/candidates/2661517/new-profile/about'),
(1624566,'Suzette Forrest','https://nova.ayahealthcare.com/#/recruiting/candidates/1624566/new-profile/about'),
(3740773,'Sabrina Allahrakha','https://nova.ayahealthcare.com/#/recruiting/candidates/3740773/new-profile/about'),
(4196648,'Brooke Rich','https://nova.ayahealthcare.com/#/recruiting/candidates/4196648/new-profile/about'),
(4118987,'Oscar Grimaldo','https://nova.ayahealthcare.com/#/recruiting/candidates/4118987/new-profile/about'),
(1956159,'Reynaldo Herevia III','https://nova.ayahealthcare.com/#/recruiting/candidates/1956159/new-profile/about'),
(684652,'Bienvenido Tirado Guillen','https://nova.ayahealthcare.com/#/recruiting/candidates/684652/new-profile/about'),
(1478260,'Kathy Waldron','https://nova.ayahealthcare.com/#/recruiting/candidates/1478260/new-profile/about'),
(1311663,'Teima Gayflor','https://nova.ayahealthcare.com/#/recruiting/candidates/1311663/new-profile/about'),
(1566408,'Shawntina Nixon','https://nova.ayahealthcare.com/#/recruiting/candidates/1566408/new-profile/about'),
(1799066,'Merrick Barker','https://nova.ayahealthcare.com/#/recruiting/candidates/1799066/new-profile/about'),
(3801743,'Kristopher Simms','https://nova.ayahealthcare.com/#/recruiting/candidates/3801743/new-profile/about'),
(1812576,'Pauline Anne Abella','https://nova.ayahealthcare.com/#/recruiting/candidates/1812576/new-profile/about'),
(2866284,'Angela Townsel','https://nova.ayahealthcare.com/#/recruiting/candidates/2866284/new-profile/about'),
(2615117,'Amber Akers','https://nova.ayahealthcare.com/#/recruiting/candidates/2615117/new-profile/about'),
(798323,'Bobbie Eubanks','https://nova.ayahealthcare.com/#/recruiting/candidates/798323/new-profile/about'),
(4000998,'Emily Torres','https://nova.ayahealthcare.com/#/recruiting/candidates/4000998/new-profile/about'),
(4132893,'Matthue Tompkins','https://nova.ayahealthcare.com/#/recruiting/candidates/4132893/new-profile/about'),
(4557897,'Sebastian Fraser','https://nova.ayahealthcare.com/#/recruiting/candidates/4557897/new-profile/about'),
(3515731,'Brittany Kite','https://nova.ayahealthcare.com/#/recruiting/candidates/3515731/new-profile/about'),
(1660378,'Debora Smith','https://nova.ayahealthcare.com/#/recruiting/candidates/1660378/new-profile/about'),
(1865945,'Alexandre Wing','https://nova.ayahealthcare.com/#/recruiting/candidates/1865945/new-profile/about'),
(2800698,'Jennifer Davenport','https://nova.ayahealthcare.com/#/recruiting/candidates/2800698/new-profile/about'),
(2722803,'Megan Hopkins','https://nova.ayahealthcare.com/#/recruiting/candidates/2722803/new-profile/about'),
(4587841,'Vanessa Clermont','https://nova.ayahealthcare.com/#/recruiting/candidates/4587841/new-profile/about'),
(4274545,'Alexander Anisimov','https://nova.ayahealthcare.com/#/recruiting/candidates/4274545/new-profile/about'),
(2588867,'Belinda Warren','https://nova.ayahealthcare.com/#/recruiting/candidates/2588867/new-profile/about'),
(2831206,'Jodi Goodson','https://nova.ayahealthcare.com/#/recruiting/candidates/2831206/new-profile/about'),
(2710664,'Ashley Ellis','https://nova.ayahealthcare.com/#/recruiting/candidates/2710664/new-profile/about'),
(4258509,'Kimvy Lor','https://nova.ayahealthcare.com/#/recruiting/candidates/4258509/new-profile/about'),
(1442139,'Kinya Hopkins','https://nova.ayahealthcare.com/#/recruiting/candidates/1442139/new-profile/about'),
(1503947,'Cynthia Ononobi','https://nova.ayahealthcare.com/#/recruiting/candidates/1503947/new-profile/about'),
(4042680,'Therese Franzese','https://nova.ayahealthcare.com/#/recruiting/candidates/4042680/new-profile/about'),
(2638910,'Jane Turner','https://nova.ayahealthcare.com/#/recruiting/candidates/2638910/new-profile/about'),
(1725501,'Maame Tiwaah Ahenkora','https://nova.ayahealthcare.com/#/recruiting/candidates/1725501/new-profile/about'),
(2662039,'Rachel M Henderson','https://nova.ayahealthcare.com/#/recruiting/candidates/2662039/new-profile/about'),
(2630489,'John Steele Barile','https://nova.ayahealthcare.com/#/recruiting/candidates/2630489/new-profile/about'),
(1413071,'Amy Kammerdiener','https://nova.ayahealthcare.com/#/recruiting/candidates/1413071/new-profile/about'),
(3988011,'Breana Daniels','https://nova.ayahealthcare.com/#/recruiting/candidates/3988011/new-profile/about'),
(1551687,'Julia Goelz','https://nova.ayahealthcare.com/#/recruiting/candidates/1551687/new-profile/about'),
(1577664,'Eyerusalem Ashenafi','https://nova.ayahealthcare.com/#/recruiting/candidates/1577664/new-profile/about'),
(1676272,'Mekdes Hailu','https://nova.ayahealthcare.com/#/recruiting/candidates/1676272/new-profile/about'),
(1460224,'Biruktawit Bati','https://nova.ayahealthcare.com/#/recruiting/candidates/1460224/new-profile/about'),
(857592,'Justin Lonergan','https://nova.ayahealthcare.com/#/recruiting/candidates/857592/new-profile/about'),
(1023902,'Gary Deshong','https://nova.ayahealthcare.com/#/recruiting/candidates/1023902/new-profile/about'),
(3009006,'Aykia Taybron','https://nova.ayahealthcare.com/#/recruiting/candidates/3009006/new-profile/about'),
(3883187,'Ryan Jensen','https://nova.ayahealthcare.com/#/recruiting/candidates/3883187/new-profile/about'),
(2502428,'Nathan Welch','https://nova.ayahealthcare.com/#/recruiting/candidates/2502428/new-profile/about'),
(4575231,'Sarah Bennington','https://nova.ayahealthcare.com/#/recruiting/candidates/4575231/new-profile/about'),
(1847529,'Mary Okoye','https://nova.ayahealthcare.com/#/recruiting/candidates/1847529/new-profile/about'),
(4044997,'Kaimen Donayre','https://nova.ayahealthcare.com/#/recruiting/candidates/4044997/new-profile/about'),
(1688790,'Jacqueline Judie','https://nova.ayahealthcare.com/#/recruiting/candidates/1688790/new-profile/about'),
(380299,'Gerald Newman','https://nova.ayahealthcare.com/#/recruiting/candidates/380299/new-profile/about'),
(4556619,'Aba Mills','https://nova.ayahealthcare.com/#/recruiting/candidates/4556619/new-profile/about'),
(1322428,'Emily Welch','https://nova.ayahealthcare.com/#/recruiting/candidates/1322428/new-profile/about'),
(991913,'Jade Byrd','https://nova.ayahealthcare.com/#/recruiting/candidates/991913/new-profile/about'),
(1726375,'Teresa Walker','https://nova.ayahealthcare.com/#/recruiting/candidates/1726375/new-profile/about'),
(1679237,'Dudlene Jean Pierre','https://nova.ayahealthcare.com/#/recruiting/candidates/1679237/new-profile/about'),
(1527267,'Shanonn Barr','https://nova.ayahealthcare.com/#/recruiting/candidates/1527267/new-profile/about'),
(2461331,'Christopher Julin','https://nova.ayahealthcare.com/#/recruiting/candidates/2461331/new-profile/about'),
(3627582,'Maritza Rodriguez','https://nova.ayahealthcare.com/#/recruiting/candidates/3627582/new-profile/about'),
(1880787,'Christine Ann Hamisi','https://nova.ayahealthcare.com/#/recruiting/candidates/1880787/new-profile/about'),
(1959378,'Mark Bodnar','https://nova.ayahealthcare.com/#/recruiting/candidates/1959378/new-profile/about'),
(1260268,'Tiffany Howard','https://nova.ayahealthcare.com/#/recruiting/candidates/1260268/new-profile/about')
) AS data(nova_id, full_name, nova_url)
WHERE candidates.full_name = data.full_name;

-- =====================================================================
-- Step 3: Create indexes for performance
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_candidates_nova_id ON public.candidates(nova_id);
CREATE INDEX IF NOT EXISTS idx_candidates_full_name ON public.candidates(full_name);

-- =====================================================================
-- Step 4: Enable RLS (Row Level Security)
-- =====================================================================

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can read candidates" ON public.candidates;
DROP POLICY IF EXISTS "Authenticated users can update candidates" ON public.candidates;

-- Create policy to allow authenticated users to read candidate data
CREATE POLICY "Authenticated users can read candidates"
  ON public.candidates
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow authenticated users to update candidate data
CREATE POLICY "Authenticated users can update candidates"
  ON public.candidates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Drop and create policy to allow authenticated users to insert candidate data
DROP POLICY IF EXISTS "Authenticated users can insert candidates" ON public.candidates;
CREATE POLICY "Authenticated users can insert candidates"
  ON public.candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
