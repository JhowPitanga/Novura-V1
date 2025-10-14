-- RPC segura para carregar permissões e role do usuário sem acionar RLS recursivo
-- Evita erros de stack depth (54001) ao consultar organization_members com políticas complexas

CREATE OR REPLACE FUNCTION public.rpc_get_member_permissions(
  p_user_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  permissions jsonb,
  role text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT om.permissions, om.role
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
  LIMIT 1;
$$;

-- Opcional: garantir que a função exista mesmo se a tabela for recriada em migrações futuras
COMMENT ON FUNCTION public.rpc_get_member_permissions(uuid, uuid)
IS 'Retorna permissões e role de um membro da organização usando SECURITY DEFINER para evitar problemas de RLS e recursão.';