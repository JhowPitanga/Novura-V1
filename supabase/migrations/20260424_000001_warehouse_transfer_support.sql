-- ============================================================
-- WAREHOUSE TRANSFER SUPPORT
-- Adds structured classification columns to inventory_transactions,
-- expands movement_type to include TRANSFERENCIA and DEVOLUCAO,
-- creates RPC transfer_stock_between_warehouses,
-- and updates v_inventory_audit with new fields.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add structured classification columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS entity_type text
    CHECK (entity_type IN ('order', 'manual', 'transfer_in', 'transfer_out', 'return', 'system'));

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS reason_code text
    CHECK (reason_code IN ('sale', 'manual_adjustment', 'reservation_cancelled', 'customer_return', 'warehouse_transfer'));

-- ---------------------------------------------------------------------------
-- 2. Add counterpart_storage_id to correlate the two rows of a transfer
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS counterpart_storage_id uuid
    REFERENCES public.storage(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_tx_counterpart_storage
  ON public.inventory_transactions (counterpart_storage_id)
  WHERE counterpart_storage_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Expand movement_type constraint to include TRANSFERENCIA and DEVOLUCAO
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_movement_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_movement_type_check
  CHECK (movement_type IN (
    'ENTRADA',
    'SAIDA',
    'RESERVA',
    'CANCELAMENTO_RESERVA',
    'TRANSFERENCIA',
    'DEVOLUCAO'
  ));

-- ---------------------------------------------------------------------------
-- 4. RPC: transfer_stock_between_warehouses
-- Atomically transfers stock from one physical warehouse to another.
-- Strict validations:
--   - origin != destination
--   - both must be type='physical' and readonly=false
--   - quantity must be positive
-- Inserts two inventory_transactions rows (TRANSFERENCIA) correlated by
-- counterpart_storage_id, with entity_type and reason_code set.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_stock_between_warehouses(
  p_product_id     uuid,
  p_from_storage_id uuid,
  p_to_storage_id  uuid,
  p_quantity       numeric,
  p_org_id         uuid,
  p_note           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_from_type     text;
  v_from_readonly boolean;
  v_to_type       text;
  v_to_readonly   boolean;
  v_company_id    uuid;
  v_from_current  numeric;
  v_source_ref    text;
BEGIN
  -- Guard: origin and destination must be different
  IF p_from_storage_id = p_to_storage_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SAME_STORAGE');
  END IF;

  -- Guard: quantity must be positive
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_QUANTITY');
  END IF;

  -- Validate origin: must be physical and not readonly
  SELECT type, readonly INTO v_from_type, v_from_readonly
  FROM public.storage
  WHERE id = p_from_storage_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORIGIN_NOT_FOUND');
  END IF;

  IF v_from_type <> 'physical' OR v_from_readonly = true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORIGIN_NOT_PHYSICAL');
  END IF;

  -- Validate destination: must be physical and not readonly (never fulfillment)
  SELECT type, readonly INTO v_to_type, v_to_readonly
  FROM public.storage
  WHERE id = p_to_storage_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DESTINATION_NOT_FOUND');
  END IF;

  IF v_to_type <> 'physical' OR v_to_readonly = true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DESTINATION_NOT_PHYSICAL');
  END IF;

  -- Resolve company_id for the org
  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.organization_id = p_org_id
  ORDER BY c.is_active DESC NULLS LAST, c.created_at
  LIMIT 1;

  -- Lock + validate available stock in origin
  SELECT GREATEST(COALESCE(ps.current, 0) - COALESCE(ps.reserved, 0), 0)
  INTO v_from_current
  FROM public.products_stock ps
  WHERE ps.product_id = p_product_id
    AND ps.storage_id = p_from_storage_id
    AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRODUCT_NOT_IN_ORIGIN');
  END IF;

  IF v_from_current < p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_STOCK',
                              'available', v_from_current);
  END IF;

  v_source_ref := COALESCE(p_note, 'TRANSFERENCIA');

  -- Deduct from origin
  UPDATE public.products_stock
  SET current     = GREATEST(current - p_quantity, 0),
      updated_at  = now()
  WHERE product_id = p_product_id
    AND storage_id = p_from_storage_id
    AND (company_id IS NULL OR company_id = v_company_id);

  -- Add to destination (upsert)
  INSERT INTO public.products_stock (product_id, storage_id, company_id, current, reserved, in_transit)
  VALUES (p_product_id, p_to_storage_id, v_company_id, p_quantity, 0, 0)
  ON CONFLICT (product_id, storage_id)
  DO UPDATE SET
    current    = GREATEST(public.products_stock.current, 0) + p_quantity,
    updated_at = now();

  -- Audit: origin row (outbound)
  INSERT INTO public.inventory_transactions (
    organizations_id, company_id, product_id, storage_id,
    movement_type, quantity_change, timestamp, source_ref,
    entity_type, reason_code, counterpart_storage_id
  ) VALUES (
    p_org_id, v_company_id, p_product_id, p_from_storage_id,
    'TRANSFERENCIA', -p_quantity, now(), v_source_ref,
    'transfer_out', 'warehouse_transfer', p_to_storage_id
  );

  -- Audit: destination row (inbound)
  INSERT INTO public.inventory_transactions (
    organizations_id, company_id, product_id, storage_id,
    movement_type, quantity_change, timestamp, source_ref,
    entity_type, reason_code, counterpart_storage_id
  ) VALUES (
    p_org_id, v_company_id, p_product_id, p_to_storage_id,
    'TRANSFERENCIA', p_quantity, now(), v_source_ref,
    'transfer_in', 'warehouse_transfer', p_from_storage_id
  );

  RETURN jsonb_build_object('ok', true, 'transferred', p_quantity);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_stock_between_warehouses(uuid, uuid, uuid, numeric, uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rebuild v_inventory_audit with new classification columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_inventory_audit AS
SELECT
  it.id,
  it.timestamp,
  it.organizations_id,
  it.product_id,
  p.name                    AS product_name,
  p.sku                     AS product_sku,
  p.image_urls              AS product_image_urls,
  it.storage_id,
  s.name                    AS storage_name,
  s.type                    AS storage_type,
  it.order_id,
  o.marketplace_order_id,
  it.integration_id,
  mi.marketplace_name       AS integration_marketplace,
  it.marketplace_name,
  it.movement_type,
  it.quantity_change,
  it.source_ref,
  -- Structured classification
  it.entity_type,
  it.reason_code,
  -- Transfer correlation
  it.counterpart_storage_id,
  cs.name                   AS counterpart_storage_name
FROM public.inventory_transactions it
LEFT JOIN public.products                  p  ON p.id  = it.product_id
LEFT JOIN public.storage                    s  ON s.id  = it.storage_id
LEFT JOIN public.storage                    cs ON cs.id = it.counterpart_storage_id
LEFT JOIN public.orders                     o  ON o.id  = it.order_id
LEFT JOIN public.marketplace_integrations  mi ON mi.id = it.integration_id;

COMMIT;
