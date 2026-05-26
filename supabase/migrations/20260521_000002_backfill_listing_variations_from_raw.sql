-- Backfill marketplace_listing_variations from marketplace_items_raw.
-- Idempotent: only inserts when the listing has no variation rows yet.

BEGIN;

-- Mercado Livre
WITH ml_src AS (
  SELECT
    ml.id AS listing_id,
    ml.organizations_id,
    ml.marketplace_name,
    ml.marketplace_item_id,
    v,
    ord::int AS pos
  FROM marketplace_listings ml
  INNER JOIN marketplace_items_raw mir
    ON mir.organizations_id = ml.organizations_id
   AND mir.marketplace_name = ml.marketplace_name
   AND mir.marketplace_item_id = ml.marketplace_item_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(
      CASE WHEN jsonb_typeof(mir.variations) = 'array' THEN mir.variations END,
      CASE WHEN jsonb_typeof(mir.data->'variations') = 'array' THEN mir.data->'variations' END,
      '[]'::jsonb
    )
  ) WITH ORDINALITY AS t(v, ord)
  WHERE ml.marketplace_name = 'Mercado Livre'
    AND jsonb_array_length(
      COALESCE(
        CASE WHEN jsonb_typeof(mir.variations) = 'array' THEN mir.variations END,
        CASE WHEN jsonb_typeof(mir.data->'variations') = 'array' THEN mir.data->'variations' END,
        '[]'::jsonb
      )
    ) > 0
    AND NOT EXISTS (
      SELECT 1 FROM marketplace_listing_variations x WHERE x.listing_id = ml.id
    )
),
ml_rows AS (
  SELECT
    listing_id,
    organizations_id,
    marketplace_name,
    marketplace_item_id,
    COALESCE(NULLIF(v->>'id', ''), (pos - 1)::text) AS variation_id,
    NULLIF(COALESCE(v->>'seller_custom_field', v->>'sku', v->>'seller_sku'), '') AS sku,
    NULLIF(v->>'price', '')::numeric AS price,
    NULLIF(v->>'original_price', '')::numeric AS original_price,
    NULL::numeric AS promo_price,
    COALESCE(NULLIF(v->>'available_quantity', '')::int, 0) AS available_quantity,
    COALESCE(NULLIF(v->>'sold_quantity', '')::int, 0) AS sold_quantity,
    (
      SELECT COALESCE(p.secure_url, p.url)
      FROM marketplace_listing_pictures p
      WHERE p.listing_id = ml_src.listing_id
        AND p.external_picture_id = (v->'picture_ids'->>0)
      LIMIT 1
    ) AS image_url,
    COALESCE(v->'attribute_combinations', '[]'::jsonb)
      || CASE
        WHEN jsonb_array_length(COALESCE(v->'picture_ids', '[]'::jsonb)) > 0 THEN
          jsonb_build_array(
            jsonb_build_object(
              'id', '_picture_ids',
              'name', 'picture_ids',
              'value_id', null,
              'value_name', (v->'picture_ids')::text
            )
          )
        ELSE '[]'::jsonb
      END AS attributes,
    (pos = 1) AS primary_for_listing
  FROM ml_src
)
INSERT INTO marketplace_listing_variations (
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  variation_id,
  sku,
  price,
  original_price,
  promo_price,
  available_quantity,
  sold_quantity,
  image_url,
  attributes,
  primary_for_listing,
  last_synced_at
)
SELECT
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  variation_id,
  sku,
  price,
  original_price,
  promo_price,
  available_quantity,
  sold_quantity,
  image_url,
  attributes,
  primary_for_listing,
  now()
FROM ml_rows;

-- Shopee (model_list stored in variations column)
WITH shopee_src AS (
  SELECT
    ml.id AS listing_id,
    ml.organizations_id,
    ml.marketplace_name,
    ml.marketplace_item_id,
    v,
    ord::int AS pos
  FROM marketplace_listings ml
  INNER JOIN marketplace_items_raw mir
    ON mir.organizations_id = ml.organizations_id
   AND mir.marketplace_name = ml.marketplace_name
   AND mir.marketplace_item_id = ml.marketplace_item_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(
      CASE WHEN jsonb_typeof(mir.variations) = 'array' THEN mir.variations END,
      CASE WHEN jsonb_typeof(mir.data->'model_list') = 'array' THEN mir.data->'model_list' END,
      '[]'::jsonb
    )
  ) WITH ORDINALITY AS t(v, ord)
  WHERE ml.marketplace_name = 'Shopee'
    AND jsonb_array_length(
      COALESCE(
        CASE WHEN jsonb_typeof(mir.variations) = 'array' THEN mir.variations END,
        CASE WHEN jsonb_typeof(mir.data->'model_list') = 'array' THEN mir.data->'model_list' END,
        '[]'::jsonb
      )
    ) > 0
    AND NOT EXISTS (
      SELECT 1 FROM marketplace_listing_variations x WHERE x.listing_id = ml.id
    )
),
shopee_rows AS (
  SELECT
    listing_id,
    organizations_id,
    marketplace_name,
    marketplace_item_id,
    COALESCE(NULLIF(v->>'model_id', ''), (pos - 1)::text) AS variation_id,
    NULLIF(v->>'model_sku', '') AS sku,
    COALESCE(
      NULLIF(v->'price_info'->0->>'current_price', '')::numeric,
      NULLIF(v->>'price', '')::numeric
    ) AS price,
    NULLIF(v->'price_info'->0->>'original_price', '')::numeric AS original_price,
    NULL::numeric AS promo_price,
    COALESCE(
      NULLIF(v->'stock_info_v2'->'summary_info'->>'total_available_stock', '')::int,
      0
    ) AS available_quantity,
    0 AS sold_quantity,
    NULLIF(v->>'model_image_url', '') AS image_url,
    CASE
      WHEN NULLIF(v->>'model_name', '') IS NOT NULL THEN
        jsonb_build_array(
          jsonb_build_object(
            'id', 'variation',
            'name', 'Variação',
            'value_name', v->>'model_name'
          )
        )
      ELSE '[]'::jsonb
    END AS attributes,
    (pos = 1) AS primary_for_listing
  FROM shopee_src
)
INSERT INTO marketplace_listing_variations (
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  variation_id,
  sku,
  price,
  original_price,
  promo_price,
  available_quantity,
  sold_quantity,
  image_url,
  attributes,
  primary_for_listing,
  last_synced_at
)
SELECT
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  variation_id,
  sku,
  price,
  original_price,
  promo_price,
  available_quantity,
  sold_quantity,
  image_url,
  attributes,
  primary_for_listing,
  now()
FROM shopee_rows;

UPDATE marketplace_listings ml
SET has_variations = EXISTS (
  SELECT 1 FROM marketplace_listing_variations v WHERE v.listing_id = ml.id
)
WHERE EXISTS (
  SELECT 1 FROM marketplace_listing_variations v WHERE v.listing_id = ml.id
);

COMMIT;
