-- Ensure helper function for updated_at exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper functions for organization membership and roles
CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_user_id uuid, p_org_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = p_user_id AND m.role = ANY(p_roles)
  );
$$;

-- Organization members table (links users to organizations with a role)
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Policies for organization_members
DROP POLICY IF EXISTS "Members can view their memberships" ON public.organization_members;
CREATE POLICY "Members can view their memberships"
ON public.organization_members
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Owners/Admins can add members" ON public.organization_members;
CREATE POLICY "Owners/Admins can add members"
ON public.organization_members
FOR INSERT
WITH CHECK (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Owners/Admins can update members" ON public.organization_members;
CREATE POLICY "Owners/Admins can update members"
ON public.organization_members
FOR UPDATE
USING (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Owners/Admins can remove members" ON public.organization_members;
CREATE POLICY "Owners/Admins can remove members"
ON public.organization_members
FOR DELETE
USING (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

-- Organizations RLS (assumes table public.organizations exists with owner_user_id)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view organization" ON public.organizations;
CREATE POLICY "Members can view organization"
ON public.organizations
FOR SELECT
USING (public.is_org_member(auth.uid(), id));

DROP POLICY IF EXISTS "Owner can create organization" ON public.organizations;
CREATE POLICY "Owner can create organization"
ON public.organizations
FOR INSERT
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners/Admins can update organization" ON public.organizations;
CREATE POLICY "Owners/Admins can update organization"
ON public.organizations
FOR UPDATE
USING (public.has_org_role(auth.uid(), id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "Only Owner can delete organization" ON public.organizations;
CREATE POLICY "Only Owner can delete organization"
ON public.organizations
FOR DELETE
USING (public.has_org_role(auth.uid(), id, ARRAY['owner']));

-- Trigger to automatically add owner as member when organization is created
CREATE OR REPLACE FUNCTION public.add_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.owner_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS organization_owner_membership ON public.organizations;
CREATE TRIGGER organization_owner_membership
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.add_owner_membership();

-- Companies (CNPJ) now linked to organizations
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Update RLS policies on companies to allow either user-owned (legacy) or org membership access
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can create their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can update their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can delete their own companies" ON public.companies;

CREATE POLICY "Members can view companies"
ON public.companies
FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Members can create companies"
ON public.companies
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
  )
);

CREATE POLICY "Members can update companies"
ON public.companies
FOR UPDATE
USING (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
  )
);

CREATE POLICY "Members can delete companies"
ON public.companies
FOR DELETE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (
    organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
  )
);

-- Invitations tied to organizations for role-based onboarding
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view invitations they created" ON public.user_invitations;
DROP POLICY IF EXISTS "Users can create invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Users can update invitations they created" ON public.user_invitations;
DROP POLICY IF EXISTS "Users can delete invitations they created" ON public.user_invitations;

CREATE POLICY "Org owners/admins can view invitations"
ON public.user_invitations
FOR SELECT
USING (
  invited_by_user_id = auth.uid()
  OR (
    organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
  )
);

CREATE POLICY "Org owners/admins can create invitations"
ON public.user_invitations
FOR INSERT
WITH CHECK (
  invited_by_user_id = auth.uid()
  AND organization_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

CREATE POLICY "Org owners/admins can update invitations"
ON public.user_invitations
FOR UPDATE
USING (
  invited_by_user_id = auth.uid()
  OR (
    organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
  )
);

CREATE POLICY "Org owners/admins can delete invitations"
ON public.user_invitations
FOR DELETE
USING (
  invited_by_user_id = auth.uid()
  OR (
    organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
  )
);

-- Triggers for updated_at on new tables
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER update_organization_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();