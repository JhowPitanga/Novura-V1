BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_inventory_for_order(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id uuid;
  v_company_id uuid;
  v_marketplace text;
  v_pack_id bigint;
  v_status text;
  v_shipments jsonb;
  v_expected_movement text;
  oi jsonb;
  v_item_id text;
  v_variation_id text;
  v_qty integer;
  v_product_id uuid;
  v_storage_id uuid;
  v_ps_reserved integer;
  v_ps_current integer;
  v_exists boolean;
BEGIN
  SELECT mo.organizations_id, mo.company_id, mo.marketplace_name, mo.status, mo.shipments
  INTO v_org_id, v_company_id, v_marketplace, v_status, v_shipments
  FROM public.marketplace_orders_raw mo
  WHERE mo.id = p_order_id
  LIMIT 1;

  SELECT pack_id INTO v_pack_id FROM public.marketplace_orders_presented WHERE id = p_order_id LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  IF LOWER(COALESCE(v_status,'')) LIKE '%cancel%'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(v_shipments, '[]'::jsonb)) s
       WHERE LOWER(COALESCE(s->>'status','')) IN ('cancelled','canceled')
          OR LOWER(COALESCE(s->>'substatus','')) LIKE '%cancel%'
     ) THEN
    v_expected_movement := 'CANCELAMENTO_RESERVA';
  ELSIF LOWER(COALESCE(v_status,'')) IN ('shipped','delivered')
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(v_shipments, '[]'::jsonb)) s
       WHERE LOWER(COALESCE(s->>'status','')) IN ('shipped','delivered')
     ) THEN
    v_expected_movement := 'SAIDA';
  ELSIF LOWER(COALESCE(v_status,'')) IN ('ready_to_ship','invoice_issued','printed')
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(v_shipments, '[]'::jsonb)) s
       WHERE LOWER(COALESCE(s->>'substatus','')) = 'printed'
          OR LOWER(COALESCE(s->>'substatus','')) = 'buffered'
          OR (s->>'date_first_printed') IS NOT NULL
     ) THEN
    v_expected_movement := 'RESERVA';
  ELSE
    v_expected_movement := NULL;
  END IF;

  IF v_expected_movement IS NULL THEN
    RETURN;
  END IF;

  FOR oi IN
    SELECT x
    FROM LATERAL jsonb_array_elements(
      COALESCE(
        (SELECT mo.order_items FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id),
        COALESCE((SELECT mo.data->'order_items' FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id), '[]'::jsonb)
      )
    ) x
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

    IF v_product_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT ps.storage_id, COALESCE(ps.reserved, 0), ps.current
    INTO v_storage_id, v_ps_reserved, v_ps_current
    FROM public.products_stock ps
    WHERE ps.product_id = v_product_id
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
    ORDER BY ps.created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_storage_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.inventory_transactions it
      WHERE it.pack_id = v_pack_id
        AND it.product_id = v_product_id
        AND it.storage_id = v_storage_id
        AND it.movement_type = v_expected_movement
    ) INTO v_exists;

    IF NOT v_exists THEN
      IF v_expected_movement = 'RESERVA' THEN
        UPDATE public.products_stock ps
        SET reserved = COALESCE(ps.reserved, 0) + v_qty,
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = v_storage_id
          AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

        INSERT INTO public.inventory_transactions (
          organizations_id, company_id, product_id, storage_id, pack_id, movement_type, quantity_change, timestamp, source_ref
        ) VALUES (
          v_org_id, v_company_id, v_product_id, v_storage_id, v_pack_id, 'RESERVA', (-1) * v_qty, now(), CONCAT('PEDIDO[', COALESCE(v_pack_id::text, '0'), ']')
        );
      ELSIF v_expected_movement = 'SAIDA' THEN
        UPDATE public.products_stock ps
        SET reserved = GREATEST(COALESCE(ps.reserved, 0) - LEAST(COALESCE(ps.reserved, 0), v_qty), 0),
            current = GREATEST(ps.current - v_qty, 0),
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = v_storage_id
          AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

        INSERT INTO public.inventory_transactions (
          organizations_id, company_id, product_id, storage_id, pack_id, movement_type, quantity_change, timestamp, source_ref
        ) VALUES (
          v_org_id, v_company_id, v_product_id, v_storage_id, v_pack_id, 'SAIDA', (-1) * v_qty, now(), CONCAT('PEDIDO[', COALESCE(v_pack_id::text, '0'), ']')
        );
      ELSIF v_expected_movement = 'CANCELAMENTO_RESERVA' THEN
        UPDATE public.products_stock ps
        SET reserved = GREATEST(COALESCE(ps.reserved, 0) - v_qty, 0),
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = v_storage_id
          AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

        INSERT INTO public.inventory_transactions (
          organizations_id, company_id, product_id, storage_id, pack_id, movement_type, quantity_change, timestamp, source_ref
        ) VALUES (
          v_org_id, v_company_id, v_product_id, v_storage_id, v_pack_id, 'CANCELAMENTO_RESERVA', v_qty, now(), CONCAT('PEDIDO[', COALESCE(v_pack_id::text, '0'), ']')
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_inventory_for_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_inventory_by_pack_id(
  p_pack_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.marketplace_orders_presented WHERE pack_id = p_pack_id LOOP
    PERFORM public.ensure_inventory_for_order(rec.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_inventory_by_pack_id(bigint) TO authenticated;

COMMIT;