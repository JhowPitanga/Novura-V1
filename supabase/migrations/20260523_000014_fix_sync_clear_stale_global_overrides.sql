BEGIN;

-- Admin org toggles must not be blocked by stale per-member global.*.active overrides.
CREATE OR REPLACE FUNCTION public.sync_org_module_switches(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.organization_members om
  SET module_switches = public.build_effective_module_switches(
    p_organization_id,
    '{}'::jsonb
  )
  WHERE om.organization_id = p_organization_id;
END;
$$;

COMMENT ON FUNCTION public.sync_org_module_switches(uuid) IS
  'Rebuilds module_switches from system_modules + organization_features without stale member global overrides.';

-- Backfill: grant view for enabled org features + resync all tenants
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT organization_id, feature_key
    FROM public.organization_features
    WHERE is_enabled = true
  LOOP
    PERFORM public.bulk_set_module_view(r.organization_id, r.feature_key, true);
  END LOOP;
END $$;

SELECT public.sync_all_orgs_module_switches();

COMMIT;
