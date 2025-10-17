-- Remove uso de set_config('row_security','off') em funções helpers/RPC
-- Corrige erro 42501: "query would be affected by row-level security policy"
-- Mantém SECURITY DEFINER, mas sem tentar desativar RLS.

BEGIN;

-- 1) RPC: permissões/role do membro com fallback para owner (sem RLS off)
CREATE OR REPLACE FUNCTION public.rpc_get_member_permissions(
  p_user_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  permissions jsonb,
  role text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH member AS (
    SELECT om.permissions, om.role
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
    LIMIT 1
  ), owner AS (
    SELECT '{}'::jsonb AS permissions, 'owner'::text AS role
    FROM public.organizations o
    WHERE o.id = p_organization_id AND o.owner_user_id = p_user_id
    LIMIT 1
  )
  SELECT permissions, role FROM member
  UNION ALL
  SELECT permissions, role FROM owner
  LIMIT 1;
$$;

-- 2) Helper: obter organização atual do usuário (membership primeiro, depois convite ativo)
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid := NULL;
BEGIN
  -- 1) Membership real
  SELECT om.organization_id
    INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  ORDER BY CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  LIMIT 1;

  -- 2) Fallback: convite ativo
  IF v_org_id IS NULL THEN
    SELECT ui.organization_id
      INTO v_org_id
    FROM public.user_invitations ui
    WHERE ui.user_id = auth.uid()
      AND ui.status = 'ativo'
    ORDER BY ui.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN v_org_id;
END;
$$;

-- 3) Versão parametrizada
CREATE OR REPLACE FUNCTION public.get_user_organization_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid := NULL;
BEGIN
  SELECT om.organization_id
    INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = p_user_id
  ORDER BY CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT ui.organization_id
      INTO v_org_id
    FROM public.user_invitations ui
    WHERE ui.user_id = p_user_id
      AND ui.status = 'ativo'
    ORDER BY ui.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN v_org_id;
END;
$$;

-- 4) is_org_member: membership com fallback para convite (sem RLS off)
CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_invitations ui
    WHERE ui.organization_id = p_org_id AND ui.user_id = p_user_id AND ui.status = 'ativo'
  );
$$;

-- 5) has_org_role: verifica role em membership, com fallback para role do convite
CREATE OR REPLACE FUNCTION public.has_org_role(p_user_id uuid, p_org_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = p_user_id AND om.role = ANY(p_roles)
  ) OR EXISTS (
    SELECT 1 FROM public.user_invitations ui
    WHERE ui.organization_id = p_org_id AND ui.user_id = p_user_id AND ui.status = 'ativo' AND ui.role = ANY(p_roles)
  );
$$;

-- 6) current_user_has_permission: checa permissão granular do usuário atual
CREATE OR REPLACE FUNCTION public.current_user_has_permission(
  p_module_name text,
  p_action_name text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = public.get_current_user_organization_id()
      AND om.user_id = auth.uid()
      AND (om.permissions->p_module_name->p_action_name)::boolean = true
  );
$$;

-- 7) current_user_has_module_access: checa se há qualquer ação habilitada no módulo
CREATE OR REPLACE FUNCTION public.current_user_has_module_access(
  p_module_name text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = public.get_current_user_organization_id()
      AND om.user_id = auth.uid()
      AND om.permissions ? p_module_name
  );
$$;

-- Ownership e grants (compatibilidade supabase)
DO $$
BEGIN
  BEGIN PERFORM 1; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.rpc_get_member_permissions(uuid, uuid) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_current_user_organization_id() OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_user_organization_id(uuid) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.is_org_member(uuid, uuid) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.has_org_role(uuid, uuid, text[]) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.current_user_has_permission(text, text) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.current_user_has_module_access(text) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_get_member_permissions(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_user_organization_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, text[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_module_access(text) TO authenticated, anon, service_role;

COMMIT;