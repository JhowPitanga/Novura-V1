-- Recria a RPC com desativação de RLS durante a execução
-- Garante que a leitura de organization_members/organizations não dispare políticas recursivas

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
  -- Desativa aplicação de RLS para o owner durante a execução desta função
  PERFORM set_config('row_security', 'off', true);

  -- Tenta retornar permissões/role do membro
  SELECT om.permissions, om.role
    INTO v_permissions, v_role
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
  LIMIT 1;

  -- Se não existir membro, verifica se o usuário é o owner da organização
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

-- Garante ownership da função para o owner padrão (melhor compatibilidade com row_security off)
DO $$
BEGIN
  BEGIN
    ALTER FUNCTION public.rpc_get_member_permissions(uuid, uuid) OWNER TO postgres;
  EXCEPTION WHEN OTHERS THEN
    -- Se não existir role postgres ou não for permitido, ignora silenciosamente
    NULL;
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_get_member_permissions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_member_permissions(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_member_permissions(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_get_member_permissions(uuid, uuid)
IS 'Retorna permissões e role do usuário para a organização; desativa RLS localmente e faz fallback para owner.';