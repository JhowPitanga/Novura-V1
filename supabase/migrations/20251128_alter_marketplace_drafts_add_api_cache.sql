-- Add api_cache column to store cached API payloads for drafts
ALTER TABLE IF EXISTS public.marketplace_drafts
  ADD COLUMN IF NOT EXISTS api_cache jsonb DEFAULT '{}'::jsonb;

