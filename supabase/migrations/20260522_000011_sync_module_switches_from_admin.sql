BEGIN;

-- Build effective module_switches.global from system_modules, system_features,
-- organization_features, and optional per-member overrides stored on the row.
CREATE OR REPLACE FUNCTION public.build_effective_module_switches(
  p_organization_id uuid,
  p_member_switches jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'global',
    COALESCE(
      (
        SELECT jsonb_object_agg(
          sm.name,
          jsonb_build_object(
            'active',
            (
              sm.active
              AND COALESCE(sf.is_globally_enabled, true)
              AND COALESCE(
                of.is_enabled,
                COALESCE(sf.is_globally_enabled, true)
              )
              AND COALESCE(
                (p_member_switches #>> ARRAY['global', sm.name, 'active'])::boolean,
                true
              )
            )
          )
        )
        FROM public.system_modules sm
        LEFT JOIN public.system_features sf ON sf.key = sm.name
        LEFT JOIN public.organization_features of
          ON of.organization_id = p_organization_id
         AND of.feature_key = sm.name
      ),
      '{}'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.build_effective_module_switches(uuid, jsonb) IS
  'Merges platform module flags with per-tenant organization_features for RPC and member sync.';

-- Persist merged switches on all members of a tenant (triggers realtime + cache refresh path).
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
    om.module_switches
  )
  WHERE om.organization_id = p_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_all_orgs_module_switches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM public.organizations
  LOOP
    PERFORM public.sync_org_module_switches(v_org_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_effective_module_switches(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_org_module_switches(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_all_orgs_module_switches()
  TO authenticated, service_role;

-- rpc_get_user_access_context: return computed switches (not raw column only)
CREATE OR REPLACE FUNCTION public.rpc_get_user_access_context(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id        uuid;
  v_permissions   jsonb := '{}'::jsonb;
  v_role          text  := 'member';
  v_display_name  text  := NULL;
  v_module_switches jsonb := '{}'::jsonb;
  v_raw_switches  jsonb := '{}'::jsonb;
  v_perms_row     jsonb;
  v_org_blocked   boolean := false;
  v_admin_role    text;
BEGIN
  SELECT public.get_current_user_organization_id() INTO v_org_id;

  IF v_org_id IS NOT NULL THEN
    SELECT om.permissions, om.role, om.module_switches
    INTO v_permissions, v_role, v_raw_switches
    FROM public.organization_members om
    WHERE om.organization_id = v_org_id AND om.user_id = p_user_id
    LIMIT 1;

    v_module_switches := public.build_effective_module_switches(v_org_id, v_raw_switches);
  END IF;

  IF (v_permissions IS NULL OR v_permissions = '{}'::jsonb) THEN
    SELECT COALESCE(jsonb_build_object('permissions', (r->'permissions'), 'role', (r->>'role')), '{}'::jsonb)
    INTO v_perms_row
    FROM (
      SELECT to_jsonb(public.rpc_get_member_permissions(p_user_id, v_org_id)) AS r
    ) t;

    IF v_perms_row IS NOT NULL THEN
      v_permissions := COALESCE(v_perms_row->'permissions', '{}'::jsonb);
      v_role := COALESCE((v_perms_row->>'role')::text, v_role);
    END IF;
  END IF;

  IF v_org_id IS NOT NULL THEN
    SELECT (os.status = 'blocked' OR os.deleted_at IS NOT NULL)
    INTO v_org_blocked
    FROM public.organization_status os
    WHERE os.organization_id = v_org_id;

    IF v_org_blocked THEN
      v_permissions := '{}'::jsonb;
      v_role := 'member';
    END IF;
  END IF;

  SELECT up.display_name INTO v_display_name
  FROM public.user_profiles up WHERE up.id = p_user_id;

  v_admin_role := auth.jwt() -> 'app_metadata' ->> 'role';

  RETURN jsonb_build_object(
    'organization_id',  v_org_id,
    'permissions',      COALESCE(v_permissions, '{}'::jsonb),
    'role',             COALESCE(v_role, 'member'),
    'admin_role',       v_admin_role,
    'global_role',      v_admin_role,
    'display_name',     v_display_name,
    'module_switches',  COALESCE(v_module_switches, '{}'::jsonb),
    'org_blocked',      COALESCE(v_org_blocked, false)
  );
END;
$$;

COMMIT;
