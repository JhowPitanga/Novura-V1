-- Backfill marketplace_listing_pictures and thumbnail_url from marketplace_items_raw.
-- Idempotent: only fills listings that have no pictures yet.

BEGIN;

-- Mercado Livre: pictures column or data.pictures on marketplace_items_raw
WITH ml_sources AS (
  SELECT
    ml.id AS listing_id,
    ml.organizations_id,
    ml.marketplace_name,
    ml.marketplace_item_id,
    COALESCE(
      CASE WHEN jsonb_typeof(mir.pictures) = 'array' THEN mir.pictures END,
      CASE WHEN jsonb_typeof(mir.data->'pictures') = 'array' THEN mir.data->'pictures' END,
      '[]'::jsonb
    ) AS pics
  FROM marketplace_listings ml
  INNER JOIN marketplace_items_raw mir
    ON mir.organizations_id = ml.organizations_id
   AND mir.marketplace_name = ml.marketplace_name
   AND mir.marketplace_item_id = ml.marketplace_item_id
  WHERE ml.marketplace_name = 'Mercado Livre'
    AND NOT EXISTS (
      SELECT 1 FROM marketplace_listing_pictures p WHERE p.listing_id = ml.id
    )
),
ml_expanded AS (
  SELECT
    s.listing_id,
    s.organizations_id,
    s.marketplace_name,
    s.marketplace_item_id,
    elem AS pic,
    ord::int AS pos
  FROM ml_sources s
  CROSS JOIN LATERAL jsonb_array_elements(s.pics) WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_array_length(s.pics) > 0
),
ml_rows AS (
  SELECT
    listing_id,
    organizations_id,
    marketplace_name,
    marketplace_item_id,
    CASE
      WHEN jsonb_typeof(pic) = 'string' THEN NULL
      ELSE NULLIF(pic->>'id', '')
    END AS external_picture_id,
    CASE
      WHEN jsonb_typeof(pic) = 'string' THEN pic #>> '{}'
      ELSE COALESCE(NULLIF(pic->>'url', ''), NULLIF(pic->>'secure_url', ''))
    END AS url,
    CASE
      WHEN jsonb_typeof(pic) = 'string' THEN pic #>> '{}'
      ELSE NULLIF(pic->>'secure_url', '')
    END AS secure_url,
    (pos - 1) AS position
  FROM ml_expanded
)
INSERT INTO marketplace_listing_pictures (
  listing_id,
  variation_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  external_picture_id,
  url,
  secure_url,
  position,
  is_video,
  video_url
)
SELECT
  listing_id,
  NULL,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  external_picture_id,
  url,
  secure_url,
  position,
  false,
  NULL
FROM ml_rows
WHERE url IS NOT NULL AND url <> '';

-- Shopee: row.pictures (string[]) or data.base_info.image.image_url_list
WITH shopee_sources AS (
  SELECT
    ml.id AS listing_id,
    ml.organizations_id,
    ml.marketplace_name,
    ml.marketplace_item_id,
    COALESCE(
      CASE WHEN jsonb_typeof(mir.pictures) = 'array' THEN mir.pictures END,
      CASE WHEN jsonb_typeof(mir.data->'base_info'->'image'->'image_url_list') = 'array'
        THEN mir.data->'base_info'->'image'->'image_url_list' END,
      CASE WHEN jsonb_typeof(mir.data->'image_url_list') = 'array'
        THEN mir.data->'image_url_list' END,
      '[]'::jsonb
    ) AS pics
  FROM marketplace_listings ml
  INNER JOIN marketplace_items_raw mir
    ON mir.organizations_id = ml.organizations_id
   AND mir.marketplace_name = ml.marketplace_name
   AND mir.marketplace_item_id = ml.marketplace_item_id
  WHERE ml.marketplace_name = 'Shopee'
    AND NOT EXISTS (
      SELECT 1 FROM marketplace_listing_pictures p WHERE p.listing_id = ml.id
    )
),
shopee_expanded AS (
  SELECT
    s.listing_id,
    s.organizations_id,
    s.marketplace_name,
    s.marketplace_item_id,
    elem AS pic,
    ord::int AS pos
  FROM shopee_sources s
  CROSS JOIN LATERAL jsonb_array_elements(s.pics) WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_array_length(s.pics) > 0
),
shopee_rows AS (
  SELECT
    listing_id,
    organizations_id,
    marketplace_name,
    marketplace_item_id,
    NULL AS external_picture_id,
    CASE
      WHEN jsonb_typeof(pic) = 'string' THEN pic #>> '{}'
      ELSE COALESCE(NULLIF(pic->>'url', ''), NULLIF(pic->>'secure_url', ''))
    END AS url,
    NULL::text AS secure_url,
    (pos - 1) AS position
  FROM shopee_expanded
)
INSERT INTO marketplace_listing_pictures (
  listing_id,
  variation_id,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  external_picture_id,
  url,
  secure_url,
  position,
  is_video,
  video_url
)
SELECT
  listing_id,
  NULL,
  organizations_id,
  marketplace_name,
  marketplace_item_id,
  external_picture_id,
  url,
  secure_url,
  position,
  false,
  NULL
FROM shopee_rows
WHERE url IS NOT NULL AND url <> '';

-- Refresh thumbnail_url on listings that still lack it
UPDATE marketplace_listings ml
SET thumbnail_url = (
  SELECT COALESCE(p.secure_url, p.url)
  FROM marketplace_listing_pictures p
  WHERE p.listing_id = ml.id
  ORDER BY p.position ASC NULLS LAST
  LIMIT 1
)
WHERE (ml.thumbnail_url IS NULL OR btrim(ml.thumbnail_url) = '')
  AND EXISTS (
    SELECT 1 FROM marketplace_listing_pictures p WHERE p.listing_id = ml.id
  );

COMMIT;
