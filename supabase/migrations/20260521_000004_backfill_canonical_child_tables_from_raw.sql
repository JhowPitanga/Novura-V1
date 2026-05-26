-- Backfill empty canonical child tables from marketplace_items_raw (+ ML metrics/prices).

BEGIN;

-- 1) marketplace_listings_raw — versioned payload store
INSERT INTO marketplace_listings_raw (
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  integration_id,
  payload,
  payload_version,
  payload_source,
  fetched_at
)
SELECT
  mir.organizations_id,
  mir.marketplace_name,
  mir.marketplace_item_id,
  mir.integration_id,
  COALESCE(mir.data, '{}'::jsonb),
  1,
  'backfill-sql',
  COALESCE(mir.updated_at, now())
FROM marketplace_items_raw mir
INNER JOIN marketplace_listings ml
  ON ml.organizations_id = mir.organizations_id
 AND ml.marketplace_name = mir.marketplace_name
 AND ml.marketplace_item_id = mir.marketplace_item_id
ON CONFLICT (organizations_id, marketplace_name, marketplace_item_id, payload_version)
DO UPDATE SET
  payload = EXCLUDED.payload,
  integration_id = EXCLUDED.integration_id,
  payload_source = EXCLUDED.payload_source,
  fetched_at = EXCLUDED.fetched_at;

-- 2) marketplace_listing_attributes
INSERT INTO marketplace_listing_attributes (
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  attribute_id,
  attribute_name,
  value_id,
  value_name,
  value_struct,
  is_required,
  is_variation_attr
)
SELECT DISTINCT ON (ml.id, COALESCE(attr->>'id', attr->>'attribute_id', ''))
  ml.id,
  mir.organizations_id,
  mir.marketplace_name,
  mir.marketplace_item_id,
  COALESCE(attr->>'id', attr->>'attribute_id', ''),
  COALESCE(attr->>'name', attr->>'attribute_name'),
  attr->>'value_id',
  COALESCE(attr->>'value_name', attr->'attribute_value_list'->0->>'original_value'),
  attr->'value_struct',
  COALESCE((attr->'tags'->>'required')::boolean, (attr->>'is_mandatory')::boolean, false),
  COALESCE((attr->'tags'->>'variation_attribute')::boolean, false)
FROM marketplace_listings ml
INNER JOIN marketplace_items_raw mir
  ON mir.organizations_id = ml.organizations_id
 AND mir.marketplace_name = ml.marketplace_name
 AND mir.marketplace_item_id = ml.marketplace_item_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN mir.marketplace_name = 'Shopee' THEN
      COALESCE(
        CASE WHEN jsonb_typeof(mir.attributes) = 'array' THEN mir.attributes END,
        CASE WHEN jsonb_typeof(mir.data->'base_info'->'attribute_list') = 'array'
          THEN mir.data->'base_info'->'attribute_list' END,
        '[]'::jsonb
      )
    ELSE
      COALESCE(
        CASE WHEN jsonb_typeof(mir.attributes) = 'array' THEN mir.attributes END,
        CASE WHEN jsonb_typeof(mir.data->'attributes') = 'array' THEN mir.data->'attributes' END,
        '[]'::jsonb
      )
  END
) AS attr
WHERE COALESCE(attr->>'id', attr->>'attribute_id', '') <> ''
  AND COALESCE(attr->>'id', attr->>'attribute_id', '') <> '_picture_ids'
ORDER BY ml.id, COALESCE(attr->>'id', attr->>'attribute_id', '')
ON CONFLICT (listing_id, attribute_id) DO UPDATE SET
  attribute_name = EXCLUDED.attribute_name,
  value_id = EXCLUDED.value_id,
  value_name = EXCLUDED.value_name,
  value_struct = EXCLUDED.value_struct,
  is_required = EXCLUDED.is_required,
  is_variation_attr = EXCLUDED.is_variation_attr;

-- 3) marketplace_listing_shipping
INSERT INTO marketplace_listing_shipping (
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  logistic_type,
  logistic_types,
  shipping_mode,
  free_shipping,
  mandatory_free_shipping,
  local_pick_up,
  package_length_cm,
  package_width_cm,
  package_height_cm,
  package_weight_g,
  last_synced_at
)
SELECT DISTINCT ON (ml.id)
  ml.id,
  mir.organizations_id,
  mir.marketplace_name,
  mir.marketplace_item_id,
  CASE
    WHEN mir.marketplace_name = 'Mercado Livre' THEN
      CASE lower(COALESCE(mir.data->'shipping'->>'logistic_type', ''))
        WHEN 'fulfillment', 'fbm' THEN 'full'::logistic_type_canonical
        WHEN 'self_service' THEN 'flex'::logistic_type_canonical
        WHEN 'drop_off' THEN 'correios'::logistic_type_canonical
        WHEN 'xd_drop_off', 'cross_docking' THEN 'envios'::logistic_type_canonical
        ELSE 'unknown'::logistic_type_canonical
      END
    ELSE 'unknown'::logistic_type_canonical
  END,
  ARRAY[]::logistic_type_canonical[],
  CASE
    WHEN mir.marketplace_name = 'Mercado Livre' THEN mir.data->'shipping'->>'shipping_mode'
    ELSE 'shopee_logistics'
  END,
  COALESCE((mir.data->'shipping'->>'free_shipping')::boolean, false),
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(mir.data->'shipping'->'tags', '[]'::jsonb)) t(tag)
    WHERE t.tag = 'mandatory_free_shipping'
  ),
  COALESCE((mir.data->'shipping'->>'local_pick_up')::boolean, false),
  NULL,
  NULL,
  NULL,
  NULL,
  now()
