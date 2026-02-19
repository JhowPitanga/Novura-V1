BEGIN;

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

    IF NEW.marketplace IN ('Shopee','Mercado Livre') THEN
      IF LOWER(COALESCE(NEW.status, '')) LIKE '%cancel%'
         OR LOWER(COALESCE(NEW.shipment_status, '')) IN ('cancelled', 'canceled')
         OR LOWER(COALESCE(NEW.shipment_substatus, '')) LIKE '%cancel%' THEN
        INSERT INTO public.inventory_jobs (order_id, job_type, status)
        VALUES (NEW.id, 'refund', 'pending')
        ON CONFLICT (order_id, job_type) DO NOTHING;
      ELSIF COALESCE(NEW.status_interno, '') IN ('Emissao NF','Impressao','Aguardando Coleta')
            AND COALESCE(NEW.has_unlinked_items, false) = false THEN
        INSERT INTO public.inventory_jobs (order_id, job_type, status)
        VALUES (NEW.id, 'reserve', 'pending')
        ON CONFLICT (order_id, job_type) DO NOTHING;
      ELSIF COALESCE(NEW.status_interno, '') = 'Enviado' THEN
        INSERT INTO public.inventory_jobs (order_id, job_type, status)
        VALUES (NEW.id, 'consume', 'pending')
        ON CONFLICT (order_id, job_type) DO NOTHING;
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

CREATE OR REPLACE FUNCTION public.trg_marketplace_order_items_linked_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.marketplace_orders_presented_new p
       SET has_unlinked_items = EXISTS (
         SELECT 1
         FROM public.marketplace_order_items i
         WHERE i.id = NEW.id
           AND (COALESCE(i.linked_products,'') = '' OR COALESCE(i.has_unlinked_items, false) = true)
       )
     WHERE p.id = NEW.id;

    NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_moi_linked_update ON public.marketplace_order_items;
CREATE TRIGGER trg_moi_linked_update
AFTER UPDATE OF linked_products ON public.marketplace_order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_marketplace_order_items_linked_update();

COMMIT;
