-- Secure SELECT policy: global rows visible to members, org-bound rows visible only to owners/admins
DROP POLICY IF EXISTS "Apps: members can view" ON public.apps;
CREATE POLICY "Apps: global members view; org owners/admins view"
ON public.apps
FOR SELECT
USING (
  organizations_id IS NULL
  OR public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);