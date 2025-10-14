-- Add organizations_id to apps and marketplace_integrations and set RLS policies
-- This migration assumes public.organizations exists and helper functions
-- public.is_org_member(uuid, uuid) and public.has_org_role(uuid, uuid, text[]) are available

-- 1) Add column organizations_id with FK to organizations
ALTER TABLE IF EXISTS public.apps
  ADD COLUMN IF NOT EXISTS organizations_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.marketplace_integrations
  ADD COLUMN IF NOT EXISTS organizations_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2) Helpful index for filtering by organization
CREATE INDEX IF NOT EXISTS idx_apps_organizations_id ON public.apps(organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_integrations_organizations_id ON public.marketplace_integrations(organizations_id);

-- 3) Enable RLS (Row Level Security)
ALTER TABLE IF EXISTS public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketplace_integrations ENABLE ROW LEVEL SECURITY;

-- 4) Policies for apps (catalog may contain global rows with organizations_id IS NULL)
--    SELECT: allow members of org to read rows tied to their org; allow global rows when organizations_id IS NULL
DROP POLICY IF EXISTS "Apps: members can view" ON public.apps;
CREATE POLICY "Apps: members can view"
ON public.apps
FOR SELECT
USING (
  organizations_id IS NULL
  OR public.is_org_member(auth.uid(), organizations_id)
);

--    INSERT: only owners/admins can write rows, and must specify organizations_id
DROP POLICY IF EXISTS "Apps: owners/admins can insert" ON public.apps;
CREATE POLICY "Apps: owners/admins can insert"
ON public.apps
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

--    UPDATE: only owners/admins in the row org
DROP POLICY IF EXISTS "Apps: owners/admins can update" ON public.apps;
CREATE POLICY "Apps: owners/admins can update"
ON public.apps
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

--    DELETE: only owners/admins in the row org
DROP POLICY IF EXISTS "Apps: owners/admins can delete" ON public.apps;
CREATE POLICY "Apps: owners/admins can delete"
ON public.apps
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- 5) Policies for marketplace_integrations (always org-bound)
DROP POLICY IF EXISTS "Integrations: members can view" ON public.marketplace_integrations;
CREATE POLICY "Integrations: members can view"
ON public.marketplace_integrations
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

-- Allow any org member to insert integration rows
DROP POLICY IF EXISTS "Integrations: owners/admins can insert" ON public.marketplace_integrations;
DROP POLICY IF EXISTS "Integrations: members can insert" ON public.marketplace_integrations;
CREATE POLICY "Integrations: members can insert"
ON public.marketplace_integrations
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Integrations: owners/admins can update" ON public.marketplace_integrations;
CREATE POLICY "Integrations: owners/admins can update"
ON public.marketplace_integrations
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Integrations: owners/admins can delete" ON public.marketplace_integrations;
CREATE POLICY "Integrations: owners/admins can delete"
ON public.marketplace_integrations
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- 6) Helper RPCs to expose organization context to each user
-- Get organizations the current user belongs to
CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (
  id uuid,
  name text,
  owner_user_id uuid
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.owner_user_id
  FROM public.organizations o
  WHERE public.is_org_member(auth.uid(), o.id);
$$;

-- Get active members (from user_invitations) for a given org that the caller is a member of
CREATE OR REPLACE FUNCTION public.get_my_org_members(p_org_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  organization_id uuid,
  user_id uuid,
  role text,
  status text,
  invited_by_user_id uuid,
  created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ui.id, ui.organization_id, ui.user_id, ui.role, ui.status, ui.invited_by_user_id, ui.created_at
  FROM public.user_invitations ui
  WHERE ui.organization_id = p_org_id
    AND ui.status = 'ativo'
    AND public.is_org_member(auth.uid(), p_org_id);
$$;