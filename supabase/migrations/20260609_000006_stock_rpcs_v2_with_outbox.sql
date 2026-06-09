-- ============================================================
-- Stock Sync Motor: Migration 6/7
-- Update RPCs v2 (reserve / consume / refund) to:
--   1. Increment products_stock.version on every mutation.
--   2. Write a snapshot to stock_sync_outbox (same transaction).
--      This is the Transactional Outbox pattern: if the stock update
--      commits, the outbox entry exists; if it rolls back, it does not.
--
-- The Motor de Integracao (dispatcher) reads stock_sync_outbox exclusively.
-- It NEVER reads products_stock.current or products_stock.reserved.
-- ============================================================

BEGIN;

-- ============================================================
-- Helper: upsert into stock_sync_outbox after a mutation.
-- Called at the end of each RPC, still inside the same transaction.
-- ON CONFLICT: update to the latest snapshot (coalesce multiple rapid changes).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_upsert_stock_sync_outbox(
  p_product_id    uuid,
  p_storage_id    uuid,
  p_org_id        uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available numeric;
  v_version   bigint;
BEGIN
  SELECT available, version
    INTO v_available, v_version
    FROM public.products_stock
   WHERE product_id = p_product_id
     AND storage_id = p_storage_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.stock_sync_outbox (
    organization_id, product_id, storage_id,
    available_snapshot, version, processed, created_at, updated_at
  ) VALUES (
    p_org_id, p_product_id, p_storage_id,
    v_available, v_version, false, now(), now()
  )
  ON CONFLICT (product_id, storage_id) DO UPDATE
    SET available_snapshot = EXCLUDED.available_snapshot,
        version            = EXCLUDED.version,
        processed          = false,
        updated_at         = now();
END;
$$;

-- ============================================================
-- reserve_stock_for_order_v2 — with version increment + outbox
-- ============================================================
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
  v_org_id      uuid;
  v_company_id  uuid;
  v_pack_id     text;
  v_source_ref  text;
  v_storage_id  uuid;
  v_item        record;
  v_ps_reserved numeric;
  v_reserved    integer := 0;
  v_skipped     integer := 0;
BEGIN
  SELECT o.organization_id, o.company_id, o.pack_id, o.storage_id
    INTO v_org_id, v_company_id, v_pack_id, v_storage_id
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

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
      FROM public.companies c
     WHERE c.organization_id = v_org_id
       AND c.is_default = true
     LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
      FROM public.companies c
     WHERE c.organization_id = v_org_id
     ORDER BY c.is_active DESC NULLS LAST, c.created_at
     LIMIT 1;
  END IF;

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

    -- Pessimistic lock: prevents concurrent RPCs from reading stale balance.
    SELECT COALESCE(ps.reserved, 0)
      INTO v_ps_reserved
      FROM public.products_stock ps
     WHERE ps.product_id = v_item.product_id
       AND ps.storage_id = v_storage_id
       AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.products_stock ps
       SET reserved   = COALESCE(ps.reserved, 0) + v_item.quantity,
           -- Increment version: the Motor de Integracao uses this for idempotency.
           version    = COALESCE(ps.version, 0) + 1,
           updated_at = now()
     WHERE ps.product_id = v_item.product_id
       AND ps.storage_id = v_storage_id
       AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id,
      movement_type, quantity_change, timestamp, source_ref
    ) VALUES (
      v_org_id, v_company_id, v_item.product_id, v_storage_id, p_order_id,
      'RESERVA', (-1) * v_item.quantity, now(), v_source_ref
    );

    -- Write outbox snapshot (same transaction — Transactional Outbox pattern).
    PERFORM public.fn_upsert_stock_sync_outbox(v_item.product_id, v_storage_id, v_org_id);

    v_reserved := v_reserved + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reserved', v_reserved, 'skipped', v_skipped);
END;
$$;

-- ============================================================
-- consume_stock_for_order_v2 — with version increment + outbox
-- ============================================================
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
  v_org_id      uuid;
  v_company_id  uuid;
  v_pack_id     text;
  v_source_ref  text;
  v_storage_id  uuid;
  v_item        record;
  v_ps_reserved numeric;
  v_ps_current  numeric;
  v_to_consume  numeric;
  v_consumed    integer := 0;
  v_skipped     integer := 0;
BEGIN
  SELECT o.organization_id, o.company_id, o.pack_id, o.storage_id
    INTO v_org_id, v_company_id, v_pack_id, v_storage_id
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

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
      FROM public.companies c
     WHERE c.organization_id = v_org_id
       AND c.is_default = true
     LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
      FROM public.companies c
     WHERE c.organization_id = v_org_id
     ORDER BY c.is_active DESC NULLS LAST, c.created_at
     LIMIT 1;
  END IF;

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

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_to_consume := LEAST(v_ps_reserved, v_item.quantity);

    UPDATE public.products_stock ps
       SET reserved   = GREATEST(COALESCE(ps.reserved, 0) - v_to_consume, 0),
           current    = GREATEST(ps.current - v_item.quantity, 0),
           version    = COALESCE(ps.version, 0) + 1,
           updated_at = now()
     WHERE ps.product_id = v_item.product_id
       AND ps.storage_id = v_storage_id
       AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id,
      movement_type, quantity_change, timestamp, source_ref
    ) VALUES (
      v_org_id, v_company_id, v_item.product_id, v_storage_id, p_order_id,
      'SAIDA', (-1) * v_item.quantity, now(), v_source_ref
    );

    PERFORM public.fn_upsert_stock_sync_outbox(v_item.product_id, v_storage_id, v_org_id);

    v_consumed := v_consumed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'consumed', v_consumed, 'skipped', v_skipped);
END;
$$;

-- ============================================================
-- refund_stock_for_order_v2 — with version increment + outbox
-- ============================================================
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
  v_org_id      uuid;
  v_company_id  uuid;
  v_pack_id     text;
  v_source_ref  text;
  v_storage_id  uuid;
  v_item        record;
  v_ps_reserved numeric;
  v_refunded    integer := 0;
  v_skipped     integer := 0;
BEGIN
  SELECT o.organization_id, o.company_id, o.pack_id, o.storage_id
    INTO v_org_id, v_company_id, v_pack_id, v_storage_id
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

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
      FROM public.companies c
     WHERE c.organization_id = v_org_id
       AND c.is_default = true
     LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
      FROM public.companies c
     WHERE c.organization_id = v_org_id
     ORDER BY c.is_active DESC NULLS LAST, c.created_at
     LIMIT 1;
  END IF;

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

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.products_stock ps
       SET reserved   = GREATEST(COALESCE(ps.reserved, 0) - v_item.quantity, 0),
           version    = COALESCE(ps.version, 0) + 1,
           updated_at = now()
     WHERE ps.product_id = v_item.product_id
       AND ps.storage_id = v_storage_id
       AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id,
      movement_type, quantity_change, timestamp, source_ref
    ) VALUES (
      v_org_id, v_company_id, v_item.product_id, v_storage_id, p_order_id,
      'CANCELAMENTO_RESERVA', v_item.quantity, now(), v_source_ref
    );

    PERFORM public.fn_upsert_stock_sync_outbox(v_item.product_id, v_storage_id, v_org_id);

    v_refunded := v_refunded + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'refunded', v_refunded, 'skipped', v_skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_upsert_stock_sync_outbox(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_stock_for_order_v2(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_v2(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_stock_for_order_v2(uuid, uuid)   TO authenticated;

COMMIT;
