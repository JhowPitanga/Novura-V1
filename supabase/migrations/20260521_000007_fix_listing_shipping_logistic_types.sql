-- Align marketplace_listing_shipping.logistic_types with logistic_type (primary).
-- ML: stop mapping self_service_available/out → flex; always include primary type.
-- Shopee BR: logistic_id 91003 = shopee_xpress (Entrega Padrão / SPX).

BEGIN;

-- Shopee: recompute from raw logistic_info / shipping_types
WITH shopee_log AS (
  SELECT
    ml.id AS listing_id,
    CASE
      WHEN COALESCE((elem->>'is_fulfillment_by_shopee')::boolean, false)
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%fulfillment%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%fbs%' THEN 'full'
      WHEN (elem->>'logistic_id')::bigint IN (91003, 91014, 91015)
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%xpress%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%express%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%spx%' THEN 'shopee_xpress'
      WHEN lower(COALESCE(elem->>'logistic_name', '')) LIKE '%same day%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%sameday%' THEN 'flex'
      WHEN (elem->>'logistic_id')::bigint IN (90024, 90022)
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%retire%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%retirada%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%pickup%' THEN 'retire'
      WHEN (elem->>'logistic_id')::bigint IN (70011, 70012)
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%padr%'
        OR lower(COALESCE(elem->>'logistic_name', '')) LIKE '%standard%' THEN 'correios'
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
)
UPDATE marketplace_listing_shipping s
SET
  logistic_type = a.logistic_type::logistic_type_canonical,
  logistic_types = a.logistic_types,
  last_synced_at = now()
FROM shopee_agg a
WHERE s.listing_id = a.listing_id;

-- Mercado Livre: primary from data.shipping.logistic_type + tags (self_service_in only → flex)
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
      SELECT COALESCE(array_agg(DISTINCT mapped ORDER BY mapped), ARRAY[]::logistic_type_canonical[])
      FROM (
        SELECT CASE lower(tag)
          WHEN 'fulfillment' THEN 'full'::logistic_type_canonical
          WHEN 'fbm' THEN 'full'::logistic_type_canonical
          WHEN 'self_service_in' THEN 'flex'::logistic_type_canonical
          WHEN 'flex' THEN 'flex'::logistic_type_canonical
          WHEN 'drop_off' THEN 'correios'::logistic_type_canonical
          WHEN 'cross_docking' THEN 'envios'::logistic_type_canonical
          WHEN 'xd_drop_off' THEN 'envios'::logistic_type_canonical
          WHEN 'me1' THEN 'custom'::logistic_type_canonical
          WHEN 'custom' THEN 'custom'::logistic_type_canonical
          ELSE NULL::logistic_type_canonical
        END AS mapped
        FROM jsonb_array_elements_text(ship_tags) tag
      ) t
      WHERE mapped IS NOT NULL
    ) AS logistic_types_from_tags,
    raw_lt,
    ship_tags
  FROM ml_src
),
ml_final AS (
  SELECT
    listing_id,
    logistic_type,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(ship_tags) t(tag)
        WHERE lower(t.tag) = 'self_service_out'
      ) AND raw_lt <> 'self_service'
        THEN (
          SELECT COALESCE(
            array_agg(DISTINCT x ORDER BY x),
            ARRAY[]::logistic_type_canonical[]
          )
          FROM unnest(
            array_remove(
              array_cat(ARRAY[logistic_type::logistic_type_canonical], logistic_types_from_tags),
              'flex'::logistic_type_canonical
            )
          ) x
        )
      ELSE (
        SELECT COALESCE(
          array_agg(DISTINCT x ORDER BY x),
          ARRAY[logistic_type::logistic_type_canonical]
        )
        FROM unnest(
          array_cat(ARRAY[logistic_type::logistic_type_canonical], logistic_types_from_tags)
        ) x
      )
    END AS logistic_types
  FROM ml_mapped
)
UPDATE marketplace_listing_shipping s
SET
  logistic_type = m.logistic_type::logistic_type_canonical,
  logistic_types = m.logistic_types,
  last_synced_at = now()
FROM ml_final m
WHERE s.listing_id = m.listing_id;

COMMIT;
