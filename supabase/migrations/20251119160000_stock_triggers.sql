BEGIN;

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

CREATE OR REPLACE FUNCTION public.trg_orders_presented_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_storage uuid;
BEGIN
  IF NEW.organizations_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_storage := public.fn_get_default_storage(NEW.organizations_id);
  IF v_storage IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status,'') <> COALESCE(NEW.status,'') OR COALESCE(OLD.shipment_status,'') <> COALESCE(NEW.shipment_status,'') THEN
    IF (LOWER(COALESCE(NEW.shipment_status,'')) LIKE '%cancel%') OR NEW.status = 'Cancelado' THEN
      PERFORM public.refund_reserved_stock_by_pack_id(NEW.pack_id, v_storage);
    ELSIF NEW.status = 'Enviado' THEN
      PERFORM public.consume_reserved_stock_by_pack_id(NEW.pack_id, v_storage);
    ELSIF NEW.status IN ('NF Emitida','Impressao','Aguardando Coleta') THEN
      PERFORM public.reserve_stock_by_pack_id(NEW.pack_id, v_storage);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_presented_status_change ON public.marketplace_orders_presented;
CREATE TRIGGER trg_orders_presented_status_change
AFTER UPDATE ON public.marketplace_orders_presented
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_presented_status_change();

COMMIT;