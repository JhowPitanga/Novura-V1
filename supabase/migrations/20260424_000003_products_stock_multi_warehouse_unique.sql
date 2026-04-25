-- ============================================================
-- PRODUCTS_STOCK: enable multi-warehouse rows per product
-- - Remove legacy unique(product_id) constraint
-- - Ensure unique(product_id, storage_id)
-- ============================================================

BEGIN;

DO $$
BEGIN
  -- Legacy schema: blocks one product in multiple warehouses
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.products_stock'::regclass
      AND conname = 'products_stock_product_id_key'
  ) THEN
    ALTER TABLE public.products_stock
      DROP CONSTRAINT products_stock_product_id_key;
  END IF;

  -- Target schema: one row per (product, storage)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.products_stock'::regclass
      AND conname = 'products_stock_product_storage_key'
  ) THEN
    ALTER TABLE public.products_stock
      ADD CONSTRAINT products_stock_product_storage_key
      UNIQUE (product_id, storage_id);
  END IF;
END $$;

COMMIT;
