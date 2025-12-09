BEGIN;

ALTER TABLE public.marketplace_orders_presented_new ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE, INSERT ON public.marketplace_orders_presented_new TO authenticated;
REVOKE SELECT, UPDATE, INSERT ON public.marketplace_orders_presented_new FROM anon;

DROP POLICY IF EXISTS "Members can update marketplace_orders_presented_new" ON public.marketplace_orders_presented_new;
CREATE POLICY "Members can update marketplace_orders_presented_new"
ON public.marketplace_orders_presented_new
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Owners/Admins can insert marketplace_orders_presented_new" ON public.marketplace_orders_presented_new;
CREATE POLICY "Owners/Admins can insert marketplace_orders_presented_new"
ON public.marketplace_orders_presented_new
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

COMMIT;
