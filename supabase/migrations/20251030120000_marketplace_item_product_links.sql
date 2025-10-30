-- Table to persist links between marketplace ads (items) and ERP products
-- Includes organization isolation, indexes, RLS policies, and Realtime publication

-- 1) Table definition
CREATE TABLE IF NOT EXISTS public.marketplace_item_product_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_name text NOT NULL,
  marketplace_item_id text NOT NULL,
  variation_id text NOT NULL DEFAULT '', -- empty string when no variation, enables uniqueness
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  permanent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2) Uniqueness: one mapping per org + marketplace + item (+ variation)
ALTER TABLE public.marketplace_item_product_links
  ADD CONSTRAINT uq_marketplace_item_product_links UNIQUE (organizations_id, marketplace_name, marketplace_item_id, variation_id);

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_mipl_org ON public.marketplace_item_product_links(organizations_id);
CREATE INDEX IF NOT EXISTS idx_mipl_marketplace ON public.marketplace_item_product_links(marketplace_name);
CREATE INDEX IF NOT EXISTS idx_mipl_item_id ON public.marketplace_item_product_links(marketplace_item_id);
CREATE INDEX IF NOT EXISTS idx_mipl_product ON public.marketplace_item_product_links(product_id);
CREATE INDEX IF NOT EXISTS idx_mipl_company ON public.marketplace_item_product_links(company_id);

-- 4) Enable RLS
ALTER TABLE public.marketplace_item_product_links ENABLE ROW LEVEL SECURITY;

-- 5) Policies (mirror marketplace_items style)
DROP POLICY IF EXISTS "Links: members can view" ON public.marketplace_item_product_links;
CREATE POLICY "Links: members can view"
ON public.marketplace_item_product_links
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Links: owners/admins can insert" ON public.marketplace_item_product_links;
CREATE POLICY "Links: owners/admins can insert"
ON public.marketplace_item_product_links
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Links: owners/admins can update" ON public.marketplace_item_product_links;
CREATE POLICY "Links: owners/admins can update"
ON public.marketplace_item_product_links
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Links: owners/admins can delete" ON public.marketplace_item_product_links;
CREATE POLICY "Links: owners/admins can delete"
ON public.marketplace_item_product_links
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- 6) Realtime replication
ALTER TABLE public.marketplace_item_product_links REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_item_product_links';
  END IF;
END $$;