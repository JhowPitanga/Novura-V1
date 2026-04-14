-- ============================================================
-- Fix inventory flow: wire integration_id throughout the order
-- lifecycle so stock operations always use the correct warehouse.
--
-- Changes:
--   1. orders: add integration_id (which integration originated it)
--   2. inventory_jobs: drop FK to legacy marketplace_orders_presented_new
--   3. inventory_transactions: add integration_id + marketplace_name for audit
--   4. reserve/consume/refund_stock_for_order_v2: populate new audit columns
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. orders: track which marketplace integration originated the order
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS integration_id uuid
    REFERENCES public.marketplace_integrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_integration_id
  ON public.orders (integration_id)
  WHERE integration_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. inventory_jobs: drop legacy FK so new orders.id can be stored
--    The worker performs a dual-lookup (orders first, then legacy) so no
--    FK is needed here — it would reject new-table IDs.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Drop the FK that points to marketplace_orders_presented_new
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.conname = 'inventory_jobs_order_id_fkey'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.inventory_jobs DROP CONSTRAINT inventory_jobs_order_id_fkey;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. inventory_transactions: add audit columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS integration_id   uuid    REFERENCES public.marketplace_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketplace_name text;

CREATE INDEX IF NOT EXISTS idx_inv_tx_integration_id
  ON public.inventory_transactions (integration_id)
  WHERE integration_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Update v2 RPCs to populate integration_id + marketplace_name
-- ---------------------------------------------------------------------------

-- reserve_stock_for_order_v2
CREATE OR REPLACE FUNCTION public.reserve_stock_for_order_v2(
  p_order_id   uuid,
  p_storage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id          uuid;
  v_company_id      uuid;
  v_pack_id         text;
  v_source_ref      text;
  v_storage_id      uuid;
  v_integration_id  uuid;
  v_marketplace     text;
  v_item            record;
  v_ps_reserved     numeric;
  v_reserved        integer := 0;
  v_skipped         integer := 0;
BEGIN
  SELECT o.organization_id, o.pack_id, o.storage_id, o.integration_id, o.marketplace
  INTO v_org_id, v_pack_id, v_storage_id, v_integration_id, v_marketplace
  FROM public.orders o
  WHERE o.id = p_order_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- Storage resolution priority: explicit param > orders.storage_id > org default
  IF p_storage_id IS NOT NULL THEN
    v_storage_id := p_storage_id;
  ELSIF v_storage_id IS NULL THEN
    SELECT s.id INTO v_storage_id
    FROM public.storage s
    WHERE s.organizations_id = v_org_id
      AND s.active = true
      AND s.type = 'physical'
    ORDER BY s.created_at
    LIMIT 1;
  END IF;

  IF v_storage_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_STORAGE_RESOLVED');
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.organization_id = v_org_id
  ORDER BY c.is_active DESC NULLS LAST, c.created_at
  LIMIT 1;

  v_source_ref := CONCAT('PEDIDO[', COALESCE(v_pack_id, p_order_id::text), ']');

  FOR v_item IN
    SELECT oi.product_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.inventory_transactions it
      WHERE it.product_id    = v_item.product_id
        AND it.storage_id    = v_storage_id
        AND it.order_id      = p_order_id
        AND it.movement_type = 'RESERVA'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT COALESCE(ps.reserved, 0)
    INTO v_ps_reserved
    FROM public.products_stock ps
    WHERE ps.product_id = v_item.product_id
      AND ps.storage_id = v_storage_id
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE public.products_stock ps
    SET reserved   = COALESCE(ps.reserved, 0) + v_item.quantity,
        updated_at = now()
    WHERE ps.product_id = v_item.product_id
      AND ps.storage_id = v_storage_id
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id,
      movement_type, quantity_change, timestamp, source_ref,
      integration_id, marketplace_name
    ) VALUES (
      v_org_id, v_company_id, v_item.product_id, v_storage_id, p_order_id,
      'RESERVA', (-1) * v_item.quantity, now(), v_source_ref,
      v_integration_id, v_marketplace
    );

    v_reserved := v_reserved + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reserved', v_reserved, 'skipped', v_skipped,
                            'storage_id', v_storage_id);
END;
$$;