FROM marketplace_listings ml
INNER JOIN marketplace_items_raw mir
  ON mir.organizations_id = ml.organizations_id
 AND mir.marketplace_name = ml.marketplace_name
 AND mir.marketplace_item_id = ml.marketplace_item_id
ORDER BY ml.id
ON CONFLICT (listing_id) DO UPDATE SET
  logistic_type = EXCLUDED.logistic_type,
  shipping_mode = EXCLUDED.shipping_mode,
  free_shipping = EXCLUDED.free_shipping,
  mandatory_free_shipping = EXCLUDED.mandatory_free_shipping,
  local_pick_up = EXCLUDED.local_pick_up,
  last_synced_at = EXCLUDED.last_synced_at;

-- 4) marketplace_listing_quality
INSERT INTO marketplace_listing_quality (
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  quality_score,
  quality_level,
  missing_attributes,
  unfinished_tasks,
  last_synced_at
)
SELECT DISTINCT ON (ml.id)
  ml.id,
  ml.organizations_id,
  ml.marketplace_name,
  ml.marketplace_item_id,
  CASE
    WHEN ml.marketplace_name = 'Mercado Livre' THEN mm.listing_quality::numeric
    WHEN mir.performance_data->>'quality_level' = '3' THEN 100
    WHEN mir.performance_data->>'quality_level' = '2' THEN 76
    WHEN mir.performance_data->>'quality_level' = '1' THEN 50
    ELSE NULL
  END,
  CASE
    WHEN ml.marketplace_name = 'Mercado Livre' THEN
      CASE
        WHEN lower(COALESCE(mm.quality_level, '')) LIKE '%prof%' THEN 'excellent'::listing_quality_level_canonical
        WHEN lower(COALESCE(mm.quality_level, '')) LIKE '%satisf%'
          OR lower(COALESCE(mm.quality_level, '')) LIKE '%standard%' THEN 'good'::listing_quality_level_canonical
        WHEN lower(COALESCE(mm.quality_level, '')) LIKE '%bás%'
          OR lower(COALESCE(mm.quality_level, '')) LIKE '%basica%'
          OR lower(COALESCE(mm.quality_level, '')) LIKE '%basic%' THEN 'low'::listing_quality_level_canonical
        WHEN lower(COALESCE(mm.quality_level, '')) = 'platinum' THEN 'excellent'::listing_quality_level_canonical
        WHEN lower(COALESCE(mm.quality_level, '')) = 'gold' THEN 'good'::listing_quality_level_canonical
        WHEN lower(COALESCE(mm.quality_level, '')) = 'silver' THEN 'medium'::listing_quality_level_canonical
        WHEN lower(COALESCE(mm.quality_level, '')) = 'bronze' THEN 'low'::listing_quality_level_canonical
        WHEN lower(COALESCE(mm.quality_level, '')) = 'incomplete' THEN 'incomplete'::listing_quality_level_canonical
        WHEN mm.listing_quality >= 80 THEN 'excellent'::listing_quality_level_canonical
        WHEN mm.listing_quality >= 60 THEN 'good'::listing_quality_level_canonical
        WHEN mm.listing_quality >= 40 THEN 'medium'::listing_quality_level_canonical
        WHEN mm.listing_quality > 0 THEN 'low'::listing_quality_level_canonical
        ELSE 'unknown'::listing_quality_level_canonical
      END
    WHEN mir.performance_data->>'quality_level' = '3' THEN 'excellent'::listing_quality_level_canonical
    WHEN mir.performance_data->>'quality_level' = '2' THEN 'good'::listing_quality_level_canonical
    WHEN mir.performance_data->>'quality_level' = '1' THEN 'low'::listing_quality_level_canonical
    ELSE
      CASE upper(COALESCE(
        mir.performance_data->>'quality_level',
        mir.performance_data->'content_diagnosis_result'->>'quality_level',
        ''
      ))
        WHEN 'EXCELLENT' THEN 'excellent'::listing_quality_level_canonical
        WHEN 'GOOD' THEN 'good'::listing_quality_level_canonical
        WHEN 'MEDIUM' THEN 'medium'::listing_quality_level_canonical
        WHEN 'LOW', 'POOR' THEN 'low'::listing_quality_level_canonical
        WHEN 'INCOMPLETE' THEN 'incomplete'::listing_quality_level_canonical
        ELSE 'unknown'::listing_quality_level_canonical
      END
  END,
  CASE
    WHEN ml.marketplace_name = 'Shopee' AND jsonb_typeof(mir.performance_data->'missing_mandatory') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(mir.performance_data->'missing_mandatory'))
    ELSE ARRAY[]::text[]
  END,
  CASE
    WHEN ml.marketplace_name = 'Shopee'
      THEN COALESCE(mir.performance_data->'unfinished_task', mir.performance_data, '[]'::jsonb)
    ELSE '[]'::jsonb
  END,
  now()
