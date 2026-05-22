BEGIN;

-- When a module is enabled for a tenant, grant view to all members (sidebar + routes).
-- Re-sync module_switches so rpc_get_user_access_context and realtime stay aligned.

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
