-- Fix RLS helper functions to avoid 42501 errors when policies
-- reference membership tables with RLS enabled.
-- Redefine helpers as SECURITY DEFINER and disable row_security
-- during execution to prevent recursive RLS issues.

BEGIN;

-- is_org_member: membership via organization_members with fallback to active invitation
CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  PERFORM set_config('row_security','off', true);

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
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.is_org_member(uuid, uuid)
IS 'Returns true for membership via organization_members; falls back to active user_invitations. SECURITY DEFINER with row_security off.';

-- has_org_role: role via organization_members with fallback to active invitation role
CREATE OR REPLACE FUNCTION public.has_org_role(p_user_id uuid, p_org_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  PERFORM set_config('row_security','off', true);

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
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.has_org_role(uuid, uuid, text[])
IS 'Checks user role via organization_members; falls back to role in active user_invitations. SECURITY DEFINER with row_security off.';

-- current_user_has_permission: checks granular permission in organization_members
CREATE OR REPLACE FUNCTION public.current_user_has_permission(
  p_module_name text,
  p_action_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  PERFORM set_config('row_security','off', true);

  SELECT EXISTS(
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = (
      SELECT om2.organization_id
      FROM public.organization_members om2
      WHERE om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'admin', 'member')
      LIMIT 1
    )
      AND om.user_id = auth.uid()
      AND (om.permissions->p_module_name->p_action_name)::boolean = true
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.current_user_has_permission(text, text)
IS 'Checks granular permission from organization_members for current user. SECURITY DEFINER with row_security off.';

-- current_user_has_module_access: checks any action within module
CREATE OR REPLACE FUNCTION public.current_user_has_module_access(
  p_module_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  PERFORM set_config('row_security','off', true);

  SELECT EXISTS(
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = (
      SELECT om2.organization_id
      FROM public.organization_members om2
      WHERE om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'admin', 'member')
      LIMIT 1
    )
      AND om.user_id = auth.uid()
      AND om.permissions ? p_module_name
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.current_user_has_module_access(text)
IS 'Checks if current user has any permission within a module. SECURITY DEFINER with row_security off.';

-- get_user_organization_id: owner/admin organization for given user
CREATE OR REPLACE FUNCTION public.get_user_organization_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  PERFORM set_config('row_security','off', true);

  SELECT om.organization_id
  INTO org_id
  FROM public.organization_members om
  WHERE om.user_id = p_user_id
    AND om.role IN ('owner', 'admin')
  LIMIT 1;

  RETURN org_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_organization_id(uuid)
IS 'Gets an organization_id for the user with owner/admin role. SECURITY DEFINER with row_security off.';

-- get_current_user_organization_id: organization_id for current user
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  PERFORM set_config('row_security','off', true);

  SELECT om.organization_id
  INTO org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  LIMIT 1;

  RETURN org_id;
END;
$$;

COMMENT ON FUNCTION public.get_current_user_organization_id()
IS 'Gets organization_id for current user. SECURITY DEFINER with row_security off.';

COMMIT;