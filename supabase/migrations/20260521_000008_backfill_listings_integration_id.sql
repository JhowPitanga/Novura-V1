-- Backfill marketplace_listings.integration_id from marketplace_items_raw.

BEGIN;

UPDATE marketplace_listings ml
SET
  integration_id = mir.integration_id,
  last_synced_at = COALESCE(ml.last_synced_at, now())
FROM marketplace_items_raw mir
WHERE mir.organizations_id = ml.organizations_id
  AND mir.marketplace_name = ml.marketplace_name
  AND mir.marketplace_item_id = ml.marketplace_item_id
  AND mir.integration_id IS NOT NULL
  AND (
    ml.integration_id IS NULL
    OR ml.integration_id IS DISTINCT FROM mir.integration_id
  );

-- Fallback: single active integration per org + marketplace
UPDATE marketplace_listings ml
SET integration_id = sub.integration_id
FROM (
  SELECT DISTINCT ON (mi.organizations_id, mi.marketplace_name)
    mi.organizations_id,
    mi.marketplace_name,
    mi.id AS integration_id
  FROM marketplace_integrations mi
  WHERE mi.organizations_id IS NOT NULL
  ORDER BY mi.organizations_id, mi.marketplace_name, mi.updated_at DESC NULLS LAST
) sub
WHERE ml.integration_id IS NULL
  AND ml.organizations_id = sub.organizations_id
  AND ml.marketplace_name = sub.marketplace_name;

COMMIT;
