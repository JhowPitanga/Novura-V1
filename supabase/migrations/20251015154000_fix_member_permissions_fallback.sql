-- Ajustes para membros verem módulos no sidebar com base nas permissões
-- 1) get_current_user_organization_id: fallback para convites ativos
-- 2) get_user_organization_id: versão parametrizada com o mesmo fallback
-- 3) rpc_get_member_permissions: fallback para permissões/role do convite ativo

-- 1) Função helper para obter organização do usuário atual com fallback
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := NULL;
BEGIN
  -- Garante que RLS não bloqueie leituras internas durante a função
  PERFORM set_config('row_security', 'off', true);

  -- Prioriza membership real em organization_members
  SELECT om.organization_id
    INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  ORDER BY CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  LIMIT 1;

  -- Fallback para convite ativo (útil quando ainda não há linha em organization_members)
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

-- 2) Versão parametrizada com mesmo fallback
CREATE OR REPLACE FUNCTION public.get_user_organization_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := NULL;
BEGIN
  PERFORM set_config('row_security', 'off', true);

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

-- 3) RPC de permissões com fallback para convites ativos
CREATE OR REPLACE FUNCTION public.rpc_get_member_permissions(
  p_user_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  permissions jsonb,
  role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permissions jsonb := '{}'::jsonb;
  v_role text := NULL;
BEGIN
  -- Desativa RLS localmente para permitir leitura segura
  PERFORM set_config('row_security', 'off', true);

  -- 1) Tenta carregar de organization_members
  SELECT om.permissions, om.role
    INTO v_permissions, v_role
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
  LIMIT 1;

  -- 2) Fallback: usa permissões/role do convite ativo, quando existir
  IF v_role IS NULL THEN
    SELECT COALESCE(ui.permissions, '{}'::jsonb), ui.role
      INTO v_permissions, v_role
    FROM public.user_invitations ui
    WHERE ui.organization_id = p_organization_id
      AND ui.user_id = p_user_id
      AND ui.status = 'ativo'
    ORDER BY ui.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- 3) Fallback adicional: owner da organização
  IF v_role IS NULL THEN
    SELECT '{}'::jsonb, 'owner'::text
      INTO v_permissions, v_role
    FROM public.organizations o
    WHERE o.id = p_organization_id AND o.owner_user_id = p_user_id
    LIMIT 1;
  END IF;

  RETURN QUERY SELECT COALESCE(v_permissions, '{}'::jsonb), COALESCE(v_role, 'member');
END;
$$;

-- Grants para compatibilidade
DO $$
BEGIN
  BEGIN
    ALTER FUNCTION public.get_current_user_organization_id() OWNER TO postgres;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER FUNCTION public.get_user_organization_id(uuid) OWNER TO postgres;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER FUNCTION public.rpc_get_member_permissions(uuid, uuid) OWNER TO postgres;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

GRANT EXECUTE ON FUNCTION public.get_current_user_organization_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_member_permissions(uuid, uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.get_current_user_organization_id()
IS 'Retorna organization_id do usuário atual, priorizando organization_members e fazendo fallback para convites ativos (status = ''ativo'').';

COMMENT ON FUNCTION public.get_user_organization_id(uuid)
IS 'Retorna organization_id para p_user_id, priorizando organization_members e fallback para convites ativos.';

COMMENT ON FUNCTION public.rpc_get_member_permissions(uuid, uuid)
IS 'Retorna permissões e role do usuário para a organização; lê de organization_members e faz fallback para user_invitations(status=ativo) e owner.';