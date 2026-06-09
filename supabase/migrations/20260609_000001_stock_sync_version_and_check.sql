-- ============================================================
-- Stock Sync Motor: Migration 1/7
-- Add version column to products_stock for idempotent sync events.
-- Add CHECK constraint to prevent negative available stock.
-- ============================================================
BEGIN;

-- 1. Version column: monotonically incremented by RPCs v2 on every stock mutation.
--    The Motor de Integracao reads this to discard stale out-of-order events.
ALTER TABLE public.products_stock
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;

-- 2. Guard constraint: current must always be >= reserved.
--    This is the last line of defence against negative available stock,
--    even if application-level validation fails.
ALTER TABLE public.products_stock
  DROP CONSTRAINT IF EXISTS chk_products_stock_no_negative_available;

ALTER TABLE public.products_stock
  ADD CONSTRAINT chk_products_stock_no_negative_available
    CHECK (current >= COALESCE(reserved, 0));

-- 3. Supporting index for the dispatcher: efficient lookup of non-zero available stock.
CREATE INDEX IF NOT EXISTS idx_products_stock_product_storage_available
  ON public.products_stock (product_id, storage_id)
  WHERE available > 0;

COMMIT;
