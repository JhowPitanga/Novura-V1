-- Unify companies RLS: permission-based and scoped to caller's organization
-- Drops conflicting role-based policies and permissive view policy
-- Requires helper functions: current_user_has_permission() and get_current_user_organization_id()

BEGIN;

-- Ensure RLS is enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Drop prior policies to avoid conflicts/ambiguity
DROP POLICY IF EXISTS "Members can view companies" ON public.companies;
DROP POLICY IF EXISTS "Members can create companies" ON public.companies;
DROP POLICY IF EXISTS "Members can update companies" ON public.companies;
DROP POLICY IF EXISTS "Members can delete companies" ON public.companies;

DROP POLICY IF EXISTS "Users with config.view can view companies" ON public.companies;
DROP POLICY IF EXISTS "Users with config.edit can create companies" ON public.companies;
DROP POLICY IF EXISTS "Users with config.edit can update companies" ON public.companies;
DROP POLICY IF EXISTS "Users with config.edit can delete companies" ON public.companies;

DROP POLICY IF EXISTS "Org owners/admins can view companies" ON public.companies;
DROP POLICY IF EXISTS "Org owners/admins can create companies" ON public.companies;
DROP POLICY IF EXISTS "Org owners/admins can update companies" ON public.companies;
DROP POLICY IF EXISTS "Org owners/admins can delete companies" ON public.companies;

-- View: must have configuracoes.view and row belongs to caller organization
CREATE POLICY "Companies: view by permission and org"
ON public.companies
FOR SELECT
USING (
  organization_id = public.get_current_user_organization_id()
  AND public.current_user_has_permission('configuracoes', 'view')
);

-- Insert: must have configuracoes.edit and enforce row org to caller org
CREATE POLICY "Companies: insert by permission and org"
ON public.companies
FOR INSERT
WITH CHECK (
  organization_id = public.get_current_user_organization_id()
  AND public.current_user_has_permission('configuracoes', 'edit')
);

-- Update: row must be visible and remain within caller org; require edit permission
CREATE POLICY "Companies: update by permission and org"
ON public.companies
FOR UPDATE
USING (
  organization_id = public.get_current_user_organization_id()
)
WITH CHECK (
  organization_id = public.get_current_user_organization_id()
  AND public.current_user_has_permission('configuracoes', 'edit')
);

-- Delete: row must belong to caller org and require edit permission
CREATE POLICY "Companies: delete by permission and org"
ON public.companies
FOR DELETE
USING (
  organization_id = public.get_current_user_organization_id()
  AND public.current_user_has_permission('configuracoes', 'edit')
);

COMMIT;