FROM marketplace_listings ml
INNER JOIN marketplace_items_raw mir
  ON mir.organizations_id = ml.organizations_id
 AND mir.marketplace_name = ml.marketplace_name
 AND mir.marketplace_item_id = ml.marketplace_item_id
LEFT JOIN marketplace_metrics mm
  ON mm.organizations_id = ml.organizations_id
 AND mm.marketplace_name = 'Mercado Livre'
 AND mm.marketplace_item_id = ml.marketplace_item_id
ORDER BY ml.id, mm.updated_at DESC NULLS LAST
ON CONFLICT (listing_id) DO UPDATE SET
  quality_score = EXCLUDED.quality_score,
  quality_level = EXCLUDED.quality_level,
  missing_attributes = EXCLUDED.missing_attributes,
  unfinished_tasks = EXCLUDED.unfinished_tasks,
  last_synced_at = EXCLUDED.last_synced_at;

-- 5) marketplace_listing_fees
INSERT INTO marketplace_listing_fees (
  listing_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  currency,
  commission_amount,
  commission_percentage,
  commission_fixed_fee,
  listing_fee_amount,
  shipping_subsidy,
  total_fees_estimated,
  source_payload_version,
  last_synced_at
)
SELECT DISTINCT ON (ml.id)
  ml.id,
  ml.organizations_id,
  ml.marketplace_name,
  ml.marketplace_item_id,
  'BRL',
  CASE
    WHEN ml.marketplace_name = 'Mercado Livre' THEN (mip.listing_prices->>'sale_fee_amount')::numeric
    ELSE round((COALESCE(ml.price, mir.price, 0) * COALESCE(fr.commission_percentage, 14) / 100)::numeric, 2)
  END,
  CASE
    WHEN ml.marketplace_name = 'Mercado Livre' THEN (mip.listing_prices->'sale_fee_details'->>'percentage_fee')::numeric
    ELSE COALESCE(fr.commission_percentage, 14)
  END,
  CASE
    WHEN ml.marketplace_name = 'Mercado Livre' THEN (mip.listing_prices->'sale_fee_details'->>'fixed_fee')::numeric
    ELSE COALESCE(fr.commission_fixed_fee, 0)
  END,
  CASE
    WHEN ml.marketplace_name = 'Mercado Livre' THEN (mip.listing_prices->>'listing_fee_amount')::numeric
    ELSE 0
  END,
  0,
  CASE
    WHEN ml.marketplace_name = 'Mercado Livre' THEN
      COALESCE((mip.listing_prices->>'sale_fee_amount')::numeric, 0)
      + COALESCE((mip.listing_prices->>'listing_fee_amount')::numeric, 0)
    ELSE round((COALESCE(ml.price, mir.price, 0) * COALESCE(fr.commission_percentage, 14) / 100)::numeric, 2)
  END,
  1,
  now()
FROM marketplace_listings ml
INNER JOIN marketplace_items_raw mir
  ON mir.organizations_id = ml.organizations_id
 AND mir.marketplace_name = ml.marketplace_name
 AND mir.marketplace_item_id = ml.marketplace_item_id
LEFT JOIN marketplace_item_prices mip
  ON mip.organizations_id = ml.organizations_id
 AND mip.marketplace_name = 'Mercado Livre'
 AND mip.marketplace_item_id = ml.marketplace_item_id
LEFT JOIN marketplace_provider_fee_rules fr
  ON fr.marketplace_name = 'Shopee'
 AND fr.category_id = COALESCE(mir.category_id, '_default')
 AND fr.site_id = 'BR'
ORDER BY ml.id, fr.category_id DESC
ON CONFLICT (listing_id) DO UPDATE SET
  commission_amount = EXCLUDED.commission_amount,
  commission_percentage = EXCLUDED.commission_percentage,
  commission_fixed_fee = EXCLUDED.commission_fixed_fee,
  listing_fee_amount = EXCLUDED.listing_fee_amount,
  shipping_subsidy = EXCLUDED.shipping_subsidy,
  total_fees_estimated = EXCLUDED.total_fees_estimated,
  last_synced_at = EXCLUDED.last_synced_at;

COMMIT;
