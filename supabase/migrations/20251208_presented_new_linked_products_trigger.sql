BEGIN;

CREATE OR REPLACE FUNCTION public.trg_presented_new_linked_products_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.linked_products IS DISTINCT FROM OLD.linked_products THEN
      PERFORM set_config('row_security', 'off', true);
      PERFORM public.refresh_presented_order(NEW.id);
      PERFORM set_config('row_security', 'on', true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_presented_new_linked_products_refresh ON public.marketplace_orders_presented_new;
CREATE TRIGGER trg_presented_new_linked_products_refresh
AFTER UPDATE OF linked_products ON public.marketplace_orders_presented_new
FOR EACH ROW
EXECUTE FUNCTION public.trg_presented_new_linked_products_refresh();

CREATE OR REPLACE FUNCTION public.update_presented_order_links(
  p_order_id uuid,
  p_links jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  UPDATE public.marketplace_orders_presented_new
  SET linked_products = COALESCE(p_links, '[]'::jsonb)
  WHERE id = p_order_id;
  PERFORM public.refresh_presented_order(p_order_id);
  PERFORM set_config('row_security', 'on', true);
END;
$$;

COMMIT;
