-- Rename marketplace_orders to marketplace_orders_raw and provide a compatibility view
-- This migration is idempotent and safe to re-run.

BEGIN;

-- 1) Rename base table if needed
DO $$
BEGIN
  IF to_regclass('public.marketplace_orders_raw') IS NULL AND to_regclass('public.marketplace_orders') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.marketplace_orders RENAME TO marketplace_orders_raw';
  END IF;
END $$;

-- 2) Create or replace a compatibility view so existing reads to marketplace_orders keep working
CREATE OR REPLACE VIEW public.marketplace_orders AS
SELECT * FROM public.marketplace_orders_raw;

-- 3) Ensure a useful uniqueness constraint exists on the raw table (org + marketplace + order id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ux_marketplace_orders_raw_org_marketplace_id'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX ux_marketplace_orders_raw_org_marketplace_id ON public.marketplace_orders_raw (organizations_id, marketplace_name, marketplace_order_id)';
  END IF;
END $$;

COMMIT;