-- Universal marketplace disconnect: per-integration cleanup + provider-level wrapper.
-- Fixes FK NO ACTION on marketplace_listings.integration_id and supports all provider keys.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_disconnect_marketplace_integration(
  p_organizations_id uuid,
  p_integration_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_marketplace_name text;
  v_exists boolean;
BEGIN
  SELECT mi.marketplace_name
  INTO v_marketplace_name
  FROM public.marketplace_integrations mi
  WHERE mi.id = p_integration_id
    AND mi.organizations_id = p_organizations_id
    AND mi.deactivated_at IS NULL
  LIMIT 1;

  IF v_marketplace_name IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_item_product_links mipl
    JOIN public.products_stock ps
      ON ps.product_id = mipl.product_id
     AND (ps.company_id IS NULL OR ps.company_id = mipl.company_id)
    WHERE mipl.organizations_id = p_organizations_id
      AND COALESCE(ps.reserved, 0) > 0
      AND (
        mipl.integration_id = p_integration_id
        OR (
          mipl.integration_id IS NULL
          AND regexp_replace(lower(mipl.marketplace_name), '\s|-', '_', 'g') =
              regexp_replace(lower(v_marketplace_name), '\s|-', '_', 'g')
        )
      )
  ) INTO v_exists;

  RETURN NOT v_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_marketplace_integration_data(
  p_organizations_id uuid,
  p_integration_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marketplace_name text;
  v_norm text;
BEGIN
  SELECT mi.marketplace_name
  INTO v_marketplace_name
  FROM public.marketplace_integrations mi
  WHERE mi.id = p_integration_id
    AND mi.organizations_id = p_organizations_id
  LIMIT 1;

  IF v_marketplace_name IS NULL THEN
    RETURN;
  END IF;

  v_norm := regexp_replace(lower(v_marketplace_name), '\s|-', '_', 'g');

  -- Listings first (FK NO ACTION on integration_id).
  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    DELETE FROM public.marketplace_listings
    WHERE organizations_id = p_organizations_id
      AND integration_id = p_integration_id;
  END IF;

  DELETE FROM public.marketplace_item_product_links
  WHERE organizations_id = p_organizations_id
    AND (
      integration_id = p_integration_id
      OR (
        integration_id IS NULL
        AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm
      )
    );

  DELETE FROM public.marketplace_item_descriptions
  WHERE organizations_id = p_organizations_id
    AND (
      integration_id = p_integration_id
      OR (
        integration_id IS NULL
        AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm
      )
    );

  DELETE FROM public.marketplace_item_prices
  WHERE organizations_id = p_organizations_id
    AND (
      integration_id = p_integration_id
      OR (
        integration_id IS NULL
        AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm
      )
    );

  DELETE FROM public.marketplace_stock_distribution
  WHERE organizations_id = p_organizations_id
    AND (
      integration_id = p_integration_id
      OR (
        integration_id IS NULL
        AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm
      )
    );

  IF to_regclass('public.marketplace_items_raw') IS NOT NULL THEN
    DELETE FROM public.marketplace_items_raw
    WHERE organizations_id = p_organizations_id
      AND (
        integration_id = p_integration_id
        OR (
          integration_id IS NULL
          AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm
        )
      );
  END IF;

  IF to_regclass('public.marketplace_listings_raw') IS NOT NULL THEN
    DELETE FROM public.marketplace_listings_raw
    WHERE organizations_id = p_organizations_id
      AND (
        integration_id = p_integration_id
        OR (
          integration_id IS NULL
          AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm
        )
      );
  END IF;

  IF to_regclass('public.marketplace_listing_sync_jobs') IS NOT NULL THEN
    DELETE FROM public.marketplace_listing_sync_jobs
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;
  END IF;

  IF to_regclass('public.marketplace_drafts') IS NOT NULL THEN
    DELETE FROM public.marketplace_drafts
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;
  END IF;

  IF to_regclass('public.marketplace_promotions') IS NOT NULL THEN
    DELETE FROM public.marketplace_promotions
    WHERE organizations_id = p_organizations_id
      AND integration_id = p_integration_id;
  END IF;

  DELETE FROM public.marketplace_orders_raw
  WHERE organizations_id = p_organizations_id
    AND (
      integration_id = p_integration_id
      OR (
        integration_id IS NULL
        AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm
      )
    );

  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    DELETE FROM public.marketplace_orders
    WHERE organizations_id = p_organizations_id
      AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;
  END IF;

  IF to_regclass('public.marketplace_metrics') IS NOT NULL THEN
    DELETE FROM public.marketplace_metrics
    WHERE organizations_id = p_organizations_id
      AND integration_id = p_integration_id;
  END IF;

  IF to_regclass('public.integration_warehouse_config') IS NOT NULL THEN
    DELETE FROM public.integration_warehouse_config
    WHERE integration_id = p_integration_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_marketplace_integration(
  p_organizations_id uuid,
  p_integration_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can boolean;
BEGIN
  IF p_integration_id IS NULL THEN
    RAISE EXCEPTION 'INTEGRATION_ID_REQUIRED';
  END IF;

  IF NOT public.is_org_member(auth.uid(), p_organizations_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF NOT public.has_org_role(auth.uid(), p_organizations_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT public.can_disconnect_marketplace_integration(
    p_organizations_id,
    p_integration_id
  ) INTO v_can;

  IF NOT v_can THEN
    RAISE EXCEPTION 'RESERVED_STOCK_PRESENT';
  END IF;

  PERFORM public.purge_marketplace_integration_data(p_organizations_id, p_integration_id);

  DELETE FROM public.marketplace_integrations
  WHERE id = p_integration_id
    AND organizations_id = p_organizations_id
    AND deactivated_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_marketplace_by_provider(
  p_organizations_id uuid,
  p_provider_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_integration_id uuid;
BEGIN
  IF p_provider_key IS NULL OR btrim(p_provider_key) = '' THEN
    RAISE EXCEPTION 'PROVIDER_KEY_REQUIRED';
  END IF;

  IF NOT public.is_org_member(auth.uid(), p_organizations_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF NOT public.has_org_role(auth.uid(), p_organizations_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  FOR v_integration_id IN
    SELECT mi.id
    FROM public.marketplace_integrations mi
    JOIN public.marketplace_providers mp ON mp.id = mi.provider_id
    WHERE mi.organizations_id = p_organizations_id
      AND mp.key = p_provider_key
      AND mi.deactivated_at IS NULL
  LOOP
    PERFORM public.disconnect_marketplace_integration(p_organizations_id, v_integration_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_marketplace_cascade(
  p_organizations_id uuid,
  p_marketplace_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_integration_id uuid;
BEGIN
  IF p_marketplace_name IS NULL OR btrim(p_marketplace_name) = '' THEN
    RAISE EXCEPTION 'MARKETPLACE_NAME_REQUIRED';
  END IF;

  IF NOT public.is_org_member(auth.uid(), p_organizations_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF NOT public.has_org_role(auth.uid(), p_organizations_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  FOR v_integration_id IN
    SELECT mi.id
    FROM public.marketplace_integrations mi
    WHERE mi.organizations_id = p_organizations_id
      AND mi.deactivated_at IS NULL
      AND regexp_replace(lower(mi.marketplace_name), '\s|-', '_', 'g') =
          regexp_replace(lower(p_marketplace_name), '\s|-', '_', 'g')
  LOOP
    PERFORM public.disconnect_marketplace_integration(p_organizations_id, v_integration_id);
  END LOOP;

  -- Legacy rows without integration records: purge channel data by marketplace name.
  PERFORM public.purge_marketplace_channel_data(p_organizations_id, p_marketplace_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_disconnect_marketplace_integration(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_integration(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_by_provider(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_cascade(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
