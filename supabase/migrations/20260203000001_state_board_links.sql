-- State Board Verification Links
-- Created: 2026-02-03
-- Purpose: Central source of truth for board verification URLs

CREATE TABLE IF NOT EXISTS state_board_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  state text NOT NULL,
  profession text NOT NULL DEFAULT 'all',
  url text NOT NULL,
  source text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE state_board_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to state_board_links"
  ON state_board_links
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_state_board_links_unique
  ON state_board_links (state, profession);

CREATE INDEX IF NOT EXISTS idx_state_board_links_state
  ON state_board_links (state);

CREATE TRIGGER update_state_board_links_updated_at
BEFORE UPDATE ON state_board_links
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
