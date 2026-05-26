-- Cycle 0: Add UNIQUE (organizations_id, marketplace_name) to marketplace_integrations
-- so that callback UPSERT and reconnecting the same marketplace updates the row.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_marketplace_integrations_org_marketplace'
      AND conrelid = 'public.marketplace_integrations'::regclass
  ) THEN
    ALTER TABLE public.marketplace_integrations
      ADD CONSTRAINT uq_marketplace_integrations_org_marketplace
      UNIQUE (organizations_id, marketplace_name);
  END IF;
END $$;
