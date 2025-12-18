BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_stock_for_order(
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
  v_marketplace_order_id text;
  v_pack_id bigint;
  v_source_ref text;
  oi jsonb;
  v_item_id text;
  v_variation_id text;
  v_qty integer;
  v_product_id uuid;
  v_ps_reserved integer;
BEGIN
  SELECT mo.organizations_id, mo.company_id, mo.marketplace_name, mo.marketplace_order_id
  INTO v_org_id, v_company_id, v_marketplace, v_marketplace_order_id
  FROM public.marketplace_orders_raw mo
  WHERE mo.id = p_order_id
  LIMIT 1;

  SELECT pack_id INTO v_pack_id FROM public.marketplace_orders_presented WHERE id = p_order_id LIMIT 1;
  v_source_ref := CONCAT('PEDIDO[', COALESCE(v_pack_id::text, v_marketplace_order_id, '0'), ']');

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
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

    IF v_product_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.inventory_transactions it
        WHERE it.product_id = v_product_id
          AND it.storage_id = p_storage_id
          AND it.movement_type = 'RESERVA'
          AND (
            it.pack_id = v_pack_id
            OR (v_pack_id IS NULL AND it.source_ref = v_source_ref)
          )
      ) THEN
        CONTINUE;
      END IF;
      SELECT COALESCE(ps.reserved, 0)
      INTO v_ps_reserved
      FROM public.products_stock ps
      WHERE ps.product_id = v_product_id
        AND ps.storage_id = p_storage_id
        AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.products_stock ps
        SET reserved = COALESCE(ps.reserved, 0) + v_qty,
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = p_storage_id
          AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

        INSERT INTO public.inventory_transactions (
          organizations_id, company_id, product_id, storage_id, pack_id, movement_type, quantity_change, timestamp, source_ref
        ) VALUES (
          v_org_id, v_company_id, v_product_id, p_storage_id, v_pack_id, 'RESERVA', (-1) * v_qty, now(), v_source_ref
        );
      END IF;
    END IF;
  END LOOP;
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
  v_marketplace_order_id text;
  v_pack_id bigint;
  v_source_ref text;
  oi jsonb;
  v_item_id text;
  v_variation_id text;
  v_qty integer;
  v_product_id uuid;
  v_ps_reserved integer;
  v_ps_current integer;
  v_reserved_to_consume integer;
BEGIN
  SELECT mo.organizations_id, mo.company_id, mo.marketplace_name, mo.marketplace_order_id
  INTO v_org_id, v_company_id, v_marketplace, v_marketplace_order_id
  FROM public.marketplace_orders_raw mo
  WHERE mo.id = p_order_id
  LIMIT 1;

  SELECT pack_id INTO v_pack_id FROM public.marketplace_orders_presented WHERE id = p_order_id LIMIT 1;
  v_source_ref := CONCAT('PEDIDO[', COALESCE(v_pack_id::text, v_marketplace_order_id, '0'), ']');

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
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

    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(ps.reserved, 0), ps.current
      INTO v_ps_reserved, v_ps_current
      FROM public.products_stock ps
      WHERE ps.product_id = v_product_id
        AND ps.storage_id = p_storage_id
        AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        IF EXISTS (
          SELECT 1
          FROM public.inventory_transactions it
          WHERE it.product_id = v_product_id
            AND it.storage_id = p_storage_id
            AND it.movement_type = 'SAIDA'
            AND (
              it.pack_id = v_pack_id
              OR (v_pack_id IS NULL AND it.source_ref = v_source_ref)
            )
        ) THEN
          CONTINUE;
        END IF;
        v_reserved_to_consume := LEAST(v_ps_reserved, v_qty);

        UPDATE public.products_stock ps
        SET reserved = GREATEST(COALESCE(ps.reserved, 0) - v_reserved_to_consume, 0),
            current = GREATEST(ps.current - v_qty, 0),
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = p_storage_id
          AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

        INSERT INTO public.inventory_transactions (
          organizations_id, company_id, product_id, storage_id, pack_id, movement_type, quantity_change, timestamp, source_ref
        ) VALUES (
          v_org_id, v_company_id, v_product_id, p_storage_id, v_pack_id, 'SAIDA', (-1) * v_qty, now(), v_source_ref
        );
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
  v_marketplace_order_id text;
  v_pack_id bigint;
  v_source_ref text;
  oi jsonb;
  v_item_id text;
  v_variation_id text;
  v_qty integer;
  v_product_id uuid;
  v_ps_reserved integer;
BEGIN
  SELECT mo.organizations_id, mo.company_id, mo.marketplace_name, mo.marketplace_order_id
  INTO v_org_id, v_company_id, v_marketplace, v_marketplace_order_id
  FROM public.marketplace_orders_raw mo
  WHERE mo.id = p_order_id
  LIMIT 1;

  SELECT pack_id INTO v_pack_id FROM public.marketplace_orders_presented WHERE id = p_order_id LIMIT 1;
  v_source_ref := CONCAT('PEDIDO[', COALESCE(v_pack_id::text, v_marketplace_order_id, '0'), ']');

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
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

    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(ps.reserved, 0)
      INTO v_ps_reserved
      FROM public.products_stock ps
      WHERE ps.product_id = v_product_id
        AND ps.storage_id = p_storage_id
        AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        IF EXISTS (
          SELECT 1
          FROM public.inventory_transactions it
          WHERE it.product_id = v_product_id
            AND it.storage_id = p_storage_id
            AND it.movement_type = 'CANCELAMENTO_RESERVA'
            AND (
              it.pack_id = v_pack_id
              OR (v_pack_id IS NULL AND it.source_ref = v_source_ref)
            )
        ) THEN
          CONTINUE;
        END IF;
        UPDATE public.products_stock ps
        SET reserved = GREATEST(COALESCE(ps.reserved, 0) - v_qty, 0),
            updated_at = now()
        WHERE ps.product_id = v_product_id
          AND ps.storage_id = p_storage_id
          AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

        INSERT INTO public.inventory_transactions (
          organizations_id, company_id, product_id, storage_id, pack_id, movement_type, quantity_change, timestamp, source_ref
        ) VALUES (
          v_org_id, v_company_id, v_product_id, p_storage_id, v_pack_id, 'CANCELAMENTO_RESERVA', v_qty, now(), v_source_ref
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_stock_for_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_reserved_stock_for_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_reserved_stock_for_order(uuid, uuid) TO authenticated;

COMMIT;
