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
BEGIN
  PERFORM set_config('row_security', 'off', true);
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
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_mipl_refresh_presented ON public.marketplace_item_product_links;
CREATE TRIGGER trg_mipl_refresh_presented
AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_item_product_links
FOR EACH ROW
EXECUTE FUNCTION public.trg_mipl_refresh_presented();
COMMIT;
