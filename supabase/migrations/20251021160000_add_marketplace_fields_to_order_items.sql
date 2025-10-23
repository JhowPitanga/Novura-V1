-- Add marketplace linking fields to public.order_items and relax product_id to allow null for external imports

ALTER TABLE public.order_items
  ALTER COLUMN product_id DROP NOT NULL;

DO $$ BEGIN
  BEGIN
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS marketplace_item_id text;
  EXCEPTION WHEN duplicate_column THEN
    -- ignore
    NULL;
  END;
  BEGIN
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sku text;
  EXCEPTION WHEN duplicate_column THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_name text;
  EXCEPTION WHEN duplicate_column THEN
    NULL;
  END;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_order_items_marketplace_item_id ON public.order_items(marketplace_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);


