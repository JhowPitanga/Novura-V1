BEGIN;

DROP TRIGGER IF EXISTS trg_marketplace_orders_raw_inventory_only ON public.marketplace_orders_raw;
DROP TRIGGER IF EXISTS trg_marketplace_orders_raw_stock_flow ON public.marketplace_orders_raw;
DROP TRIGGER IF EXISTS trg_marketplace_shipments_stock_flow ON public.marketplace_shipments;
DROP TRIGGER IF EXISTS trg_orders_presented_status_change ON public.marketplace_orders_presented;

DROP FUNCTION IF EXISTS public.trg_orders_raw_inventory_only() CASCADE;
DROP FUNCTION IF EXISTS public.trg_marketplace_orders_raw_stock_flow() CASCADE;
DROP FUNCTION IF EXISTS public.trg_marketplace_shipments_stock_flow() CASCADE;
DROP FUNCTION IF EXISTS public.trg_orders_presented_status_change() CASCADE;

DROP FUNCTION IF EXISTS public.fn_get_default_storage(uuid);
DROP FUNCTION IF EXISTS public.reserve_stock_by_pack_id(bigint, uuid);
DROP FUNCTION IF EXISTS public.consume_reserved_stock_by_pack_id(bigint, uuid);
DROP FUNCTION IF EXISTS public.refund_reserved_stock_by_pack_id(bigint, uuid);
DROP FUNCTION IF EXISTS public.log_inventory_by_pack(bigint, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.link_order_stock(
  p_order_id uuid,
  p_storage_id_for_reservation uuid
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
  oi jsonb;
  v_item_id text;
  v_variation_id text;
  v_qty integer;
  v_product_id uuid;
  v_storage_id uuid;
BEGIN
  SELECT mo.organizations_id, mo.company_id, mo.marketplace_name, mo.marketplace_order_id
  INTO v_org_id, v_company_id, v_marketplace, v_marketplace_order_id
  FROM public.marketplace_orders_raw mo
  WHERE mo.id = p_order_id
  LIMIT 1;

  SELECT pack_id INTO v_pack_id FROM public.marketplace_orders_presented WHERE id = p_order_id LIMIT 1;

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
      IF p_storage_id_for_reservation IS NOT NULL THEN
        v_storage_id := p_storage_id_for_reservation;
      ELSE
        SELECT ps.storage_id
        INTO v_storage_id
        FROM public.products_stock ps
        WHERE ps.product_id = v_product_id
          AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
        ORDER BY ps.created_at ASC
        LIMIT 1
        FOR UPDATE;
      END IF;

      IF v_storage_id IS NOT NULL THEN
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
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_order_stock(uuid, uuid) TO authenticated;

COMMIT;