-- Waitlist for early access signups

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'direct',
  region TEXT,
  device TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending'
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read" ON public.waitlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert" ON public.waitlist FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth users can update" ON public.waitlist FOR UPDATE TO authenticated USING (true);
