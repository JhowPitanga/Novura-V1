-- Restrict companies RLS: only org owners/admins can view/change

BEGIN;

-- Ensure RLS is enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (broad or previous restrictive), idempotent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Members can view companies'
  ) THEN
    DROP POLICY "Members can view companies" ON public.companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Members can create companies'
  ) THEN
    DROP POLICY "Members can create companies" ON public.companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Members can update companies'
  ) THEN
    DROP POLICY "Members can update companies" ON public.companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Members can delete companies'
  ) THEN
    DROP POLICY "Members can delete companies" ON public.companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Org owners/admins can view companies'
  ) THEN
    DROP POLICY "Org owners/admins can view companies" ON public.companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Org owners/admins can create companies'
  ) THEN
    DROP POLICY "Org owners/admins can create companies" ON public.companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Org owners/admins can update companies'
  ) THEN
    DROP POLICY "Org owners/admins can update companies" ON public.companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Org owners/admins can delete companies'
  ) THEN
    DROP POLICY "Org owners/admins can delete companies" ON public.companies;
  END IF;
END$$;

-- View policy: only owners/admins of the organization
CREATE POLICY "Org owners/admins can view companies"
ON public.companies
FOR SELECT
USING (
  organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

-- Insert policy: only owners/admins; require organization_id present
CREATE POLICY "Org owners/admins can create companies"
ON public.companies
FOR INSERT
WITH CHECK (
  organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

-- Update policy: only owners/admins; keep row visible post-update
CREATE POLICY "Org owners/admins can update companies"
ON public.companies
FOR UPDATE
USING (
  organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
)
WITH CHECK (
  organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

-- Delete policy: only owners/admins
CREATE POLICY "Org owners/admins can delete companies"
ON public.companies
FOR DELETE
USING (
  organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin'])
);

COMMIT;