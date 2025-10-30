-- Drop legacy simplified orders tables and compatibility view
-- Idempotent: checks existence before dropping.

BEGIN;

-- Drop compatibility view "marketplace_orders" if it exists
DO $$
BEGIN
  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS public.marketplace_orders CASCADE';
  END IF;
END $$;

-- Drop table order_items if it exists
DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.order_items CASCADE';
  END IF;
END $$;

-- Drop table orders if it exists
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.orders CASCADE';
  END IF;
END $$;

COMMIT;