-- Backfill marketplace_listing_shipping from marketplace_items_raw (logistic + mandatory_free_shipping).

BEGIN;

-- Shopee: map logistic_info / shipping_types (same rules as mapShopeeLogistics)
WITH shopee_log AS (
  SELECT
    ml.id AS listing_id,
    CASE
      WHEN COALESCE((elem->>'is_fulfillment_by_shopee')::boolean, false)
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%fulfillment%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%fbs%' THEN 'full'
      WHEN lower(COALESCE(elem->>'logistic_name', '')) LIKE '%xpress%' THEN 'shopee_xpress'
      WHEN lower(COALESCE(elem->>'logistic_name', '')) LIKE '%same day%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%sameday%' THEN 'flex'
      WHEN lower(COALESCE(elem->>'logistic_name', '')) LIKE '%retire%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%retirada%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%pickup%' THEN 'retire'
      ELSE 'correios'
    END AS lt
  FROM marketplace_listings ml
  INNER JOIN marketplace_items_raw mir
    ON mir.organizations_id = ml.organizations_id
   AND mir.marketplace_name = ml.marketplace_name
   AND mir.marketplace_item_id = ml.marketplace_item_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(mir.shipping_types, mir.data->'base_info'->'logistic_info', '[]'::jsonb)
  ) elem
  WHERE ml.marketplace_name = 'Shopee'
    AND lower(COALESCE(elem->>'enabled', 'true')) NOT IN ('false', '0')
),
shopee_agg AS (
  SELECT
    listing_id,
    CASE
      WHEN bool_or(lt = 'full') THEN 'full'
      WHEN bool_or(lt = 'shopee_xpress') THEN 'shopee_xpress'
      WHEN bool_or(lt = 'flex') THEN 'flex'
      WHEN bool_or(lt = 'correios') THEN 'correios'
      WHEN bool_or(lt = 'retire') THEN 'retire'
      ELSE 'unknown'
    END AS logistic_type,
    COALESCE(
      array_agg(DISTINCT lt::logistic_type_canonical) FILTER (WHERE lt IS NOT NULL),
      ARRAY[]::logistic_type_canonical[]
    ) AS logistic_types
  FROM shopee_log
  GROUP BY listing_id
),
shopee_flags AS (
  SELECT
    ml.id AS listing_id,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        COALESCE(mir.shipping_types, mir.data->'base_info'->'logistic_info', '[]'::jsonb)
      ) e
      WHERE COALESCE((e->>'is_free')::boolean, false)
    ) AS free_shipping,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        COALESCE(mir.shipping_types, mir.data->'base_info'->'logistic_info', '[]'::jsonb)
      ) e
      WHERE lower(COALESCE(e->>'logistic_name', '')) LIKE '%retire%'
         OR lower(COALESCE(e->>'logistic_name', '')) LIKE '%retirada%'
    ) AS local_pick_up,
    NULLIF((mir.data->'base_info'->'dimension'->>'package_length')::numeric, 0) AS package_length_cm,
    NULLIF((mir.data->'base_info'->'dimension'->>'package_width')::numeric, 0) AS package_width_cm,
    NULLIF((mir.data->'base_info'->'dimension'->>'package_height')::numeric, 0) AS package_height_cm,
    NULLIF((mir.data->'base_info'->>'weight')::numeric, 0) AS package_weight_g
  FROM marketplace_listings ml
  INNER JOIN marketplace_items_raw mir
    ON mir.organizations_id = ml.organizations_id
   AND mir.marketplace_name = ml.marketplace_name
   AND mir.marketplace_item_id = ml.marketplace_item_id
  WHERE ml.marketplace_name = 'Shopee'
)
UPDATE marketplace_listing_shipping s
SET
  logistic_type = a.logistic_type::logistic_type_canonical,
  logistic_types = CASE
    WHEN cardinality(a.logistic_types) > 0 THEN a.logistic_types
    ELSE ARRAY[a.logistic_type::logistic_type_canonical]
  END,
  shipping_mode = 'shopee_logistics',
  free_shipping = COALESCE(f.free_shipping, false),
  local_pick_up = COALESCE(f.local_pick_up, false),
  package_length_cm = COALESCE(f.package_length_cm, s.package_length_cm),
  package_width_cm = COALESCE(f.package_width_cm, s.package_width_cm),
  package_height_cm = COALESCE(f.package_height_cm, s.package_height_cm),
  package_weight_g = COALESCE(f.package_weight_g, s.package_weight_g),
  last_synced_at = now()
