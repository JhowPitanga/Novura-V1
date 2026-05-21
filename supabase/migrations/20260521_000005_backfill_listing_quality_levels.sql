-- Fix marketplace_listing_quality.quality_level using existing gauge rules:
-- ML: scoreToLevel (qualityMapping.ts) + Portuguese metrics labels
-- Shopee: numeric tiers 1|2|3 from performance_data

BEGIN;

-- Mercado Livre: derive level from quality_score
UPDATE marketplace_listing_quality q
SET quality_level = CASE
  WHEN q.quality_score >= 80 THEN 'excellent'::listing_quality_level_canonical
  WHEN q.quality_score >= 60 THEN 'good'::listing_quality_level_canonical
  WHEN q.quality_score >= 40 THEN 'medium'::listing_quality_level_canonical
  WHEN q.quality_score > 0 THEN 'low'::listing_quality_level_canonical
  ELSE 'incomplete'::listing_quality_level_canonical
END,
last_synced_at = now()
FROM marketplace_listings ml
WHERE ml.id = q.listing_id
  AND ml.marketplace_name = 'Mercado Livre'
  AND q.quality_score IS NOT NULL
  AND q.quality_level = 'unknown'::listing_quality_level_canonical;

-- Mercado Livre: best metrics row (Profissional / Satisfatória / Básica + score fallback)
WITH best_mm AS (
  SELECT DISTINCT ON (mm.organizations_id, mm.marketplace_item_id)
    mm.organizations_id,
    mm.marketplace_item_id,
    mm.listing_quality,
    mm.quality_level
  FROM marketplace_metrics mm
  WHERE mm.marketplace_name = 'Mercado Livre'
  ORDER BY mm.organizations_id, mm.marketplace_item_id, mm.listing_quality DESC NULLS LAST, mm.updated_at DESC NULLS LAST
)
UPDATE marketplace_listing_quality q
SET
  quality_score = COALESCE(q.quality_score, best_mm.listing_quality),
  quality_level = CASE
    WHEN lower(COALESCE(best_mm.quality_level, '')) LIKE '%prof%' THEN 'excellent'::listing_quality_level_canonical
    WHEN lower(COALESCE(best_mm.quality_level, '')) LIKE '%satisf%'
      OR lower(COALESCE(best_mm.quality_level, '')) LIKE '%standard%'
      OR lower(COALESCE(best_mm.quality_level, '')) LIKE '%estandar%' THEN 'good'::listing_quality_level_canonical
    WHEN lower(COALESCE(best_mm.quality_level, '')) LIKE '%bás%'
      OR lower(COALESCE(best_mm.quality_level, '')) LIKE '%basica%'
      OR lower(COALESCE(best_mm.quality_level, '')) LIKE '%basic%' THEN 'low'::listing_quality_level_canonical
    WHEN lower(best_mm.quality_level) = 'platinum' THEN 'excellent'::listing_quality_level_canonical
    WHEN lower(best_mm.quality_level) = 'gold' THEN 'good'::listing_quality_level_canonical
    WHEN lower(best_mm.quality_level) = 'silver' THEN 'medium'::listing_quality_level_canonical
    WHEN lower(best_mm.quality_level) = 'bronze' THEN 'low'::listing_quality_level_canonical
    WHEN lower(best_mm.quality_level) = 'incomplete' THEN 'incomplete'::listing_quality_level_canonical
    WHEN COALESCE(best_mm.listing_quality, q.quality_score) >= 80 THEN 'excellent'::listing_quality_level_canonical
    WHEN COALESCE(best_mm.listing_quality, q.quality_score) >= 60 THEN 'good'::listing_quality_level_canonical
    WHEN COALESCE(best_mm.listing_quality, q.quality_score) >= 40 THEN 'medium'::listing_quality_level_canonical
    WHEN COALESCE(best_mm.listing_quality, q.quality_score) > 0 THEN 'low'::listing_quality_level_canonical
    ELSE q.quality_level
  END,
  last_synced_at = now()
FROM marketplace_listings ml
JOIN best_mm
  ON best_mm.organizations_id = ml.organizations_id
 AND best_mm.marketplace_item_id = ml.marketplace_item_id
WHERE ml.id = q.listing_id
  AND ml.marketplace_name = 'Mercado Livre'
  AND q.quality_level = 'unknown'::listing_quality_level_canonical;

-- Shopee: numeric quality_level 1|2|3
UPDATE marketplace_listing_quality q
SET
  quality_level = CASE (mir.performance_data->>'quality_level')::int
    WHEN 3 THEN 'excellent'::listing_quality_level_canonical
    WHEN 2 THEN 'good'::listing_quality_level_canonical
    WHEN 1 THEN 'low'::listing_quality_level_canonical
    ELSE 'unknown'::listing_quality_level_canonical
  END,
  quality_score = CASE (mir.performance_data->>'quality_level')::int
    WHEN 3 THEN 100
    WHEN 2 THEN 76
    WHEN 1 THEN 50
    ELSE NULL
  END,
  last_synced_at = now()
FROM marketplace_listings ml
INNER JOIN marketplace_items_raw mir
  ON mir.organizations_id = ml.organizations_id
 AND mir.marketplace_name = ml.marketplace_name
 AND mir.marketplace_item_id = ml.marketplace_item_id
WHERE ml.id = q.listing_id
  AND ml.marketplace_name = 'Shopee'
  AND mir.performance_data->>'quality_level' ~ '^[123]$';

COMMIT;
