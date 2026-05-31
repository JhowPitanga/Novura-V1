-- Ensure disconnect RPCs are exposed to PostgREST and cascade deletes canonical listings
-- before removing marketplace_integrations (FK NO ACTION on marketplace_listings.integration_id).

BEGIN;

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
  v_norm text := regexp_replace(lower(p_marketplace_name), '\s|-', '_', 'g');
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

  IF to_regclass('public.marketplace_items') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM public.marketplace_items
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

  IF to_regclass('public.marketplace_drafts') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM public.marketplace_drafts
       WHERE organizations_id = $1
         AND regexp_replace(lower(marketplace_name), ''\s|-'', ''_'', ''g'') = $2'
    USING p_organizations_id, v_norm;
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

  DELETE FROM public.marketplace_integrations
  WHERE organizations_id = p_organizations_id
    AND regexp_replace(lower(marketplace_name), '\s|-', '_', 'g') = v_norm;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_marketplace_by_provider(
  p_organizations_id uuid,
  p_provider_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_marketplace_name text;
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

  SELECT display_name INTO v_marketplace_name
  FROM marketplace_providers
  WHERE key = p_provider_key
  LIMIT 1;

  IF v_marketplace_name IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND:%', p_provider_key;
  END IF;

  PERFORM public.disconnect_marketplace_cascade(p_organizations_id, v_marketplace_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_marketplace_by_provider(jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payload alias for $1;
  v_organizations_id uuid;
  v_provider_key text;
BEGIN
  v_organizations_id := COALESCE(
    NULLIF(v_payload->>'p_organizations_id', '')::uuid,
    NULLIF(v_payload->>'p_organization_id', '')::uuid,
    NULLIF(v_payload->>'organization_id', '')::uuid,
    NULLIF(v_payload->>'organizations_id', '')::uuid
  );
  v_provider_key := COALESCE(
    NULLIF(v_payload->>'p_provider_key', ''),
    NULLIF(v_payload->>'provider_key', ''),
    NULLIF(v_payload->>'providerKey', '')
  );

  PERFORM public.disconnect_marketplace_by_provider(v_organizations_id, v_provider_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_cascade(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_by_provider(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_by_provider(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
