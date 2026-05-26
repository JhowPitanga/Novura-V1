-- Extend marketplace_integrations with universal adapter columns.
-- Adds: provider_id, external_account_id, setup_status, deactivated_at,
-- store_name, connected_at, connected_by_user_id, status, last_refresh_at,
-- last_refresh_error, token_key_version.
-- Partial UNIQUE index prevents duplicate active accounts per provider globally.

BEGIN;

-- New columns
ALTER TABLE public.marketplace_integrations
  ADD COLUMN IF NOT EXISTS provider_id uuid
    REFERENCES public.marketplace_providers(id),
  ADD COLUMN IF NOT EXISTS external_account_id text,
  ADD COLUMN IF NOT EXISTS setup_status text NOT NULL DEFAULT 'pending'
    CHECK (setup_status IN ('pending', 'completed')),
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS connected_by_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  ADD COLUMN IF NOT EXISTS last_refresh_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_refresh_error text,
  ADD COLUMN IF NOT EXISTS token_key_version smallint NOT NULL DEFAULT 1;

-- Backfill provider_id by matching marketplace_name → provider key
UPDATE public.marketplace_integrations mi
SET provider_id = mp.id
FROM public.marketplace_providers mp
WHERE mp.key = 'mercado_livre'
  AND regexp_replace(lower(COALESCE(mi.marketplace_name, '')), '[\s_\-]+', '', 'g') IN
      ('mercadolivre', 'meli', 'mercadol')
  AND mi.provider_id IS NULL;

UPDATE public.marketplace_integrations mi
SET provider_id = mp.id
FROM public.marketplace_providers mp
WHERE mp.key = 'shopee'
  AND lower(COALESCE(mi.marketplace_name, '')) = 'shopee'
  AND mi.provider_id IS NULL;

-- Backfill external_account_id from meli_user_id or config JSON
UPDATE public.marketplace_integrations mi
SET external_account_id = COALESCE(
      NULLIF(mi.meli_user_id::text, ''),
      NULLIF(mi.config->>'shopee_shop_id', ''),
      NULLIF(mi.config->>'seller_id', '')
    )
WHERE mi.external_account_id IS NULL;

-- Backfill store_name from config JSON
UPDATE public.marketplace_integrations mi
SET store_name = COALESCE(mi.config->>'storeName', mi.config->>'store_name')
WHERE mi.store_name IS NULL;

-- Backfill connected_at from config JSON
UPDATE public.marketplace_integrations mi
SET connected_at = COALESCE(
      (mi.config->>'connectedAt')::timestamptz,
      (mi.config->>'connected_at')::timestamptz,
      now()
    )
WHERE mi.connected_at IS NULL;

-- Backfill connected_by_user_id from config JSON
UPDATE public.marketplace_integrations mi
SET connected_by_user_id = NULLIF(mi.config->>'connectedByUserId', '')::uuid
WHERE mi.connected_by_user_id IS NULL
  AND mi.config->>'connectedByUserId' IS NOT NULL
  AND mi.config->>'connectedByUserId' != '';

-- Mark existing integrations as setup completed (they were already configured)
UPDATE public.marketplace_integrations
SET setup_status = 'completed', setup_completed_at = now()
WHERE setup_status = 'pending';

-- Enforce provider_id NOT NULL now that backfill is done.
-- Rows that still have NULL provider_id belong to unknown providers — allow NULL for now
-- to avoid breaking production; enforce after cleanup.
-- ALTER TABLE public.marketplace_integrations ALTER COLUMN provider_id SET NOT NULL;

-- Partial unique index: only one active integration per (provider, external_account) globally
CREATE UNIQUE INDEX IF NOT EXISTS uq_mi_provider_external_account_active
  ON public.marketplace_integrations (provider_id, external_account_id)
  WHERE deactivated_at IS NULL
    AND provider_id IS NOT NULL
    AND external_account_id IS NOT NULL;

-- Index to speed up status queries
CREATE INDEX IF NOT EXISTS idx_mi_status
  ON public.marketplace_integrations(status)
  WHERE status != 'active';

-- Index for setup_status dashboard alerts
CREATE INDEX IF NOT EXISTS idx_mi_setup_status
  ON public.marketplace_integrations(setup_status, organizations_id)
  WHERE setup_status = 'pending';

-- Index for refresh scheduling
CREATE INDEX IF NOT EXISTS idx_mi_expires_active
  ON public.marketplace_integrations(expires_in, provider_id)
  WHERE status = 'active' AND deactivated_at IS NULL;

COMMIT;
