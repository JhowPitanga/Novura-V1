-- Enrich integration_warehouse_config with integration identity fields.
-- This allows distinguishing multiple integrations from the same marketplace
-- (e.g. multiple Mercado Livre accounts) by seller ID.

BEGIN;

ALTER TABLE public.integration_warehouse_config
  ADD COLUMN IF NOT EXISTS marketplace_name text,
  ADD COLUMN IF NOT EXISTS id_seller text;

-- Backfill marketplace_name + id_seller using marketplace_integrations data.
UPDATE public.integration_warehouse_config iwc
SET
  marketplace_name = mi.marketplace_name,
  id_seller = COALESCE(
    mi.meli_user_id::text,
    NULLIF(mi.config->>'shopee_shop_id', ''),
    NULLIF(mi.config->>'shop_id', ''),
    NULLIF(mi.config->>'seller_id', '')
  )
FROM public.marketplace_integrations mi
WHERE mi.id = iwc.integration_id
  AND (
    iwc.marketplace_name IS DISTINCT FROM mi.marketplace_name
    OR iwc.id_seller IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_iwc_org_marketplace_seller
  ON public.integration_warehouse_config (organization_id, marketplace_name, id_seller);

COMMIT;
