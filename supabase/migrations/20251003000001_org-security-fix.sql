-- Fix: Use public.user_invitations as source of organization membership

-- Ensure required columns exist on user_invitations
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS role text CHECK (role IN ('owner','admin','member'));
ALTER TABLE public.user_invitations ADD CONSTRAINT user_invitations_unique_member UNIQUE (organization_id, user_id);

-- Allow system-created membership rows without requiring email/nome
DO $$ BEGIN
  ALTER TABLE public.user_invitations ALTER COLUMN email DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.user_invitations ALTER COLUMN nome DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- Replace helper functions to use user_invitations with status 'ativo'
CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_invitations ui
    WHERE ui.organization_id = p_org_id
      AND ui.user_id = p_user_id
      AND ui.status = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_user_id uuid, p_org_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_invitations ui
    WHERE ui.organization_id = p_org_id
      AND ui.user_id = p_user_id
      AND ui.status = 'ativo'
      AND ui.role = ANY(p_roles)
  );
$$;

-- Drop organization_members (no longer used) if it exists
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
DROP TABLE IF EXISTS public.organization_members CASCADE;

-- Replace owner membership trigger to write into user_invitations
CREATE OR REPLACE FUNCTION public.add_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_invitations (organization_id, invited_by_user_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_user_id, NEW.owner_user_id, 'owner', 'ativo')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS organization_owner_membership ON public.organizations;
CREATE TRIGGER organization_owner_membership
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.add_owner_membership();