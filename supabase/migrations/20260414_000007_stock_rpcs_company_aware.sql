-- ============================================================
-- MC-T5: Stock RPCs company-aware
-- Reserve/consume/refund read company_id directly from orders.company_id
-- instead of falling back to LIMIT 1 on the companies table.
-- Backward compat: if orders.company_id IS NULL (legacy rows), falls back
-- to the organization's default company (is_default = true), then to LIMIT 1.
-- ============================================================

BEGIN;

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
  -- Resolve org, company, pack, and storage_id from the order row.
  SELECT o.organization_id, o.company_id, o.pack_id, o.storage_id
  INTO v_org_id, v_company_id, v_pack_id, v_storage_id
  FROM public.orders o
  WHERE o.id = p_order_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- Prefer explicit param, then order.storage_id, then default active physical storage.
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

  -- Fallback: if order.company_id is NULL (legacy row), resolve from default company.
  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
    FROM public.companies c
    WHERE c.organization_id = v_org_id
      AND c.is_default = true
    LIMIT 1;
  END IF;

  -- Final fallback: oldest active company (pre-is_default data).
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

    v_reserved := v_reserved + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reserved', v_reserved, 'skipped', v_skipped);
END;
$$;

-- ---------------------------------------------------------------------------

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

    v_consumed := v_consumed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'consumed', v_consumed, 'skipped', v_skipped);
END;
$$;

-- ---------------------------------------------------------------------------

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

    v_refunded := v_refunded + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'refunded', v_refunded, 'skipped', v_skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_stock_for_order_v2(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_v2(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_stock_for_order_v2(uuid, uuid) TO authenticated;

COMMIT;
