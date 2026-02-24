-- Enable pg_net for async HTTP requests from triggers
-- pg_net is pre-installed on Supabase, just needs enabling
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
