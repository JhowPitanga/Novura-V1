BEGIN;

DROP VIEW IF EXISTS public.marketplace_items_with_metrics CASCADE;
DROP VIEW IF EXISTS public.marketplace_items_unified CASCADE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'marketplace_items'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.marketplace_items CASCADE';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.marketplace_items_raw
  DROP COLUMN IF EXISTS description_html,
  DROP COLUMN IF EXISTS last_description_update,
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS available_quantity,
  DROP COLUMN IF EXISTS sold_quantity;

ALTER TABLE IF EXISTS public.marketplace_items_raw
  ADD COLUMN IF NOT EXISTS promotion_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS performance_data jsonb,
  ADD COLUMN IF NOT EXISTS item_perfomance jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketplace_items_raw'
      AND column_name = 'shipping_types'
      AND data_type <> 'jsonb'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.marketplace_items_raw
      ALTER COLUMN shipping_types
      TYPE jsonb
      USING CASE
        WHEN shipping_types IS NULL THEN NULL::jsonb
        ELSE to_jsonb(shipping_types)
      END
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.marketplace_items_raw') IS NOT NULL THEN
    EXECUTE $v$
      CREATE VIEW public.marketplace_items_unified AS
      WITH base AS (
        SELECT
          mir.*,
          COALESCE(
            mir.data->'shipping'->>'logistic_type',
            mir.data->'shipping'->'logistic'->>'type'
          ) AS logistic_type,
          COALESCE(mir.data->'shipping'->'tags', '[]'::jsonb) AS shipping_raw_tags,
          COALESCE(mir.shipping_types, '[]'::jsonb) AS shipping_types_array,
          COALESCE(
            ARRAY(
              SELECT LOWER(x)
              FROM jsonb_array_elements_text(COALESCE(mir.stock_distribution->'shipping_types', '[]'::jsonb)) x
            ),
            ARRAY[]::text[]
          ) AS stock_distribution_types_array,
          COALESCE(
            ARRAY(
              SELECT LOWER(COALESCE(loc->>'shipping_type',''))
              FROM jsonb_array_elements(COALESCE(mir.stock_distribution->'locations', '[]'::jsonb)) loc
              WHERE COALESCE(loc->>'shipping_type','') <> ''
            ),
            ARRAY[]::text[]
          ) AS stock_distribution_locations_types_array,
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(mir.stock_distribution->'locations', '[]'::jsonb)) loc
            WHERE LOWER(COALESCE(loc->>'warehouse_id','')) = 'meli_facility'
          ) AS has_meli_facility
        FROM public.marketplace_items_raw mir
      ),
      initial AS (
        SELECT
          base.*,
          ARRAY_REMOVE(ARRAY(
            SELECT DISTINCT k FROM (
              SELECT CASE
                WHEN LOWER(COALESCE(base.logistic_type,'')) IN ('fulfillment','fbm') THEN 'full'
                WHEN LOWER(COALESCE(base.logistic_type,'')) = 'self_service' THEN 'flex'
                WHEN LOWER(COALESCE(base.logistic_type,'')) = 'drop_off' THEN 'correios'
                WHEN LOWER(COALESCE(base.logistic_type,'')) IN ('xd_drop_off','cross_docking','me2','custom','agencia') THEN 'envios'
                ELSE NULL END
              UNION ALL
              SELECT CASE
                WHEN LOWER(t) = 'self_service_in' THEN 'flex'
                WHEN LOWER(t) = 'self_service_out' THEN 'self_service_out'
                ELSE LOWER(t) END
              FROM jsonb_array_elements_text(base.shipping_raw_tags) t
              UNION ALL
              SELECT CASE
                WHEN LOWER(st) IN ('fulfillment','fbm') THEN 'full'
                WHEN LOWER(st) = 'self_service' THEN 'flex'
                WHEN LOWER(st) = 'drop_off' THEN 'correios'
                WHEN LOWER(st) IN ('xd_drop_off','cross_docking','me2','custom','agencia') THEN 'envios'
                ELSE LOWER(st) END
              FROM jsonb_array_elements_text(base.shipping_types_array) st
              UNION ALL
              SELECT CASE
                WHEN LOWER(st2) IN ('fulfillment','fbm') THEN 'full'
                WHEN LOWER(st2) = 'self_service' THEN 'flex'
                WHEN LOWER(st2) = 'drop_off' THEN 'correios'
                WHEN LOWER(st2) IN ('xd_drop_off','cross_docking','me2','custom','agencia') THEN 'envios'
                ELSE LOWER(st2) END
              FROM unnest(base.stock_distribution_types_array) st2
              UNION ALL
              SELECT CASE
                WHEN LOWER(st3) IN ('fulfillment','fbm') THEN 'full'
                WHEN LOWER(st3) = 'self_service' THEN 'flex'
                WHEN LOWER(st3) = 'drop_off' THEN 'correios'
                WHEN LOWER(st3) IN ('xd_drop_off','cross_docking','me2','custom','agencia') THEN 'envios'
                ELSE LOWER(st3) END
              FROM unnest(base.stock_distribution_locations_types_array) st3
              UNION ALL
              SELECT CASE WHEN base.has_meli_facility THEN 'full' END
            ) q(k)
          ), NULL) AS shipping_tags_base
        FROM base
      ),
      final AS (
        SELECT
          initial.*,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(initial.shipping_raw_tags) tt WHERE LOWER(tt) = 'self_service_out'
            ) AND LOWER(COALESCE(initial.logistic_type,'')) <> 'self_service'
            THEN ARRAY(SELECT x FROM unnest(initial.shipping_tags_base) x WHERE x <> 'flex')
            ELSE initial.shipping_tags_base
          END AS shipping_tags_adjusted
        FROM initial
      )
      SELECT
        final.id,
        final.organizations_id,
        final.company_id,
        final.marketplace_name,
        final.marketplace_item_id,
        final.title,
        final.sku,
        final.condition,
        final.status,
        COALESCE(
          (final.data->'prices'->'prices'->0->'sale_price'->>'amount')::numeric,
          (final.data->'prices'->'sale_price'->>'amount')::numeric,
          (final.data->>'price')::numeric,
          ip.sale_price_amount,
          final.price
        ) AS price,
        final.promotion_price,
        final.category_id,
        final.permalink,
        final.attributes,
        final.variations,
        final.pictures,
        final.seller_id,
        final.last_synced_at,
        final.created_at,
        final.updated_at,
        final.description_plain_text,
        COALESCE(final.data->>'listing_type_id', NULL) AS listing_type_id,
        COALESCE(mm.listing_quality, NULL) AS listing_quality,
        COALESCE(mm.quality_level, NULL) AS quality_level,
        final.performance_data,
        COALESCE(mm.visits_total, 0) AS visits_total,
        COALESCE(mm.visits_last_30_days, 0) AS visits_last_30_days,
        COALESCE(mm.conversion_rate, 0.00) AS conversion_rate,
        COALESCE(mm.impressions, 0) AS impressions,
        mm.last_quality_update,
        mm.last_reviews_update,
        mm.last_visits_update,
        mm.last_updated AS metrics_last_updated,
        CASE
          WHEN LOWER(COALESCE(final.logistic_type,'')) IN ('xd_drop_off','cross_docking','self_service','drop_off','fulfillment','fbm','me2','turbo') THEN 'ME2'
          WHEN LOWER(COALESCE(final.logistic_type,'')) IN ('custom','not_specified') THEN 'ME1'
          ELSE NULL
        END AS shipping_mode,
        COALESCE(
          (SELECT SUM((loc->>'quantity')::int)
           FROM jsonb_array_elements(COALESCE(final.stock_distribution->'locations','[]'::jsonb)) loc
           WHERE LOWER(COALESCE(loc->>'shipping_type','')) IN ('xd_drop_off','cross_docking','envios','agencia','me2','custom','drop_off','correios','self_service','flex')), 0
        ) AS stock_standard_qty,
        COALESCE(
          (SELECT SUM((loc->>'quantity')::int)
           FROM jsonb_array_elements(COALESCE(final.stock_distribution->'locations','[]'::jsonb)) loc
           WHERE LOWER(COALESCE(loc->>'shipping_type','')) IN ('full','fulfillment','fbm')), 0
        ) AS stock_full_qty,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(final.shipping_raw_tags,'[]'::jsonb)) t
            WHERE LOWER(t) = 'self_service_in'
          ) THEN true
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(final.shipping_raw_tags,'[]'::jsonb)) t
            WHERE LOWER(t) = 'self_service_out'
          ) THEN false
          ELSE false
        END AS cap_flex,
        EXISTS(
          SELECT 1 FROM public.marketplace_integrations mi
          WHERE mi.organizations_id = final.organizations_id
            AND mi.marketplace_name = final.marketplace_name
            AND COALESCE(mi.xd_drop_off,false) = true
        ) AS cap_envios,
        EXISTS(
          SELECT 1 FROM public.marketplace_integrations mi
          WHERE mi.organizations_id = final.organizations_id
            AND mi.marketplace_name = final.marketplace_name
            AND COALESCE(mi.drop_off,false) = true
        ) AS cap_correios,
        CASE
          WHEN final.has_meli_facility OR LOWER(COALESCE(final.logistic_type,'')) IN ('fulfillment','fbm') THEN true
          ELSE false
        END AS cap_full,
        EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(final.shipping_raw_tags,'[]'::jsonb)) t
          WHERE LOWER(t) = 'mandatory_free_shipping'
        ) AS mandatory_free_shipping,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(final.shipping_raw_tags,'[]'::jsonb)) t
            WHERE LOWER(t) = 'mandatory_free_shipping'
          ) THEN true
          WHEN LOWER(COALESCE(final.data->'shipping'->>'free_shipping','')) = 'true' THEN true
          ELSE false
        END AS free_shipping,
        COALESCE(
          NULLIF(substring(COALESCE(final.data->'shipping'->>'dimensions','') FROM '^\s*(\d+(?:\.\d+)?)\s*x'), ''),
          NULL
        )::numeric AS package_length_cm,
        COALESCE(
          NULLIF(substring(COALESCE(final.data->'shipping'->>'dimensions','') FROM '^\s*\d+(?:\.\d+)?\s*x\s*(\d+(?:\.\d+)?)\s*x'), ''),
          NULL
        )::numeric AS package_height_cm,
        COALESCE(
          NULLIF(substring(COALESCE(final.data->'shipping'->>'dimensions','') FROM '^\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*(\d+(?:\.\d+)?)\s*,'), ''),
          NULL
        )::numeric AS package_width_cm,
        COALESCE(
          NULLIF(substring(COALESCE(final.data->'shipping'->>'dimensions','') FROM ',\s*(\d+(?:\.\d+)?)\s*$'), ''),
          NULL
        )::numeric AS package_weight_g,
        COALESCE(
          (ip.listing_prices->'prices'->0->'sale_fee'->>'amount')::numeric,
          (ip.listing_prices->'sale_fee'->>'amount')::numeric,
          (ip.listing_prices->>'sale_fee_amount')::numeric,
          (ip.listing_prices->'application_fee'->>'amount')::numeric,
          0
        ) AS total_fare,
        COALESCE(
          (ip.listing_prices->'prices'->0->'shipping_cost'->>'amount')::numeric,
          (ip.listing_prices->'shipping_cost'->>'amount')::numeric,
          (ip.listing_prices->'logistics'->>'shipping_cost')::numeric,
          0
        ) AS publication_shipping_cost,
        COALESCE(
          (ip.listing_prices->'prices'->0->>'currency_id'),
          ip.listing_prices->>'currency_id',
          ip.listing_prices->'sale_fee'->>'currency_id',
          'BRL'
        ) AS publication_currency,
        COALESCE(
          (ip.listing_prices->'prices'->0->'sale_fee_details'->>'percentage_fee')::numeric,
          (ip.listing_prices->'sale_fee_details'->>'percentage_fee')::numeric,
          (ip.listing_prices->'sale_fee'->'details'->>'percentage_fee')::numeric,
          (ip.listing_prices->'sale_fee_details'->>'percentage')::numeric,
          NULL
        ) AS percentage_fee,
        COALESCE(
          (ip.listing_prices->'prices'->0->'sale_fee_details'->>'fixed_fee')::numeric,
          (ip.listing_prices->'sale_fee_details'->>'fixed_fee')::numeric,
          (ip.listing_prices->'sale_fee'->'details'->'fixed_fee'->>'amount')::numeric,
          (ip.listing_prices->'sale_fee'->'details'->>'fixed_fee')::numeric,
          (ip.listing_prices->'sale_fee'->'details'->>'fixed_amount')::numeric,
          NULL
        ) AS fixed_fee,
        COALESCE(
          (ip.listing_prices->'prices'->0->'sale_fee_details'->>'gross_amount')::numeric,
          (ip.listing_prices->'sale_fee_details'->>'gross_amount')::numeric,
          (ip.listing_prices->'sale_fee'->'details'->>'gross_amount')::numeric,
          (ip.listing_prices->'prices'->0->'sale_fee'->>'amount')::numeric,
          (ip.listing_prices->'sale_fee'->>'amount')::numeric,
          NULL
        ) AS gross_amount
      FROM final
      LEFT JOIN public.marketplace_metrics mm
        ON mm.organizations_id = final.organizations_id
       AND mm.marketplace_name = final.marketplace_name
       AND mm.marketplace_item_id = final.marketplace_item_id
      LEFT JOIN public.marketplace_item_prices ip
        ON ip.organizations_id = final.organizations_id
       AND ip.marketplace_name = final.marketplace_name
       AND ip.marketplace_item_id = final.marketplace_item_id;
    $v$;
    EXECUTE 'GRANT SELECT ON public.marketplace_items_unified TO authenticated';
    EXECUTE 'REVOKE SELECT ON public.marketplace_items_unified FROM anon';
  ELSE
    RAISE NOTICE 'Skipping marketplace_items_unified recreation: marketplace_items_raw not found';
  END IF;
END $$;

COMMIT;
