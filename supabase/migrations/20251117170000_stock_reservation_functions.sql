BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_stock_for_order_item(
  p_product_id uuid,
  p_quantity_to_reserve integer,
  p_storage_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_current integer;
  v_reserved integer;
  v_available integer;
  v_company_id uuid;
BEGIN
  IF COALESCE(p_quantity_to_reserve, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida para reserva: %', p_quantity_to_reserve;
  END IF;

  SELECT company_id INTO v_company_id FROM public.products WHERE id = p_product_id LIMIT 1;

  SELECT ps.current, COALESCE(ps.reserved, 0)
  INTO v_current, v_reserved
  FROM public.products_stock ps
  WHERE ps.product_id = p_product_id
    AND ps.storage_id = p_storage_id
    AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
  ORDER BY ps.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque não encontrado para produto % no armazém %', p_product_id, p_storage_id;
  END IF;

  v_available := v_current - v_reserved;
  IF v_available < p_quantity_to_reserve THEN
    RAISE EXCEPTION 'Estoque insuficiente para reserva. Disponível: %, solicitado: %', v_available, p_quantity_to_reserve;
  END IF;

  UPDATE public.products_stock ps
  SET reserved = COALESCE(ps.reserved, 0) + p_quantity_to_reserve,
      updated_at = now()
  WHERE ps.product_id = p_product_id
    AND ps.storage_id = p_storage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_reserved_stock_for_order(
  p_order_id uuid,
  p_storage_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id uuid;
  v_company_id uuid;
  v_marketplace text;
  oi jsonb;
  v_item_id text;
  v_variation_id text;
  v_qty integer;
  v_product_id uuid;
  v_ps_reserved integer;
  v_ps_current integer;
  v_reserved_to_consume integer;
BEGIN
  SELECT mo.organizations_id, mo.company_id, mo.marketplace_name
  INTO v_org_id, v_company_id, v_marketplace
  FROM public.marketplace_orders_raw mo
  WHERE mo.id = p_order_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  FOR oi IN
    SELECT x
    FROM LATERAL jsonb_array_elements(COALESCE((SELECT mo.order_items FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id), '[]'::jsonb)) x
  LOOP
    v_item_id := COALESCE(oi->'item'->>'id', oi->>'item_id', '');
    v_variation_id := COALESCE(oi->'item'->>'variation_id', '');
    v_qty := COALESCE((oi->>'quantity')::int, (oi->'requested_quantity'->>'value')::int, 1);

    SELECT mipl.product_id
    INTO v_product_id
    FROM public.marketplace_item_product_links mipl
    WHERE mipl.organizations_id = v_org_id
      AND mipl.company_id = v_company_id
      AND mipl.marketplace_name = v_marketplace
      AND mipl.marketplace_item_id = v_item_id
      AND COALESCE(mipl.variation_id, '') = COALESCE(v_variation_id, '')
    LIMIT 1;

    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(ps.reserved, 0), ps.current
      INTO v_ps_reserved, v_ps_current
      FROM public.products_stock ps
      WHERE ps.product_id = v_product_id
        AND ps.storage_id = p_storage_id
        AND ps.company_id = v_company_id
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        v_reserved_to_consume := LEAST(v_ps_reserved, v_qty);

        UPDATE public.products_stock ps
        SET reserved = GREATEST(COALESCE(ps.reserved, 0) - v_reserved_to_consume, 0),
            current = GREATEST(ps.current - v_qty, 0),
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = p_storage_id
          AND ps.company_id = v_company_id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_reserved_stock_for_order(
  p_order_id uuid,
  p_storage_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id uuid;
  v_company_id uuid;
  v_marketplace text;
  oi jsonb;
  v_item_id text;
  v_variation_id text;
  v_qty integer;
  v_product_id uuid;
  v_ps_reserved integer;
BEGIN
  SELECT mo.organizations_id, mo.company_id, mo.marketplace_name
  INTO v_org_id, v_company_id, v_marketplace
  FROM public.marketplace_orders_raw mo
  WHERE mo.id = p_order_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  FOR oi IN
    SELECT x
    FROM LATERAL jsonb_array_elements(COALESCE((SELECT mo.order_items FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id), '[]'::jsonb)) x
  LOOP
    v_item_id := COALESCE(oi->'item'->>'id', oi->>'item_id', '');
    v_variation_id := COALESCE(oi->'item'->>'variation_id', '');
    v_qty := COALESCE((oi->>'quantity')::int, (oi->'requested_quantity'->>'value')::int, 1);

    SELECT mipl.product_id
    INTO v_product_id
    FROM public.marketplace_item_product_links mipl
    WHERE mipl.organizations_id = v_org_id
      AND mipl.company_id = v_company_id
      AND mipl.marketplace_name = v_marketplace
      AND mipl.marketplace_item_id = v_item_id
      AND COALESCE(mipl.variation_id, '') = COALESCE(v_variation_id, '')
    LIMIT 1;

    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(ps.reserved, 0)
      INTO v_ps_reserved
      FROM public.products_stock ps
      WHERE ps.product_id = v_product_id
        AND ps.storage_id = p_storage_id
        AND ps.company_id = v_company_id
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.products_stock ps
        SET reserved = GREATEST(COALESCE(ps.reserved, 0) - v_qty, 0),
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = p_storage_id
          AND ps.company_id = v_company_id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_stock_for_order_item(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_reserved_stock_for_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_reserved_stock_for_order(uuid, uuid) TO authenticated;

COMMIT;