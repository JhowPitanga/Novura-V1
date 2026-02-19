BEGIN;

ALTER TABLE public.marketplace_order_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE, INSERT ON public.marketplace_order_items TO authenticated;
REVOKE SELECT, UPDATE, INSERT ON public.marketplace_order_items FROM anon;

DROP POLICY IF EXISTS "Members can view marketplace_order_items" ON public.marketplace_order_items;
CREATE POLICY "Members can view marketplace_order_items"
ON public.marketplace_order_items
FOR SELECT
USING (
  id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new p
    WHERE p.id = public.marketplace_order_items.id
      AND p.organizations_id IS NOT NULL
      AND (public.is_org_member(auth.uid(), p.organizations_id) OR auth.role() = 'service_role')
  )
);

DROP POLICY IF EXISTS "Members can update marketplace_order_items" ON public.marketplace_order_items;
CREATE POLICY "Members can update marketplace_order_items"
ON public.marketplace_order_items
FOR UPDATE
USING (
  id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new p
    WHERE p.id = public.marketplace_order_items.id
      AND p.organizations_id IS NOT NULL
      AND (public.is_org_member(auth.uid(), p.organizations_id) OR auth.role() = 'service_role')
  )
);

DROP POLICY IF EXISTS "Owners/Admins can insert marketplace_order_items" ON public.marketplace_order_items;
CREATE POLICY "Owners/Admins can insert marketplace_order_items"
ON public.marketplace_order_items
FOR INSERT
WITH CHECK (
  id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new p
    WHERE p.id = public.marketplace_order_items.id
      AND p.organizations_id IS NOT NULL
      AND (public.has_org_role(auth.uid(), p.organizations_id, ARRAY['owner','admin']) OR auth.role() = 'service_role')
  )
);

COMMIT;
