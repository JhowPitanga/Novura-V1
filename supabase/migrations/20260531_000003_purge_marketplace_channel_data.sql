-- Centralize marketplace disconnect cleanup for legacy + canonical listing tables.
-- Fixes 42P01 when marketplace_items was removed but triggers still referenced it.

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_marketplace_channel_data(
  p_organizations_id uuid,
  p_marketplace_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_norm text := regexp_replace(lower(p_marketplace_name), '\s|-', '_', 'g');
BEGIN
  DELETE FROM public.marketplace_item_product_links
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;

  DELETE FROM public.marketplace_item_descriptions
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;

  DELETE FROM public.marketplace_item_prices
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;

  DELETE FROM public.marketplace_stock_distribution
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;

  IF to_regclass('public.marketplace_items_raw') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM public.marketplace_items_raw
       WHERE organizations_id = $1
         AND regexp_replace(lower(marketplace_name), ''\s|-'', ''_'', ''g'') = $2'
    USING p_organizations_id, v_norm;
  END IF;

  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM public.marketplace_listings
       WHERE organizations_id = $1
         AND regexp_replace(lower(marketplace_name), ''\s|-'', ''_'', ''g'') = $2'
    USING p_organizations_id, v_norm;
  END IF;

  IF to_regclass('public.marketplace_listings_raw') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM public.marketplace_listings_raw
       WHERE organizations_id = $1
         AND regexp_replace(lower(marketplace_name), ''\s|-'', ''_'', ''g'') = $2'
    USING p_organizations_id, v_norm;
  END IF;

  IF to_regclass('public.marketplace_listing_sync_jobs') IS NOT NULL THEN
    DELETE FROM public.marketplace_listing_sync_jobs
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;
  END IF;

  IF to_regclass('public.marketplace_drafts') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM public.marketplace_drafts
       WHERE organizations_id = $1
         AND regexp_replace(lower(marketplace_name), ''\s|-'', ''_'', ''g'') = $2'
    USING p_organizations_id, v_norm;
  END IF;

  IF to_regclass('public.marketplace_promotions') IS NOT NULL THEN
    DELETE FROM public.marketplace_promotions mp
    WHERE mp.organizations_id = p_organizations_id
      AND (
        mp.integration_id IN (
          SELECT mi.id
          FROM public.marketplace_integrations mi
          WHERE mi.organizations_id = p_organizations_id
            AND regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g') = v_norm
        )
        OR regexp_replace(lower(COALESCE(mp.marketplace_key, '')), '\s|-', '_', 'g') IN (
          SELECT regexp_replace(lower(prov.key), '\s|-', '_', 'g')
          FROM public.marketplace_providers prov
          WHERE regexp_replace(lower(prov.display_name), '\s|-', '_', 'g') = v_norm
        )
      );
  END IF;

  DELETE FROM public.marketplace_orders_raw
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;

  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM public.marketplace_orders
       WHERE organizations_id = $1
         AND regexp_replace(lower(marketplace_name), ''\s|-'', ''_'', ''g'') = $2'
    USING p_organizations_id, v_norm;
  END IF;

  IF to_regclass('public.marketplace_metrics') IS NOT NULL THEN
    DELETE FROM public.marketplace_metrics
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;
  END IF;
END;
$$;

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

  PERFORM public.purge_marketplace_channel_data(p_organizations_id, p_marketplace_name);

  DELETE FROM public.marketplace_integrations
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') =
        regexp_replace(lower(p_marketplace_name), '\s|-', '_', 'g');
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_marketplace_integrations_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_marketplace_channel_data(OLD.organizations_id, OLD.marketplace_name);
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_cascade(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_by_provider(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
