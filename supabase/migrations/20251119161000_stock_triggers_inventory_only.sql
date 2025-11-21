BEGIN;

CREATE OR REPLACE FUNCTION public.log_inventory_by_pack(p_pack_id bigint, p_org_id uuid, p_storage_id uuid, p_movement text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_company uuid;
DECLARE v_order_ids bigint[];
DECLARE r record;
DECLARE v_qty numeric;
DECLARE v_mtype text;
BEGIN
  SELECT company_id INTO v_company
  FROM public.marketplace_orders_presented
  WHERE pack_id = p_pack_id AND organizations_id = p_org_id
  LIMIT 1;

  SELECT array_agg(marketplace_order_id)::bigint[] INTO v_order_ids
  FROM public.marketplace_orders_presented
  WHERE pack_id = p_pack_id AND organizations_id = p_org_id;

  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_mtype := p_movement;

  FOR r IN
    SELECT
      l.product_id::uuid AS product_id,
      SUM(COALESCE((oi->>'quantity')::numeric, 0)) AS total_qty
    FROM public.marketplace_orders_raw mor
    JOIN LATERAL jsonb_array_elements(COALESCE(mor.data->'order_items', '[]'::jsonb)) AS oi ON TRUE
    JOIN LATERAL (
      SELECT mil.product_id
      FROM public.marketplace_item_product_links mil
      WHERE mil.marketplace_name = 'Mercado Livre'
        AND mil.marketplace_item_id = COALESCE(oi->'item'->>'id', '')
      LIMIT 1
    ) AS l ON TRUE
    WHERE mor.marketplace_order_id = ANY(v_order_ids)
    GROUP BY l.product_id
  LOOP
    v_qty := COALESCE(r.total_qty, 0);
    IF v_qty > 0 THEN
      INSERT INTO public.inventory_transactions(
        organizations_id,
        company_id,
        product_id,
        storage_id,
        movement_type,
        quantity_change,
        source_ref,
        pack_id
      ) VALUES (
        p_org_id,
        v_company,
        r.product_id,
        p_storage_id,
        v_mtype,
        CASE WHEN v_mtype IN ('RESERVA','SAIDA') THEN -v_qty ELSE v_qty END,
        CONCAT('PACK[', p_pack_id, ']'),
        p_pack_id
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_default_storage(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_storage uuid;
BEGIN
  SELECT s.id INTO v_storage
  FROM public.storage s
  WHERE s.organizations_id = p_org_id AND s.active = true
  ORDER BY s.created_at ASC
  LIMIT 1;
  RETURN v_storage;
END;
$$;

-- Removed shipments trigger: marketplace_shipments is a view; inventory logging will be driven by marketplace_orders_raw updates

CREATE OR REPLACE FUNCTION public.trg_orders_raw_inventory_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_pack bigint; v_org uuid; v_storage uuid;
BEGIN
  IF NEW.marketplace_name <> 'Mercado Livre' THEN RETURN NEW; END IF;
  SELECT mop.pack_id, mop.organizations_id INTO v_pack, v_org
  FROM public.marketplace_orders_presented mop
  WHERE mop.marketplace_order_id = NEW.marketplace_order_id
  LIMIT 1;
  IF v_pack IS NULL OR v_org IS NULL THEN RETURN NEW; END IF;
  v_storage := public.fn_get_default_storage(v_org);
  IF v_storage IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status,'') <> COALESCE(NEW.status,'') OR OLD.shipments IS DISTINCT FROM NEW.shipments THEN
    IF LOWER(COALESCE(NEW.status,'')) LIKE '%cancel%'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
         WHERE LOWER(COALESCE(s->>'status','')) = 'cancelled'
            OR LOWER(COALESCE(s->>'substatus','')) LIKE '%cancel%'
       ) THEN
      PERFORM public.log_inventory_by_pack(v_pack, v_org, v_storage, 'CANCELAMENTO_RESERVA');
    ELSIF LOWER(COALESCE(NEW.status,'')) IN ('ready_to_ship','invoice_issued','printed') THEN
      PERFORM public.log_inventory_by_pack(v_pack, v_org, v_storage, 'RESERVA');
    ELSIF LOWER(COALESCE(NEW.status,'')) IN ('shipped','delivered')
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.shipments, '[]'::jsonb)) s
         WHERE LOWER(COALESCE(s->>'status','')) IN ('shipped','delivered')
       ) THEN
      PERFORM public.log_inventory_by_pack(v_pack, v_org, v_storage, 'SAIDA');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'marketplace_shipments' AND t.tgname = 'trg_marketplace_shipments_stock_flow'
  ) THEN
    DROP TRIGGER trg_marketplace_shipments_stock_flow ON public.marketplace_shipments;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'marketplace_orders_raw' AND t.tgname = 'trg_marketplace_orders_raw_stock_flow'
  ) THEN
    DROP TRIGGER trg_marketplace_orders_raw_stock_flow ON public.marketplace_orders_raw;
  END IF;
END $$;

-- No trigger on marketplace_shipments (view)

DROP TRIGGER IF EXISTS trg_marketplace_orders_raw_inventory_only ON public.marketplace_orders_raw;
CREATE TRIGGER trg_marketplace_orders_raw_inventory_only
AFTER UPDATE ON public.marketplace_orders_raw
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_raw_inventory_only();

COMMIT;