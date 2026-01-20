-- RAG & Knowledge Enhancement Migration
-- Created: 2026-01-19
-- Purpose: Add persistent storage for knowledge, templates, and chat history.

-- ============================================================================
-- 1. KNOWLEDGE BASE
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL, -- 'benefits', 'faq', 'policies', 'onboarding'
  title text UNIQUE NOT NULL,
  content text NOT NULL,
  keywords text[],        -- for fuzzy matching
  source text,            -- e.g. 'Aya Traveler Perks and Benefits.pdf'
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_keywords ON knowledge_base USING GIN(keywords);

-- Update trigger
DROP TRIGGER IF EXISTS update_knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER update_knowledge_base_updated_at 
BEFORE UPDATE ON knowledge_base 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Ensure unique constraint exists for ON CONFLICT
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_base_title_key') THEN
    ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_title_key UNIQUE (title);
  END IF;
END $$;

-- Populate with extracted benefits
INSERT INTO knowledge_base (category, title, content, keywords, source) VALUES
(
  'benefits', 
  'Premium Insurance (Anthem)', 
  'Aya Healthcare provides Anthem medical, dental, and vision coverage. Coverage begins on the day you start your assignment. Life insurance through Guardian is also provided at no cost. Available to employees working 30+ hours/week.', 
  ARRAY['insurance', 'medical', 'dental', 'vision', 'benefits', 'anthem', 'day one'],
  'Aya Traveler Perks and Benefits.pdf'
),
(
  'benefits', 
  '401(k) Retirement Match', 
  'Aya matches 401(k) contributions dollar-for-dollar up to the first 3%, and fifty-cents-on-the-dollar on the next 2%. A 5% contribution results in a 4% match.', 
  ARRAY['401k', 'retirement', 'match', 'investment', 'benefits', 'savings'],
  'Aya Traveler Perks and Benefits.pdf'
),
(
  'benefits', 
  'Paid Sick Leave', 
  'Aya Healthcare is one of the only healthcare staffing firms in the industry to offer paid sick leave to its travelers.', 
  ARRAY['sick leave', 'paid time off', 'pto', 'benefits'],
  'Aya Traveler Perks and Benefits.pdf'
),
(
  'benefits', 
  'Housing & Relocation', 
  'Housing is customized. Aya can set up housing for you (pets and family welcome) or you can find your own home away from home with a stipend. Experience is customized based on individual assignment needs.', 
  ARRAY['housing', 'stipend', 'relocation', 'travel', 'pets', 'family'],
  'Aya Traveler Perks and Benefits.pdf'
),
(
  'benefits', 
  'Employee Assistance Program (EAP)', 
  'Confidential 24/7 program for mental health, legal, childcare, senior care, and financial problems. Available to you and all household members at no cost.', 
  ARRAY['eap', 'mental health', 'legal', 'finance', 'childcare', 'counseling'],
  'Aya Traveler Perks and Benefits.pdf'
),
(
  'benefits', 
  'Certification & CEUs', 
  'Aya reimburses certification renewals if renewed at least 30 days before expiration. Provides unlimited online CEUs at no cost.', 
  ARRAY['ceu', 'certification', 'reimbursement', 'license', 'education'],
  'Aya Traveler Perks and Benefits.pdf'
) ON CONFLICT (title) DO NOTHING;

-- ============================================================================
-- 2. EMAIL TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  category text NOT NULL, -- 'outreach', 'follow_up', 'offer', 'extension'
  subject_template text NOT NULL,
  body_template text NOT NULL,
  placeholders jsonb DEFAULT '[]'::jsonb, -- ['candidate_name', 'facility', 'job_id']
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON email_templates(category);

-- Update trigger
DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at 
BEFORE UPDATE ON email_templates 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. CHAT HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL, -- e.g. candidate_id or arbitrary session_id
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_user_conversation ON chat_history(user_id, conversation_id);

-- Update trigger
DROP TRIGGER IF EXISTS update_chat_history_updated_at ON chat_history;
CREATE TRIGGER update_chat_history_updated_at 
BEFORE UPDATE ON chat_history 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. SECURITY & PERMISSIONS
-- ============================================================================

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read knowledge_base" ON knowledge_base;
CREATE POLICY "Public read knowledge_base" ON knowledge_base FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read email_templates" ON email_templates;
CREATE POLICY "Public read email_templates" ON email_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own chat_history" ON chat_history;
CREATE POLICY "Users can manage their own chat_history" ON chat_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated, service_role;
