BEGIN;

CREATE OR REPLACE FUNCTION public.can_disconnect_marketplace(
  p_organizations_id uuid,
  p_marketplace_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_item_product_links mipl
    JOIN public.products_stock ps
      ON ps.product_id = mipl.product_id
     AND (ps.company_id IS NULL OR ps.company_id = mipl.company_id)
    WHERE mipl.organizations_id = p_organizations_id
      AND mipl.marketplace_name = p_marketplace_name
      AND COALESCE(ps.reserved, 0) > 0
  ) INTO v_exists;
  RETURN NOT v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_disconnect_marketplace(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.disconnect_marketplace_cascade(
  p_organizations_id uuid,
  p_marketplace_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_can boolean;
BEGIN
  SELECT public.can_disconnect_marketplace(p_organizations_id, p_marketplace_name) INTO v_can;
  IF NOT v_can THEN
    RAISE EXCEPTION 'RESERVED_STOCK_PRESENT';
  END IF;

  DELETE FROM public.marketplace_item_product_links
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;

  DELETE FROM public.marketplace_item_descriptions
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;

  DELETE FROM public.marketplace_item_prices
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;

  DELETE FROM public.marketplace_stock_distribution
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;

  DELETE FROM public.marketplace_items_raw
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;

  DELETE FROM public.marketplace_items
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;

  DELETE FROM public.marketplace_orders_raw
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;

  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    DELETE FROM public.marketplace_orders
    WHERE organizations_id = p_organizations_id
      AND marketplace_name = p_marketplace_name;
  END IF;

  DELETE FROM public.marketplace_integrations
  WHERE organizations_id = p_organizations_id
    AND marketplace_name = p_marketplace_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_cascade(uuid, text) TO authenticated;

-- Enforce cascade on direct DELETE of marketplace_integrations
CREATE OR REPLACE FUNCTION public.trg_marketplace_integrations_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NOT public.can_disconnect_marketplace(OLD.organizations_id, OLD.marketplace_name) THEN
    RAISE EXCEPTION 'RESERVED_STOCK_PRESENT';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_marketplace_integrations_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.marketplace_item_product_links
  WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;

  DELETE FROM public.marketplace_item_descriptions
  WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;

  DELETE FROM public.marketplace_item_prices
  WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;

  DELETE FROM public.marketplace_stock_distribution
  WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;

  DELETE FROM public.marketplace_items_raw
  WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;

  DELETE FROM public.marketplace_items
  WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;

  DELETE FROM public.marketplace_orders_raw
  WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;

  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    DELETE FROM public.marketplace_orders
    WHERE organizations_id = OLD.organizations_id AND marketplace_name = OLD.marketplace_name;
  END IF;

  RETURN NULL;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_marketplace_integrations_before_delete'
  ) THEN
    CREATE TRIGGER trg_marketplace_integrations_before_delete
    BEFORE DELETE ON public.marketplace_integrations
    FOR EACH ROW EXECUTE FUNCTION public.trg_marketplace_integrations_before_delete();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_marketplace_integrations_after_delete'
  ) THEN
    CREATE TRIGGER trg_marketplace_integrations_after_delete
    AFTER DELETE ON public.marketplace_integrations
    FOR EACH ROW EXECUTE FUNCTION public.trg_marketplace_integrations_after_delete();
  END IF;
END $$;

COMMIT;