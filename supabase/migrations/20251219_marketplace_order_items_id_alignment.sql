BEGIN;

ALTER TABLE public.marketplace_order_items
  DROP CONSTRAINT IF EXISTS marketplace_order_items_pkey;

ALTER TABLE public.marketplace_order_items
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.marketplace_order_items
  ADD COLUMN IF NOT EXISTS row_id uuid PRIMARY KEY DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_id ON public.marketplace_order_items(id);

COMMIT;
