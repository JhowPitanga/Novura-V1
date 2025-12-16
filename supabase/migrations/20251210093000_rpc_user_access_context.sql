BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_get_user_access_context(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_permissions jsonb := '{}'::jsonb;
  v_role text := 'member';
  v_global_role text := NULL;
  v_display_name text := NULL;
  v_module_switches jsonb := '{}'::jsonb;
  v_perms_row jsonb;
BEGIN
  -- Resolve organização atual do usuário
  SELECT public.get_current_user_organization_id() INTO v_org_id;

  -- Carrega dados de membership (permissions, role, module_switches)
  IF v_org_id IS NOT NULL THEN
    SELECT om.permissions, om.role, om.module_switches
    INTO v_permissions, v_role, v_module_switches
    FROM public.organization_members om
    WHERE om.organization_id = v_org_id AND om.user_id = p_user_id
    LIMIT 1;
  END IF;

  -- Fallback: se não achou via organization_members, usa RPC existente
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

  -- Dados globais do usuário (perfil e role global)
  SELECT u.global_role INTO v_global_role FROM public.users u WHERE u.id = p_user_id;
  SELECT up.display_name INTO v_display_name FROM public.user_profiles up WHERE up.id = p_user_id;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'permissions', COALESCE(v_permissions, '{}'::jsonb),
    'role', COALESCE(v_role, 'member'),
    'global_role', v_global_role,
    'display_name', v_display_name,
    'module_switches', COALESCE(v_module_switches, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_user_access_context(uuid) TO authenticated, anon, service_role;

COMMIT;
