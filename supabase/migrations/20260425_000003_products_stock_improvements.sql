-- ============================================================
-- T02 - products_stock: add min/max stock + trigger for stock_qnt
-- ============================================================
BEGIN;

-- 1) Add min_stock and max_stock columns
ALTER TABLE public.products_stock
  ADD COLUMN IF NOT EXISTS min_stock int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock int NULL;

-- 2) Trigger: keep products.stock_qnt in sync with sum of products_stock.current
CREATE OR REPLACE FUNCTION public.trg_sync_product_stock_qnt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_total      int;
BEGIN
  -- Determine which product_id was affected
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.product_id;
  ELSE
    v_product_id := NEW.product_id;
  END IF;

  -- Sum current stock across all warehouses
  SELECT COALESCE(SUM(current), 0) INTO v_total
  FROM public.products_stock
  WHERE product_id = v_product_id;

  -- Update the denormalized field
  UPDATE public.products
  SET stock_qnt = v_total
  WHERE id = v_product_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_stock_qnt ON public.products_stock;
CREATE TRIGGER trg_sync_product_stock_qnt
  AFTER INSERT OR UPDATE OF current OR DELETE
  ON public.products_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_product_stock_qnt();

-- 3) Backfill stock_qnt for all existing products
UPDATE public.products p
SET stock_qnt = (
  SELECT COALESCE(SUM(ps.current), 0)
  FROM public.products_stock ps
  WHERE ps.product_id = p.id
);

COMMIT;
