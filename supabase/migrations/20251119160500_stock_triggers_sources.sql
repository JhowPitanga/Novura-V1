BEGIN;

-- Remove trigger on view to avoid confusion and side-effects
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'marketplace_orders_presented' AND t.tgname = 'trg_orders_presented_status_change'
  ) THEN
    DROP TRIGGER trg_orders_presented_status_change ON public.marketplace_orders_presented;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_marketplace_shipments_stock_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_pack bigint; v_org uuid; v_storage uuid;
BEGIN
  IF NEW.marketplace_name <> 'Mercado Livre' THEN
    RETURN NEW;
  END IF;
  SELECT mop.pack_id, mop.organizations_id INTO v_pack, v_org
  FROM public.marketplace_orders_presented mop
  WHERE mop.marketplace_order_id = NEW.marketplace_order_id
  LIMIT 1;
  IF v_org IS NULL THEN RETURN NEW; END IF;
  v_storage := public.fn_get_default_storage(v_org);
  IF v_storage IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status,'') <> COALESCE(NEW.status,'') OR COALESCE(OLD.substatus,'') <> COALESCE(NEW.substatus,'') THEN
      IF LOWER(COALESCE(NEW.status,'')) = 'cancelled' OR LOWER(COALESCE(NEW.substatus,'')) LIKE '%cancel%' THEN
        PERFORM public.refund_reserved_stock_by_pack_id(v_pack, v_storage);
      ELSIF LOWER(COALESCE(NEW.status,'')) IN ('shipped','delivered') THEN
        PERFORM public.consume_reserved_stock_by_pack_id(v_pack, v_storage);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_shipments_stock_flow ON public.marketplace_shipments;
CREATE TRIGGER trg_marketplace_shipments_stock_flow
AFTER UPDATE ON public.marketplace_shipments
FOR EACH ROW EXECUTE FUNCTION public.trg_marketplace_shipments_stock_flow();

CREATE OR REPLACE FUNCTION public.trg_marketplace_orders_raw_stock_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_pack bigint; v_org uuid; v_storage uuid;
BEGIN
  IF NEW.marketplace_name <> 'Mercado Livre' THEN
    RETURN NEW;
  END IF;
  SELECT mop.pack_id, mop.organizations_id INTO v_pack, v_org
  FROM public.marketplace_orders_presented mop
  WHERE mop.marketplace_order_id = NEW.marketplace_order_id
  LIMIT 1;
  IF v_org IS NULL THEN RETURN NEW; END IF;
  v_storage := public.fn_get_default_storage(v_org);
  IF v_storage IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status,'') <> COALESCE(NEW.status,'') THEN
      IF LOWER(COALESCE(NEW.status,'')) LIKE '%cancel%' THEN
        PERFORM public.refund_reserved_stock_by_pack_id(v_pack, v_storage);
      ELSIF LOWER(COALESCE(NEW.status,'')) IN ('ready_to_ship','invoice_issued','printed') THEN
        PERFORM public.reserve_stock_by_pack_id(v_pack, v_storage);
      ELSIF LOWER(COALESCE(NEW.status,'')) IN ('shipped','delivered') THEN
        PERFORM public.consume_reserved_stock_by_pack_id(v_pack, v_storage);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_orders_raw_stock_flow ON public.marketplace_orders_raw;
CREATE TRIGGER trg_marketplace_orders_raw_stock_flow
AFTER UPDATE ON public.marketplace_orders_raw
FOR EACH ROW EXECUTE FUNCTION public.trg_marketplace_orders_raw_stock_flow();

COMMIT;