-- consume_stock_for_order_v2
CREATE OR REPLACE FUNCTION public.consume_stock_for_order_v2(
  p_order_id   uuid,
  p_storage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id          uuid;
  v_company_id      uuid;
  v_pack_id         text;
  v_source_ref      text;
  v_storage_id      uuid;
  v_integration_id  uuid;
  v_marketplace     text;
  v_item            record;
  v_ps_reserved     numeric;
  v_ps_current      numeric;
  v_to_consume      numeric;
  v_consumed        integer := 0;
  v_skipped         integer := 0;
BEGIN
  SELECT o.organization_id, o.pack_id, o.storage_id, o.integration_id, o.marketplace
  INTO v_org_id, v_pack_id, v_storage_id, v_integration_id, v_marketplace
  FROM public.orders o
  WHERE o.id = p_order_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF p_storage_id IS NOT NULL THEN
    v_storage_id := p_storage_id;
  ELSIF v_storage_id IS NULL THEN
    SELECT s.id INTO v_storage_id
    FROM public.storage s
    WHERE s.organizations_id = v_org_id
      AND s.active = true
      AND s.type = 'physical'
    ORDER BY s.created_at
    LIMIT 1;
  END IF;

  IF v_storage_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_STORAGE_RESOLVED');
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.organization_id = v_org_id
  ORDER BY c.is_active DESC NULLS LAST, c.created_at
  LIMIT 1;

  v_source_ref := CONCAT('PEDIDO[', COALESCE(v_pack_id, p_order_id::text), ']');

  FOR v_item IN
    SELECT oi.product_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.inventory_transactions it
      WHERE it.product_id    = v_item.product_id
        AND it.storage_id    = v_storage_id
        AND it.order_id      = p_order_id
        AND it.movement_type = 'SAIDA'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT COALESCE(ps.reserved, 0), ps.current
    INTO v_ps_reserved, v_ps_current
    FROM public.products_stock ps
    WHERE ps.product_id = v_item.product_id
      AND ps.storage_id = v_storage_id
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_to_consume := LEAST(v_ps_reserved, v_item.quantity);

    UPDATE public.products_stock ps
    SET reserved   = GREATEST(COALESCE(ps.reserved, 0) - v_to_consume, 0),
        current    = GREATEST(ps.current - v_item.quantity, 0),
        updated_at = now()
    WHERE ps.product_id = v_item.product_id
      AND ps.storage_id = v_storage_id
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id,
      movement_type, quantity_change, timestamp, source_ref,
      integration_id, marketplace_name
    ) VALUES (
      v_org_id, v_company_id, v_item.product_id, v_storage_id, p_order_id,
      'SAIDA', (-1) * v_item.quantity, now(), v_source_ref,
      v_integration_id, v_marketplace
    );

    v_consumed := v_consumed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'consumed', v_consumed, 'skipped', v_skipped,
                            'storage_id', v_storage_id);
END;
$$;

-- refund_stock_for_order_v2
CREATE OR REPLACE FUNCTION public.refund_stock_for_order_v2(
  p_order_id   uuid,
  p_storage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id          uuid;
  v_company_id      uuid;
  v_pack_id         text;
  v_source_ref      text;
  v_storage_id      uuid;
  v_integration_id  uuid;
  v_marketplace     text;
  v_item            record;
  v_ps_reserved     numeric;
  v_refunded        integer := 0;
  v_skipped         integer := 0;
BEGIN
  SELECT o.organization_id, o.pack_id, o.storage_id, o.integration_id, o.marketplace
  INTO v_org_id, v_pack_id, v_storage_id, v_integration_id, v_marketplace
  FROM public.orders o
  WHERE o.id = p_order_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF p_storage_id IS NOT NULL THEN
    v_storage_id := p_storage_id;
  ELSIF v_storage_id IS NULL THEN
    SELECT s.id INTO v_storage_id
    FROM public.storage s
    WHERE s.organizations_id = v_org_id
      AND s.active = true
      AND s.type = 'physical'
    ORDER BY s.created_at
    LIMIT 1;
  END IF;

  IF v_storage_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_STORAGE_RESOLVED');
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.organization_id = v_org_id
  ORDER BY c.is_active DESC NULLS LAST, c.created_at
  LIMIT 1;

  v_source_ref := CONCAT('PEDIDO[', COALESCE(v_pack_id, p_order_id::text), ']');

  FOR v_item IN
    SELECT oi.product_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.inventory_transactions it
      WHERE it.product_id    = v_item.product_id
        AND it.storage_id    = v_storage_id
        AND it.order_id      = p_order_id
        AND it.movement_type = 'CANCELAMENTO_RESERVA'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT COALESCE(ps.reserved, 0)
    INTO v_ps_reserved
    FROM public.products_stock ps
    WHERE ps.product_id = v_item.product_id
      AND ps.storage_id = v_storage_id
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE public.products_stock ps
    SET reserved   = GREATEST(COALESCE(ps.reserved, 0) - v_item.quantity, 0),
        updated_at = now()
    WHERE ps.product_id = v_item.product_id
      AND ps.storage_id = v_storage_id
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id,
      movement_type, quantity_change, timestamp, source_ref,
      integration_id, marketplace_name
    ) VALUES (
      v_org_id, v_company_id, v_item.product_id, v_storage_id, p_order_id,
      'CANCELAMENTO_RESERVA', v_item.quantity, now(), v_source_ref,
      v_integration_id, v_marketplace
    );

    v_refunded := v_refunded + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'refunded', v_refunded, 'skipped', v_skipped,
                            'storage_id', v_storage_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_stock_for_order_v2(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_v2(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_stock_for_order_v2(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audit view: stock transactions enriched with integration context
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_inventory_audit AS
SELECT
  it.id,
  it.timestamp,
  it.organizations_id,
  it.product_id,
  p.name                  AS product_name,
  it.storage_id,
  s.name                  AS storage_name,
  s.type                  AS storage_type,
  it.order_id,
  o.marketplace_order_id,
  it.integration_id,
  mi.marketplace_name     AS integration_marketplace,
  it.marketplace_name,
  it.movement_type,
  it.quantity_change,
  it.source_ref
FROM public.inventory_transactions it
LEFT JOIN public.products          p  ON p.id  = it.product_id
LEFT JOIN public.storage            s  ON s.id  = it.storage_id
LEFT JOIN public.orders             o  ON o.id  = it.order_id
LEFT JOIN public.marketplace_integrations mi ON mi.id = it.integration_id;

COMMIT;
