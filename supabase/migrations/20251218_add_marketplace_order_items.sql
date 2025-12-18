BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  model_sku_externo text,
  model_id_externo text,
  variation_name text,
  sku text,
  item_name text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  image_url text,
  stock_status text
);

ALTER TABLE public.marketplace_order_items
  ADD COLUMN IF NOT EXISTS pack_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'fk_marketplace_order_items_order'
      AND n.nspname = 'public'
      AND t.relname = 'marketplace_order_items'
  ) THEN
    ALTER TABLE public.marketplace_order_items
      ADD CONSTRAINT fk_marketplace_order_items_order
      FOREIGN KEY (order_id)
      REFERENCES public.marketplace_orders_presented_new(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order_id
  ON public.marketplace_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_pack_id
  ON public.marketplace_order_items(pack_id);

ALTER TABLE public.marketplace_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Marketplace order items: members can view" ON public.marketplace_order_items;
CREATE POLICY "Marketplace order items: members can view"
ON public.marketplace_order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new mo
    WHERE mo.id = public.marketplace_order_items.order_id
      AND (public.is_org_member(auth.uid(), mo.organizations_id) OR auth.role() = 'service_role')
  )
);

DROP POLICY IF EXISTS "Marketplace order items: owners/admins can insert" ON public.marketplace_order_items;
CREATE POLICY "Marketplace order items: owners/admins can insert"
ON public.marketplace_order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new mo
    WHERE mo.id = public.marketplace_order_items.order_id
      AND public.has_org_role(auth.uid(), mo.organizations_id, ARRAY['owner','admin'])
  )
);

DROP POLICY IF EXISTS "Marketplace order items: members can insert" ON public.marketplace_order_items;
CREATE POLICY "Marketplace order items: members can insert"
ON public.marketplace_order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new mo
    WHERE mo.id = public.marketplace_order_items.order_id
      AND (public.is_org_member(auth.uid(), mo.organizations_id) OR auth.role() = 'service_role')
  )
);

DROP POLICY IF EXISTS "Marketplace order items: owners/admins can update" ON public.marketplace_order_items;
CREATE POLICY "Marketplace order items: owners/admins can update"
ON public.marketplace_order_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new mo
    WHERE mo.id = public.marketplace_order_items.order_id
      AND public.has_org_role(auth.uid(), mo.organizations_id, ARRAY['owner','admin'])
  )
);

DROP POLICY IF EXISTS "Marketplace order items: owners/admins can delete" ON public.marketplace_order_items;
CREATE POLICY "Marketplace order items: owners/admins can delete"
ON public.marketplace_order_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new mo
    WHERE mo.id = public.marketplace_order_items.order_id
      AND public.has_org_role(auth.uid(), mo.organizations_id, ARRAY['owner','admin'])
  )
);

DROP POLICY IF EXISTS "Marketplace order items: members can delete" ON public.marketplace_order_items;
CREATE POLICY "Marketplace order items: members can delete"
ON public.marketplace_order_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.marketplace_orders_presented_new mo
    WHERE mo.id = public.marketplace_order_items.order_id
      AND public.is_org_member(auth.uid(), mo.organizations_id)
  )
);

GRANT SELECT ON public.marketplace_order_items TO authenticated;
REVOKE SELECT ON public.marketplace_order_items FROM anon;
GRANT INSERT, UPDATE, DELETE ON public.marketplace_order_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_order_items FROM anon;

COMMIT;
