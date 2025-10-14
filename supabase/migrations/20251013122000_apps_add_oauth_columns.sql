-- Add OAuth-specific columns to apps
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS client_secret text,
  ADD COLUMN IF NOT EXISTS auth_url text;