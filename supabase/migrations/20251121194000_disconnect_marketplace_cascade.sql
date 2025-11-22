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
      AND regexp_replace(lower(mipl.marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g')
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
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_can boolean;
BEGIN
  IF NOT public.is_org_member(auth.uid(), p_organizations_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF NOT public.has_org_role(auth.uid(), p_organizations_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT public.can_disconnect_marketplace(p_organizations_id, p_marketplace_name) INTO v_can;
  IF NOT v_can THEN
    RAISE EXCEPTION 'RESERVED_STOCK_PRESENT';
  END IF;

  DELETE FROM public.marketplace_item_product_links
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_item_descriptions
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_item_prices
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_stock_distribution
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');

  IF to_regclass('public.marketplace_items_raw') IS NOT NULL THEN
    DELETE FROM public.marketplace_items_raw
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');
  END IF;

  DELETE FROM public.marketplace_items
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_orders_raw
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');

  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    DELETE FROM public.marketplace_orders
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');
  END IF;


  IF to_regclass('public.marketplace_metrics') IS NOT NULL THEN
    DELETE FROM public.marketplace_metrics
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');
  END IF;

  DELETE FROM public.marketplace_integrations
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(p_marketplace_name), '\\s|-', '_', 'g');
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_cascade(uuid, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_item_product_links') THEN
    ALTER TABLE public.marketplace_item_product_links ADD COLUMN IF NOT EXISTS integration_id uuid;
    UPDATE public.marketplace_item_product_links AS t
    SET integration_id = mi.id
    FROM public.marketplace_integrations mi
    WHERE t.organizations_id = mi.organizations_id
      AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
      AND (t.company_id IS NULL OR t.company_id = mi.company_id)
      AND t.integration_id IS NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_item_product_links_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_item_product_links
      ADD CONSTRAINT fk_marketplace_item_product_links_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_item_descriptions') THEN
    ALTER TABLE public.marketplace_item_descriptions ADD COLUMN IF NOT EXISTS integration_id uuid;
    UPDATE public.marketplace_item_descriptions AS t
    SET integration_id = mi.id
    FROM public.marketplace_integrations mi
    WHERE t.organizations_id = mi.organizations_id
      AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
      AND t.integration_id IS NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_item_descriptions_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_item_descriptions
      ADD CONSTRAINT fk_marketplace_item_descriptions_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_item_prices') THEN
    ALTER TABLE public.marketplace_item_prices ADD COLUMN IF NOT EXISTS integration_id uuid;
    UPDATE public.marketplace_item_prices AS t
    SET integration_id = mi.id
    FROM public.marketplace_integrations mi
    WHERE t.organizations_id = mi.organizations_id
      AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
      AND t.integration_id IS NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_item_prices_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_item_prices
      ADD CONSTRAINT fk_marketplace_item_prices_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_stock_distribution') THEN
    ALTER TABLE public.marketplace_stock_distribution ADD COLUMN IF NOT EXISTS integration_id uuid;
    UPDATE public.marketplace_stock_distribution AS t
    SET integration_id = mi.id
    FROM public.marketplace_integrations mi
    WHERE t.organizations_id = mi.organizations_id
      AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
      AND t.integration_id IS NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_stock_distribution_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_stock_distribution
      ADD CONSTRAINT fk_marketplace_stock_distribution_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_items_raw') THEN
    ALTER TABLE public.marketplace_items_raw ADD COLUMN IF NOT EXISTS integration_id uuid;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketplace_items_raw' AND column_name = 'company_id'
    ) THEN
      UPDATE public.marketplace_items_raw AS t
      SET integration_id = mi.id
      FROM public.marketplace_integrations mi
      WHERE t.organizations_id = mi.organizations_id
        AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
        AND (t.company_id IS NULL OR t.company_id = mi.company_id)
        AND t.integration_id IS NULL;
    ELSE
      UPDATE public.marketplace_items_raw AS t
      SET integration_id = mi.id
      FROM public.marketplace_integrations mi
      WHERE t.organizations_id = mi.organizations_id
        AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
        AND t.integration_id IS NULL;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_items_raw_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_items_raw
      ADD CONSTRAINT fk_marketplace_items_raw_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'marketplace_items'
      AND c.relkind IN ('r','p')
  ) THEN
    ALTER TABLE public.marketplace_items ADD COLUMN IF NOT EXISTS integration_id uuid;
    UPDATE public.marketplace_items AS t
    SET integration_id = mi.id
    FROM public.marketplace_integrations mi
    WHERE t.organizations_id = mi.organizations_id
      AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
      AND (t.company_id IS NULL OR t.company_id = mi.company_id)
      AND t.integration_id IS NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_items_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_items
      ADD CONSTRAINT fk_marketplace_items_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_orders_raw') THEN
    ALTER TABLE public.marketplace_orders_raw ADD COLUMN IF NOT EXISTS integration_id uuid;
    UPDATE public.marketplace_orders_raw AS t
    SET integration_id = mi.id
    FROM public.marketplace_integrations mi
    WHERE t.organizations_id = mi.organizations_id
      AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
      AND (t.company_id IS NULL OR t.company_id = mi.company_id)
      AND t.integration_id IS NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_orders_raw_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_orders_raw
      ADD CONSTRAINT fk_marketplace_orders_raw_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_metrics') THEN
    ALTER TABLE public.marketplace_metrics ADD COLUMN IF NOT EXISTS integration_id uuid;
    UPDATE public.marketplace_metrics AS t
    SET integration_id = mi.id
    FROM public.marketplace_integrations mi
    WHERE t.organizations_id = mi.organizations_id
      AND regexp_replace(lower(t.marketplace_name), '\s|-', '_', 'g') = regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g')
      AND t.integration_id IS NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_marketplace_metrics_integration_id'
    ) THEN
      ALTER TABLE public.marketplace_metrics
      ADD CONSTRAINT fk_marketplace_metrics_integration_id
      FOREIGN KEY (integration_id) REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Enforce cascade on direct DELETE of marketplace_integrations
CREATE OR REPLACE FUNCTION public.trg_marketplace_integrations_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.marketplace_item_product_links
  WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_item_descriptions
  WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_item_prices
  WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_stock_distribution
  WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');

  IF to_regclass('public.marketplace_items_raw') IS NOT NULL THEN
    DELETE FROM public.marketplace_items_raw
    WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');
  END IF;

  DELETE FROM public.marketplace_items
  WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');

  DELETE FROM public.marketplace_orders_raw
  WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');

  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    DELETE FROM public.marketplace_orders
    WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');
  END IF;


  IF to_regclass('public.marketplace_metrics') IS NOT NULL THEN
    DELETE FROM public.marketplace_metrics
    WHERE organizations_id = OLD.organizations_id AND regexp_replace(lower(marketplace_name), '\\s|-', '_', 'g') = regexp_replace(lower(OLD.marketplace_name), '\\s|-', '_', 'g');
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