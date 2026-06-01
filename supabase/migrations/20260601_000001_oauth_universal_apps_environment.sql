-- Universal OAuth: app-scoped environments, integration schema fixes, health view.

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Shopee sandbox app metadata
-- -------------------------------------------------------------------------
UPDATE public.apps
SET name = 'Shopee Sandbox (Test)'
WHERE id = 'test Shopee';

UPDATE public.apps
SET config = COALESCE(config, '{}'::jsonb) || '{
  "environment": "sandbox",
  "auth_host": "https://open.sandbox.test-stable.shopee.com",
  "token_host": "https://openplatform.sandbox.test-stable.shopee.sg",
  "redirect_uri": "https://novuraerp.com.br/oauth/shopee/callback"
}'::jsonb
WHERE id = 'test Shopee';

UPDATE public.apps
SET config = COALESCE(config, '{}'::jsonb) || '{"environment": "production"}'::jsonb
WHERE id = 'Shopee' AND (config->>'environment') IS NULL;

UPDATE public.apps
SET config = COALESCE(config, '{}'::jsonb) || '{"environment": "production"}'::jsonb
WHERE id = 'mercado_livre' AND (config->>'environment') IS NULL;

-- -------------------------------------------------------------------------
-- 2. company_id nullable until QuickSetup completes
-- -------------------------------------------------------------------------
ALTER TABLE public.marketplace_integrations
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.marketplace_integrations
  ALTER COLUMN company_id DROP DEFAULT;

-- -------------------------------------------------------------------------
-- 3. expires_in as integer seconds (legacy column was timestamptz)
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketplace_integrations'
      AND column_name = 'expires_in'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE public.marketplace_integrations
      RENAME COLUMN expires_in TO expires_in_legacy;
  END IF;
END $$;

ALTER TABLE public.marketplace_integrations
  ADD COLUMN IF NOT EXISTS expires_in integer;

UPDATE public.marketplace_integrations
SET expires_in = GREATEST(
  0,
  EXTRACT(EPOCH FROM (expires_at - connected_at))::integer
)
WHERE expires_at IS NOT NULL
  AND connected_at IS NOT NULL
  AND expires_in IS NULL;

-- -------------------------------------------------------------------------
-- 4. Health view for integration token status
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.marketplace_integrations_health_view AS
SELECT
  mi.id,
  mi.organizations_id,
  mi.provider_id,
  mp.key AS provider_key,
  mi.status,
  mi.setup_status,
  mi.expires_at,
  mi.expires_in,
  mi.last_refresh_at,
  mi.last_refresh_error,
  mi.config,
  CASE
    WHEN mi.status IN ('revoked', 'error') THEN 'error'
    WHEN mi.expires_at IS NULL THEN 'unknown'
    WHEN mi.expires_at <= now() THEN 'expired'
    WHEN mi.expires_at <= now() + (COALESCE(mp.refresh_threshold_minutes, 30) * interval '1 minute')
      THEN 'expiring_soon'
    ELSE 'ok'
  END AS token_health,
  GREATEST(0, EXTRACT(EPOCH FROM (mi.expires_at - now())) / 86400)::integer AS days_until_expiry
FROM public.marketplace_integrations mi
LEFT JOIN public.marketplace_providers mp ON mp.id = mi.provider_id
WHERE mi.deactivated_at IS NULL;

GRANT SELECT ON public.marketplace_integrations_health_view TO authenticated;

-- -------------------------------------------------------------------------
-- 5. RPC: integrations needing re-auth for an org
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_integrations_needing_reauth(p_organization_id uuid)
RETURNS TABLE (
  integration_id uuid,
  provider_key text,
  token_health text,
  last_refresh_error text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    h.id,
    h.provider_key,
    h.token_health,
    h.last_refresh_error
  FROM public.marketplace_integrations_health_view h
  WHERE h.organizations_id = p_organization_id
    AND h.token_health IN ('expired', 'error', 'expiring_soon')
    AND public.is_org_member(auth.uid(), p_organization_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_integrations_needing_reauth(uuid) TO authenticated;

COMMIT;
