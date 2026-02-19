BEGIN;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_transactions_movement_type_check'
      AND conrelid = 'public.inventory_transactions'::regclass
  ) THEN
    ALTER TABLE public.inventory_transactions
      DROP CONSTRAINT inventory_transactions_movement_type_check;
  END IF;
END $$;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_movement_type_check
  CHECK (movement_type IN ('ENTRADA','SAIDA','RESERVA','CANCELAMENTO_RESERVA','RESERVA_FALHA','ERRO_SISTEMA'));

CREATE OR REPLACE FUNCTION public.fn_order_reserva_stock_linked(
  p_order_id uuid,
  p_items jsonb,
  p_storage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_company_id uuid;
  v_marketplace text;
  v_pack_id_text text;
  v_pack_id bigint;
  v_marketplace_order_id text;
  v_storage uuid;
  v_storage_safe uuid;
  li jsonb;
  v_product_id uuid;
  v_err_product_id uuid;
  v_qty integer;
  v_item_id text;
  v_variation_id text;
  v_permanent boolean;
  v_ps_current numeric;
  v_ps_reserved numeric;
  v_available numeric;
  v_err text;
  v_failures integer := 0;
  v_reserved integer := 0;
  v_source_ref text;
  v_sku text;
  v_first_item_id text;
BEGIN
  SELECT organizations_id, company_id, marketplace, pack_id::text, marketplace_order_id, first_item_id
  INTO v_org_id, v_company_id, v_marketplace, v_pack_id_text, v_marketplace_order_id, v_first_item_id
  FROM public.marketplace_orders_presented_new
  WHERE id = p_order_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT organizations_id, company_id, marketplace_name, NULL::text, marketplace_order_id
    INTO v_org_id, v_company_id, v_marketplace, v_pack_id_text, v_marketplace_order_id
    FROM public.marketplace_orders_raw
    WHERE id = p_order_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  v_pack_id := CASE WHEN COALESCE(v_pack_id_text,'') ~ '^[0-9]+$' THEN v_pack_id_text::bigint ELSE NULL END;
  v_storage := COALESCE(p_storage_id, public.fn_get_default_storage(v_org_id));
  v_storage_safe := COALESCE(v_storage, public.fn_get_default_storage(v_org_id));
  IF v_storage_safe IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'DEFAULT_STORAGE_NOT_FOUND');
  END IF;

  v_source_ref := CONCAT('PEDIDO[', COALESCE(v_pack_id_text, v_marketplace_order_id, '0'), ']');

  IF COALESCE(jsonb_typeof(p_items), '') <> 'array' THEN
    RETURN json_build_object('ok', false, 'error', 'INVALID_ITEMS_PAYLOAD');
  END IF;

  FOR li IN
    SELECT x FROM jsonb_array_elements(p_items) x
  LOOP
    v_product_id := COALESCE(NULLIF(li->>'productId','')::uuid, NULLIF(li->>'product_id','')::uuid);
    v_qty := COALESCE(NULLIF(li->>'quantity','')::int, 0);
    v_item_id := COALESCE(li->>'marketplaceItemId', li->>'marketplace_item_id', '');
    v_variation_id := COALESCE(li->>'variationId', li->>'variation_id', '');
    v_permanent := COALESCE(li->>'permanent','') IN ('true','TRUE','t','1') OR COALESCE((li->>'permanent')::boolean, false);

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      v_failures := v_failures + 1;
      CONTINUE;
    END IF;

    IF v_permanent THEN
      IF COALESCE(v_item_id,'') = '' THEN
        IF COALESCE(v_variation_id,'') <> '' THEN
          SELECT COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id')
          INTO v_item_id
          FROM LATERAL jsonb_array_elements(
            COALESCE(
              (SELECT mo.order_items FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id),
              COALESCE((SELECT mo.data->'order_items' FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id), '[]'::jsonb)
            )
          ) oi
          WHERE COALESCE(NULLIF(oi->'item'->>'variation_id',''), NULLIF(oi->>'variation_id',''), '') = COALESCE(v_variation_id,'')
          LIMIT 1;
        END IF;
        IF COALESCE(v_item_id,'') = '' THEN
          IF COALESCE(v_first_item_id,'') <> '' THEN
            v_item_id := v_first_item_id;
          ELSE
            SELECT COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id')
            INTO v_item_id
            FROM LATERAL jsonb_array_elements(
              COALESCE(
                (SELECT mo.order_items FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id),
                COALESCE((SELECT mo.data->'order_items' FROM public.marketplace_orders_raw mo WHERE mo.id = p_order_id), '[]'::jsonb)
              )
            ) oi
            LIMIT 1;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_permanent AND COALESCE(v_item_id,'') <> '' THEN
      INSERT INTO public.marketplace_item_product_links (
        organizations_id, company_id, marketplace_name, marketplace_item_id, variation_id, product_id, permanent
      ) VALUES (
        v_org_id, v_company_id, v_marketplace, v_item_id, COALESCE(v_variation_id,''), v_product_id, true
      )
      ON CONFLICT (organizations_id, marketplace_name, marketplace_item_id, variation_id)
      DO UPDATE SET product_id = EXCLUDED.product_id, permanent = true, updated_at = now();
    END IF;

    SELECT p.sku INTO v_sku FROM public.products p WHERE p.id = v_product_id LIMIT 1;
    SELECT ps.current, COALESCE(ps.reserved, 0)
    INTO v_ps_current, v_ps_reserved
    FROM public.products_stock ps
    WHERE ps.product_id = v_product_id
      AND ps.storage_id = v_storage_safe
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      v_failures := v_failures + 1;
      INSERT INTO public.inventory_transactions (
        organizations_id, company_id, product_id, storage_id, order_id, movement_type, quantity_change, timestamp, source_ref, description
      ) VALUES (
        v_org_id, v_company_id, v_product_id, v_storage_safe, p_order_id, 'ERRO_SISTEMA', 0, now(), v_source_ref, 'Estoque não encontrado para produto'
      );
      CONTINUE;
    END IF;

    v_available := v_ps_current - v_ps_reserved;
    IF v_available < v_qty THEN
      v_failures := v_failures + 1;
      INSERT INTO public.inventory_transactions (
        organizations_id, company_id, product_id, storage_id, order_id, movement_type, quantity_change, timestamp, source_ref, description
      ) VALUES (
        v_org_id, v_company_id, v_product_id, v_storage_safe, p_order_id, 'RESERVA_FALHA', 0, now(), v_source_ref,
        CONCAT('Falha na reserva: ', COALESCE(v_sku,'SKU'), ' (Solicitado: ', v_qty::text, ', Disponível: ', COALESCE(v_available,0)::text, ')')
      );
    END IF;
  END LOOP;

  IF v_failures > 0 THEN
    UPDATE public.marketplace_orders_presented_new
      SET status_interno = 'Sem estoque'
    WHERE id = p_order_id;
    RAISE EXCEPTION 'RESERVA_FALHA_%', v_failures;
  END IF;

  FOR li IN
    SELECT x FROM jsonb_array_elements(p_items) x
  LOOP
    v_product_id := COALESCE(NULLIF(li->>'productId','')::uuid, NULLIF(li->>'product_id','')::uuid);
    v_qty := COALESCE(NULLIF(li->>'quantity','')::int, 0);
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.products_stock ps
    SET reserved = COALESCE(ps.reserved, 0) + v_qty,
        updated_at = now()
    WHERE ps.product_id = v_product_id
      AND ps.storage_id = v_storage_safe
      AND (ps.company_id IS NULL OR ps.company_id = v_company_id);

    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id, pack_id, movement_type, quantity_change, timestamp, source_ref, description
    ) VALUES (
      v_org_id, v_company_id, v_product_id, v_storage_safe, p_order_id, v_pack_id, 'RESERVA', (-1) * v_qty, now(), v_source_ref, NULL
    )
    ON CONFLICT DO NOTHING;
    v_reserved := v_reserved + 1;
  END LOOP;

  RETURN json_build_object('ok', true, 'reserved_count', v_reserved, 'fail_count', 0);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  v_err_product_id := COALESCE(
    v_product_id,
    (SELECT COALESCE(NULLIF(x->>'productId','')::uuid, NULLIF(x->>'product_id','')::uuid) FROM jsonb_array_elements(p_items) x LIMIT 1)
  );
  IF v_err_product_id IS NOT NULL THEN
    INSERT INTO public.inventory_transactions (
      organizations_id, company_id, product_id, storage_id, order_id, movement_type, quantity_change, timestamp, source_ref, description
    ) VALUES (
      v_org_id, v_company_id, v_err_product_id, COALESCE(v_storage_safe, public.fn_get_default_storage(v_org_id)), p_order_id, 'ERRO_SISTEMA', 0, now(), v_source_ref, v_err
    );
  END IF;
  UPDATE public.marketplace_orders_presented_new
    SET status_interno = 'Sem estoque'
  WHERE id = p_order_id;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_order_reserva_stock_linked(uuid, jsonb, uuid) TO authenticated;

COMMIT;
