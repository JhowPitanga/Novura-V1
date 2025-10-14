-- Add JSONB config column to public.apps to store app-level credentials securely
-- This column will hold sensitive data (e.g., client_id and client_secret) per app
-- Access to rows remains governed by existing RLS policies on public.apps

ALTER TABLE IF EXISTS public.apps
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Optional: index for queries filtering apps that have non-empty config (skipped by default)
-- CREATE INDEX IF NOT EXISTS idx_apps_config ON public.apps USING GIN (config);