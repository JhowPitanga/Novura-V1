-- Link marketplace_listing_pictures.variation_id to marketplace_listing_variations.id (UUID FK).

BEGIN;

-- Mercado Livre: match listing-level pictures to variations via _picture_ids in attributes
WITH ml_var_pics AS (
  SELECT
    v.id AS var_uuid,
    v.listing_id,
    trim(both '"' from pic_id::text) AS external_picture_id
  FROM marketplace_listing_variations v
  CROSS JOIN LATERAL jsonb_array_elements(v.attributes) AS attr
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN attr->>'id' = '_picture_ids' THEN COALESCE((attr->>'value_name')::jsonb, '[]'::jsonb)
      ELSE '[]'::jsonb
    END
  ) AS pic_id
  WHERE v.marketplace_name = 'Mercado Livre'
    AND attr->>'id' = '_picture_ids'
)
UPDATE marketplace_listing_pictures p
SET variation_id = vp.var_uuid
FROM ml_var_pics vp
WHERE p.listing_id = vp.listing_id
  AND p.variation_id IS NULL
  AND p.external_picture_id = vp.external_picture_id;

-- Shopee + ML fallback: insert variation image rows when missing
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
  v.listing_id,
  v.id,
  v.organizations_id,
  v.marketplace_name,
  v.marketplace_item_id,
  v.variation_id,
  v.image_url,
  NULL,
  0,
  false,
  NULL
FROM marketplace_listing_variations v
WHERE v.image_url IS NOT NULL
  AND btrim(v.image_url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM marketplace_listing_pictures p
    WHERE p.variation_id = v.id
  );

COMMIT;
