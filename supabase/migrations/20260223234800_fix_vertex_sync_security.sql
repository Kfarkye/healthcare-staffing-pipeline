-- Security hardening for vertex sync objects
-- Sets search_path on functions to prevent search_path injection

ALTER FUNCTION public.update_updated_at() SET search_path = public;
