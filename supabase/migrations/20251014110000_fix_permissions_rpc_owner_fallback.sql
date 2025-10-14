-- Ajuste: RPC retorna permissões/role do membro; se não houver, retorna role 'owner' quando o usuário é dono da organização

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

COMMENT ON FUNCTION public.rpc_get_member_permissions(uuid, uuid)
IS 'Retorna permissões e role do membro; se não houver, retorna owner quando p_user_id é o owner da organização.';