BEGIN;

DROP VIEW IF EXISTS public.marketplace_items_unified CASCADE;

CREATE VIEW public.marketplace_items_unified AS
WITH base AS (
  SELECT
    mi.*,
    COALESCE(
      mi.data->'shipping'->>'logistic_type',
      mi.data->'shipping'->'logistic'->>'type'
    ) AS logistic_type,
    COALESCE(mi.data->'shipping'->'tags', '[]'::jsonb) AS shipping_raw_tags,
    COALESCE(mi.shipping_types, ARRAY[]::text[]) AS shipping_types_array,
    COALESCE(
      ARRAY(
        SELECT LOWER(x)
        FROM jsonb_array_elements_text(COALESCE(mi.stock_distribution->'shipping_types', '[]'::jsonb)) x
      ),
      ARRAY[]::text[]
    ) AS stock_distribution_types_array,
    COALESCE(
      ARRAY(
        SELECT LOWER(COALESCE(loc->>'shipping_type',''))
        FROM jsonb_array_elements(COALESCE(mi.stock_distribution->'locations', '[]'::jsonb)) loc
        WHERE COALESCE(loc->>'shipping_type','') <> ''
      ),
      ARRAY[]::text[]
    ) AS stock_distribution_locations_types_array,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(mi.stock_distribution->'locations', '[]'::jsonb)) loc
      WHERE LOWER(COALESCE(loc->>'warehouse_id','')) = 'meli_facility'
    ) AS has_meli_facility
  FROM public.marketplace_items mi
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
          WHEN LOWER(COALESCE(base.logistic_type,'')) IN ('xd_drop_off','cross_docking','me2','custom') THEN 'envios'
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
        FROM unnest(base.shipping_types_array) st
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
    (mir.data->'prices'->'prices'->0->'sale_price'->>'amount')::numeric,
    (mir.data->'prices'->'sale_price'->>'amount')::numeric,
    (mir.data->>'price')::numeric,
    ip.sale_price_amount,
    final.price
  ) AS price,
  final.available_quantity,
  final.sold_quantity,
  final.category_id,
  final.permalink,
  final.attributes,
  final.variations,
  final.pictures,
  final.tags,
  final.seller_id,
  final.published_at,
  final.last_synced_at,
  final.created_at,
  final.updated_at,
  COALESCE(mir.data->>'description_plain_text', final.description_plain_text) AS description_plain_text,
  COALESCE(mir.data->>'description_html', final.description_html) AS description_html,
  COALESCE(NULLIF(mir.data->>'last_description_update','')::timestamptz, final.last_description_update) AS last_description_update,
  COALESCE(mir.data->>'listing_type_id', final.data->>'listing_type_id') AS listing_type_id,
  COALESCE(mm.listing_quality, NULL) AS listing_quality,
  COALESCE(mm.quality_level, NULL) AS quality_level,
  mm.performance_data,
  mm.visits_total,
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
 AND ip.marketplace_item_id = final.marketplace_item_id
LEFT JOIN public.marketplace_items_raw mir
  ON mir.organizations_id = final.organizations_id
 AND mir.marketplace_name = final.marketplace_name
 AND mir.marketplace_item_id = final.marketplace_item_id;

GRANT SELECT ON public.marketplace_items_unified TO authenticated;
REVOKE SELECT ON public.marketplace_items_unified FROM anon;

COMMIT;
