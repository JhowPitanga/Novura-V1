BEGIN;

CREATE OR REPLACE FUNCTION public.trg_presented_new_inventory_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.marketplace <> 'Shopee' THEN
    RETURN NEW;
  END IF;
  IF NEW.organizations_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
     OR COALESCE(OLD.shipment_status, '') <> COALESCE(NEW.shipment_status, '')
     OR COALESCE(OLD.shipment_substatus, '') <> COALESCE(NEW.shipment_substatus, '') THEN

    IF LOWER(COALESCE(NEW.status, '')) LIKE '%cancel%'
       OR LOWER(COALESCE(NEW.shipment_status, '')) IN ('cancelled', 'canceled')
       OR LOWER(COALESCE(NEW.shipment_substatus, '')) LIKE '%cancel%' THEN
      PERFORM set_config('row_security', 'off', true);
      PERFORM public.refund_reserved_stock_for_order(NEW.id, public.fn_get_default_storage(NEW.organizations_id));
      PERFORM set_config('row_security', 'on', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_inventory_on_cancel ON public.marketplace_orders_presented_new;
CREATE TRIGGER trg_marketplace_orders_presented_new_inventory_on_cancel
AFTER UPDATE ON public.marketplace_orders_presented_new
FOR EACH ROW EXECUTE FUNCTION public.trg_presented_new_inventory_on_cancel();

CREATE OR REPLACE FUNCTION public.trg_presented_new_stock_flow()
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

  IF COALESCE(OLD.status_interno, '') <> COALESCE(NEW.status_interno, '')
     OR COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
     OR COALESCE(OLD.shipment_status, '') <> COALESCE(NEW.shipment_status, '')
     OR COALESCE(OLD.shipment_substatus, '') <> COALESCE(NEW.shipment_substatus, '')
     OR COALESCE(OLD.has_unlinked_items, false) <> COALESCE(NEW.has_unlinked_items, false) THEN

    IF NEW.marketplace = 'Shopee' THEN
      IF LOWER(COALESCE(NEW.status, '')) LIKE '%cancel%'
         OR LOWER(COALESCE(NEW.shipment_status, '')) IN ('cancelled', 'canceled')
         OR LOWER(COALESCE(NEW.shipment_substatus, '')) LIKE '%cancel%' THEN
        PERFORM set_config('row_security', 'off', true);
        PERFORM public.refund_reserved_stock_for_order(NEW.id, v_storage);
        PERFORM set_config('row_security', 'on', true);
      ELSIF COALESCE(NEW.status_interno, '') IN ('Emissao NF','Impressao','Aguardando Coleta')
            AND COALESCE(NEW.has_unlinked_items, false) = false THEN
        PERFORM set_config('row_security', 'off', true);
        PERFORM public.reserve_stock_for_order(NEW.id, v_storage);
        PERFORM set_config('row_security', 'on', true);
      ELSIF COALESCE(NEW.status_interno, '') = 'Enviado' THEN
        PERFORM set_config('row_security', 'off', true);
        PERFORM public.consume_reserved_stock_for_order(NEW.id, v_storage);
        PERFORM set_config('row_security', 'on', true);
      END IF;
    ELSIF NEW.marketplace = 'Mercado Livre' THEN
      IF LOWER(COALESCE(NEW.status, '')) LIKE '%cancel%'
         OR LOWER(COALESCE(NEW.shipment_status, '')) IN ('cancelled', 'canceled')
         OR LOWER(COALESCE(NEW.shipment_substatus, '')) LIKE '%cancel%' THEN
        PERFORM set_config('row_security', 'off', true);
        PERFORM public.refund_reserved_stock_for_order(NEW.id, v_storage);
        PERFORM set_config('row_security', 'on', true);
      ELSIF COALESCE(NEW.status_interno, '') IN ('Emissao NF','Impressao','Aguardando Coleta')
            AND COALESCE(NEW.has_unlinked_items, false) = false THEN
        PERFORM set_config('row_security', 'off', true);
        PERFORM public.reserve_stock_for_order(NEW.id, v_storage);
        PERFORM set_config('row_security', 'on', true);
      ELSIF COALESCE(NEW.status_interno, '') = 'Enviado' THEN
        PERFORM set_config('row_security', 'off', true);
        PERFORM public.consume_reserved_stock_for_order(NEW.id, v_storage);
        PERFORM set_config('row_security', 'on', true);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_stock_flow ON public.marketplace_orders_presented_new;
CREATE TRIGGER trg_marketplace_orders_presented_new_stock_flow
AFTER UPDATE OF status, shipment_status, shipment_substatus, status_interno, has_unlinked_items
ON public.marketplace_orders_presented_new
FOR EACH ROW EXECUTE FUNCTION public.trg_presented_new_stock_flow();

COMMIT;
