BEGIN;

ALTER TABLE public.marketplace_orders_presented_new ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.marketplace_orders_presented_new TO authenticated;
REVOKE SELECT ON public.marketplace_orders_presented_new FROM anon;

DROP POLICY IF EXISTS "Members can view marketplace_orders_presented_new" ON public.marketplace_orders_presented_new;
CREATE POLICY "Members can view marketplace_orders_presented_new"
ON public.marketplace_orders_presented_new
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

COMMIT;
