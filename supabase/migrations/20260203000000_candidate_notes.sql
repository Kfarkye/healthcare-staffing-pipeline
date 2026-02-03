-- Candidate Notes Table
-- Created: 2026-02-03
-- Purpose: Append-only notes for prospects (audit trail)

CREATE TABLE IF NOT EXISTS candidate_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id bigint NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  note_type text DEFAULT 'general',
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE candidate_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to candidate_notes"
  ON candidate_notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidate_notes_prospect_id
  ON candidate_notes(prospect_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notes_type
  ON candidate_notes(note_type);

-- updated_at trigger
CREATE TRIGGER update_candidate_notes_updated_at
BEFORE UPDATE ON candidate_notes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

