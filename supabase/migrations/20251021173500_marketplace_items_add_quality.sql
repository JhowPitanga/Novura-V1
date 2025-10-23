-- Add listing quality columns to marketplace_items
BEGIN;

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS listing_quality numeric,
  ADD COLUMN IF NOT EXISTS last_quality_update timestamptz;

-- Optional index to query recent updated quality per org
CREATE INDEX IF NOT EXISTS idx_marketplace_items_org_quality
  ON public.marketplace_items (organizations_id, updated_at DESC);

COMMIT;


