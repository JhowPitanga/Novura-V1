BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_presented_orders_for_item(
  p_organizations_id uuid,
  p_marketplace_name text,
  p_marketplace_item_id text,
  p_variation_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec RECORD;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  FOR rec IN
    SELECT mo.id
    FROM public.marketplace_orders_raw mo
    WHERE mo.organizations_id = p_organizations_id
      AND mo.marketplace_name = p_marketplace_name
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(mo.order_items, '[]'::jsonb)) oi
        WHERE COALESCE(oi->'item'->>'id', oi->>'item_id', oi->>'id') = p_marketplace_item_id
          AND COALESCE(oi->'item'->>'variation_id', oi->>'variation_id', '') = COALESCE(p_variation_id, '')
      )
  LOOP
    PERFORM public.refresh_presented_order(rec.id);
  END LOOP;
  PERFORM set_config('row_security', 'on', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_mipl_refresh_presented()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.refresh_presented_orders_for_item(
      NEW.organizations_id,
      NEW.marketplace_name,
      NEW.marketplace_item_id,
      NEW.variation_id
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_presented_orders_for_item(
      OLD.organizations_id,
      OLD.marketplace_name,
      OLD.marketplace_item_id,
      OLD.variation_id
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mipl_refresh_presented ON public.marketplace_item_product_links;
CREATE TRIGGER trg_mipl_refresh_presented
AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_item_product_links
FOR EACH ROW
EXECUTE FUNCTION public.trg_mipl_refresh_presented();

COMMIT;
