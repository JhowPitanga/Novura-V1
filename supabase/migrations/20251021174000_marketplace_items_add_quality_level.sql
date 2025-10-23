BEGIN;

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS quality_level text;

COMMIT;


