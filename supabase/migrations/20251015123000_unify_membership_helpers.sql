-- Unify membership helper functions to use organization_members as source of truth
-- with a compatibility fallback to user_invitations (status = 'ativo').

-- is_org_member: checks membership in organization_members first; falls back to active invitation
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
      WHERE om.organization_id = p_org_id
        AND om.user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_invitations ui
      WHERE ui.organization_id = p_org_id
        AND ui.user_id = p_user_id
        AND ui.status = 'ativo'
    )
  );
$$;

COMMENT ON FUNCTION public.is_org_member(uuid, uuid)
IS 'Returns true when the user is a member in organization_members; compatible fallback to active user_invitations.';

-- has_org_role: checks role in organization_members first; falls back to role in active invitation
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
      WHERE om.organization_id = p_org_id
        AND om.user_id = p_user_id
        AND om.role = ANY(p_roles)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_invitations ui
      WHERE ui.organization_id = p_org_id
        AND ui.user_id = p_user_id
        AND ui.status = 'ativo'
        AND ui.role = ANY(p_roles)
    )
  );
$$;

COMMENT ON FUNCTION public.has_org_role(uuid, uuid, text[])
IS 'Checks user role in organization_members; compatible fallback to role in active user_invitations.';