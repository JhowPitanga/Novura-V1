-- RPCs for the universal OAuth adapter.
-- 1. list_blocked_companies_for_provider — used by QuickSetupModal to grey-out
--    companies that already have an active integration for a given provider key.
-- 2. complete_integration_setup — called after QuickSetupModal saves company + warehouse.
-- 3. deactivate_integration — soft-delete; preserves audit trail.
-- 4. Overload of disconnect_marketplace_cascade to also accept provider_key.

BEGIN;

-- -------------------------------------------------------------------------
-- 1. list_blocked_companies_for_provider
-- Returns UUIDs of companies in the org that already have an active
-- integration for the given provider_key. Front-end uses these to disable
-- company selection items and show a tooltip.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_blocked_companies_for_provider(
  p_organization_id uuid,
  p_provider_key text
) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT mi.company_id
  FROM marketplace_integrations mi
  JOIN marketplace_providers mp ON mp.id = mi.provider_id
  WHERE mi.organizations_id = p_organization_id
    AND mp.key              = p_provider_key
    AND mi.deactivated_at IS NULL
    AND mi.status           = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.list_blocked_companies_for_provider(uuid, text) TO authenticated;

-- -------------------------------------------------------------------------
-- 2. complete_integration_setup
-- Marks an integration as fully configured after the user completes
-- the company + warehouse Quick Setup modal.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_integration_setup(
  p_integration_id uuid,
  p_company_id uuid,
  p_organization_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_org_member(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE marketplace_integrations
  SET
    company_id          = p_company_id,
    setup_status        = 'completed',
    setup_completed_at  = now()
  WHERE id              = p_integration_id
    AND organizations_id = p_organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_integration_setup(uuid, uuid, uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 3. deactivate_integration
-- Soft-deletes an integration by setting deactivated_at. The UNIQUE partial
-- index on (provider_id, external_account_id) WHERE deactivated_at IS NULL
-- becomes inactive for this row, allowing a new org to claim the same account.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_integration(
  p_integration_id uuid,
  p_organization_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_org_role(auth.uid(), p_organization_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE marketplace_integrations
  SET
    deactivated_at = now(),
    status         = 'revoked'
  WHERE id             = p_integration_id
    AND organizations_id = p_organization_id
    AND deactivated_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_integration(uuid, uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 4. disconnect_marketplace_cascade — add provider_key overload
-- Keeps backward compat with the existing marketplace_name signature
-- while also accepting a provider_key lookup.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disconnect_marketplace_by_provider(
  p_organizations_id uuid,
  p_provider_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_marketplace_name text;
BEGIN
  IF NOT public.is_org_member(auth.uid(), p_organizations_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF NOT public.has_org_role(auth.uid(), p_organizations_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Resolve marketplace_name from provider key for cascade
  SELECT display_name INTO v_marketplace_name
  FROM marketplace_providers
  WHERE key = p_provider_key
  LIMIT 1;

  IF v_marketplace_name IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND:%', p_provider_key;
  END IF;

  PERFORM public.disconnect_marketplace_cascade(p_organizations_id, v_marketplace_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_marketplace_by_provider(uuid, text) TO authenticated;

-- -------------------------------------------------------------------------
-- Refresh jobs table used by oauth-refresh (enfileirador) + oauth-refresh-worker
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_refresh_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempt_count smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 3,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_jobs_pending
  ON public.oauth_refresh_jobs(scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_refresh_jobs_integration
  ON public.oauth_refresh_jobs(integration_id);

-- RLS: only service_role can read/write jobs (called from Edge Functions with admin client)
ALTER TABLE public.oauth_refresh_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RefreshJobs: service_role only" ON public.oauth_refresh_jobs;
CREATE POLICY "RefreshJobs: service_role only"
  ON public.oauth_refresh_jobs
  USING (auth.role() = 'service_role');

COMMIT;