FROM shopee_agg a
JOIN shopee_flags f ON f.listing_id = a.listing_id
WHERE s.listing_id = a.listing_id;

-- Mercado Livre: logistic_type, logistic_types from tags, mandatory_free_shipping from raw
WITH ml_src AS (
  SELECT
    ml.id AS listing_id,
    lower(COALESCE(mir.data->'shipping'->>'logistic_type', '')) AS raw_lt,
    COALESCE(mir.data->'shipping'->'tags', '[]'::jsonb) AS ship_tags
  FROM marketplace_listings ml
  INNER JOIN marketplace_items_raw mir
    ON mir.organizations_id = ml.organizations_id
   AND mir.marketplace_name = ml.marketplace_name
   AND mir.marketplace_item_id = ml.marketplace_item_id
  WHERE ml.marketplace_name = 'Mercado Livre'
),
ml_mapped AS (
  SELECT
    listing_id,
    CASE raw_lt
      WHEN 'fulfillment' THEN 'full'
      WHEN 'fbm' THEN 'full'
      WHEN 'self_service' THEN 'flex'
      WHEN 'drop_off' THEN 'correios'
      WHEN 'xd_drop_off' THEN 'envios'
      WHEN 'cross_docking' THEN 'envios'
      WHEN 'me1' THEN 'custom'
      WHEN 'custom' THEN 'custom'
      WHEN 'not_specified' THEN 'custom'
      ELSE 'unknown'
    END AS logistic_type,
    (
      SELECT COALESCE(
        array_agg(DISTINCT mapped ORDER BY mapped),
        ARRAY[]::logistic_type_canonical[]
      )
      FROM (
        SELECT CASE
          WHEN lower(tag) LIKE '%fulfillment%' OR lower(tag) LIKE '%fbm%' THEN 'full'::logistic_type_canonical
          WHEN lower(tag) LIKE '%self_service%' OR lower(tag) LIKE '%flex%' THEN 'flex'::logistic_type_canonical
          WHEN lower(tag) LIKE '%drop_off%' THEN 'correios'::logistic_type_canonical
          WHEN lower(tag) LIKE '%cross_docking%' OR lower(tag) LIKE '%xd_drop%' THEN 'envios'::logistic_type_canonical
          WHEN lower(tag) LIKE '%me1%' THEN 'custom'::logistic_type_canonical
          ELSE NULL::logistic_type_canonical
        END AS mapped
        FROM jsonb_array_elements_text(ship_tags) tag
      ) t
      WHERE mapped IS NOT NULL
    ) AS logistic_types_from_tags,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(ship_tags) t(tag)
      WHERE t.tag = 'mandatory_free_shipping'
    ) AS mandatory_free_shipping
  FROM ml_src
)
UPDATE marketplace_listing_shipping s
SET
  logistic_type = m.logistic_type::logistic_type_canonical,
  logistic_types = CASE
    WHEN cardinality(m.logistic_types_from_tags) > 0 THEN m.logistic_types_from_tags
    WHEN m.logistic_type <> 'unknown' THEN ARRAY[m.logistic_type::logistic_type_canonical]
    ELSE s.logistic_types
  END,
  mandatory_free_shipping = m.mandatory_free_shipping,
  free_shipping = COALESCE(
    (mir.data->'shipping'->>'free_shipping')::boolean,
    s.free_shipping
  ),
  local_pick_up = COALESCE(
    (mir.data->'shipping'->>'local_pick_up')::boolean,
    s.local_pick_up
  ),
  shipping_mode = COALESCE(mir.data->'shipping'->>'shipping_mode', s.shipping_mode),
  last_synced_at = now()
FROM ml_mapped m
JOIN marketplace_listings ml ON ml.id = m.listing_id
JOIN marketplace_items_raw mir
  ON mir.organizations_id = ml.organizations_id
 AND mir.marketplace_name = ml.marketplace_name
 AND mir.marketplace_item_id = ml.marketplace_item_id
WHERE s.listing_id = m.listing_id;

COMMIT;
