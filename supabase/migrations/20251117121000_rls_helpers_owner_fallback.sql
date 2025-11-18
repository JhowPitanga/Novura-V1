BEGIN;

CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_org_id AND om.user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_invitations ui
      WHERE ui.organization_id = p_org_id AND ui.user_id = p_user_id AND ui.status = 'ativo'
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_org_id AND o.owner_user_id = p_user_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_user_id uuid, p_org_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_org_id AND om.user_id = p_user_id AND om.role = ANY(p_roles)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_invitations ui
      WHERE ui.organization_id = p_org_id AND ui.user_id = p_user_id AND ui.status = 'ativo' AND ui.role = ANY(p_roles)
    )
    OR ((
      'owner' = ANY(p_roles)
    ) AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_org_id AND o.owner_user_id = p_user_id
    ))
  );
$$;

DO $$ BEGIN
  BEGIN ALTER FUNCTION public.is_org_member(uuid, uuid) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER FUNCTION public.has_org_role(uuid, uuid, text[]) OWNER TO postgres; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, text[]) TO authenticated, anon, service_role;

COMMIT;