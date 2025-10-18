-- Backfill organizations_id in marketplace_integrations using companies.organization_id
-- This fixes sync functions that filter by organizations_id and fail to find integrations

BEGIN;

-- Ensure index exists for organizations_id (harmless if already created)
CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_organizations_id
  ON public.marketplace_integrations(organizations_id);

-- Backfill organizations_id where missing, using the linked company
UPDATE public.marketplace_integrations mi
SET organizations_id = c.organization_id
FROM public.companies c
WHERE mi.company_id = c.id
  AND mi.organizations_id IS NULL;

-- Optional: sanity check comment
COMMENT ON COLUMN public.marketplace_integrations.organizations_id IS 'FK to public.organizations; backfilled from companies.organization_id when missing.';

COMMIT;