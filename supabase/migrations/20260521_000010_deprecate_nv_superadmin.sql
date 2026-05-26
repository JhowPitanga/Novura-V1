BEGIN;

-- =========================================================
-- Migrate system_modules RLS from nv_superadmin → is_super_admin()
-- Replaces migration 20251209_system_modules_rls.sql policies
-- =========================================================

DROP POLICY IF EXISTS "System modules: active view" ON public.system_modules;
CREATE POLICY "System modules: active view"
ON public.system_modules
FOR SELECT
USING (
  active = true
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "System modules: superadmin update" ON public.system_modules;
CREATE POLICY "System modules: superadmin update"
ON public.system_modules
FOR UPDATE
USING (public.is_super_admin());

DROP POLICY IF EXISTS "System modules: superadmin insert" ON public.system_modules;
CREATE POLICY "System modules: superadmin insert"
ON public.system_modules
FOR INSERT
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "System modules: superadmin delete" ON public.system_modules;
CREATE POLICY "System modules: superadmin delete"
ON public.system_modules
FOR DELETE
USING (public.is_super_admin());

-- =========================================================
-- Update rpc_get_user_access_context:
-- - Expose org_blocked via organization_status
-- - Derive admin_role from JWT instead of users.global_role
-- =========================================================
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
  v_perms_row     jsonb;
  v_org_blocked   boolean := false;
  v_admin_role    text;
BEGIN
  -- Resolve current org for the user
  SELECT public.get_current_user_organization_id() INTO v_org_id;

  -- Load membership data
  IF v_org_id IS NOT NULL THEN
    SELECT om.permissions, om.role, om.module_switches
    INTO v_permissions, v_role, v_module_switches
    FROM public.organization_members om
    WHERE om.organization_id = v_org_id AND om.user_id = p_user_id
    LIMIT 1;
  END IF;

  -- Fallback to RPC if no membership found
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

  -- Check org blocked status
  IF v_org_id IS NOT NULL THEN
    SELECT (os.status = 'blocked' OR os.deleted_at IS NOT NULL)
    INTO v_org_blocked
    FROM public.organization_status os
    WHERE os.organization_id = v_org_id;

    -- Blocked orgs get empty permissions
    IF v_org_blocked THEN
      v_permissions := '{}'::jsonb;
      v_role := 'member';
    END IF;
  END IF;

  -- Profile display name
  SELECT up.display_name INTO v_display_name
  FROM public.user_profiles up WHERE up.id = p_user_id;

  -- admin_role from JWT app_metadata (not from DB column)
  v_admin_role := auth.jwt() -> 'app_metadata' ->> 'role';

  RETURN jsonb_build_object(
    'organization_id',  v_org_id,
    'permissions',      COALESCE(v_permissions, '{}'::jsonb),
    'role',             COALESCE(v_role, 'member'),
    'admin_role',       v_admin_role,
    'global_role',      v_admin_role,  -- kept for backward-compat; deprecated
    'display_name',     v_display_name,
    'module_switches',  COALESCE(v_module_switches, '{}'::jsonb),
    'org_blocked',      COALESCE(v_org_blocked, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_user_access_context(uuid)
  TO authenticated, anon, service_role;

COMMIT;
