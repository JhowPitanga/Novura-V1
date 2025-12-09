BEGIN;

CREATE OR REPLACE FUNCTION public.trg_presented_new_inventory_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.marketplace <> 'Mercado Livre' THEN
    RETURN NEW;
  END IF;

  IF NEW.pack_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
     OR COALESCE(OLD.shipment_status, '') <> COALESCE(NEW.shipment_status, '')
     OR COALESCE(OLD.shipment_substatus, '') <> COALESCE(NEW.shipment_substatus, '') THEN

    IF LOWER(COALESCE(NEW.status, '')) LIKE '%cancel%'
       OR LOWER(COALESCE(NEW.shipment_status, '')) IN ('cancelled', 'canceled')
       OR LOWER(COALESCE(NEW.shipment_substatus, '')) LIKE '%cancel%' THEN
      PERFORM public.ensure_inventory_by_pack_id(NEW.pack_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_inventory_on_cancel ON public.marketplace_orders_presented_new;
CREATE TRIGGER trg_marketplace_orders_presented_new_inventory_on_cancel
AFTER UPDATE ON public.marketplace_orders_presented_new
FOR EACH ROW EXECUTE FUNCTION public.trg_presented_new_inventory_on_cancel();

COMMIT;

