-- Create marketplace_items table to store ads from marketplaces (initially Mercado Livre)
-- Includes organization isolation, helpful indexes, RLS policies, and Realtime publication

-- 1) Table definition
CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id BIGSERIAL PRIMARY KEY,
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  marketplace_name text NOT NULL,
  marketplace_item_id text NOT NULL,
  title text,
  sku text,
  condition text,
  status text,
  price numeric(12,2),
  available_quantity integer,
  sold_quantity integer,
  category_id text,
  permalink text,
  attributes jsonb,
  variations jsonb,
  pictures jsonb,
  tags jsonb,
  seller_id text,
  data jsonb,
  published_at timestamptz,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2) Uniqueness to avoid duplicates per org+marketplace+item
ALTER TABLE public.marketplace_items
  ADD CONSTRAINT uq_marketplace_items_org_marketplace_item UNIQUE (organizations_id, marketplace_name, marketplace_item_id);

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_items_org ON public.marketplace_items(organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_marketplace ON public.marketplace_items(marketplace_name);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_item_id ON public.marketplace_items(marketplace_item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_status ON public.marketplace_items(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_company ON public.marketplace_items(company_id);

-- 4) Enable RLS
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;

-- 5) Policies
-- SELECT: allow members of the org to view items
DROP POLICY IF EXISTS "Marketplace items: members can view" ON public.marketplace_items;
CREATE POLICY "Marketplace items: members can view"
ON public.marketplace_items
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

-- INSERT: service-side writes or privileged roles; require org match and owners/admins
DROP POLICY IF EXISTS "Marketplace items: owners/admins can insert" ON public.marketplace_items;
CREATE POLICY "Marketplace items: owners/admins can insert"
ON public.marketplace_items
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- UPDATE: only owners/admins in the row org
DROP POLICY IF EXISTS "Marketplace items: owners/admins can update" ON public.marketplace_items;
CREATE POLICY "Marketplace items: owners/admins can update"
ON public.marketplace_items
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- DELETE: only owners/admins in the row org
DROP POLICY IF EXISTS "Marketplace items: owners/admins can delete" ON public.marketplace_items;
CREATE POLICY "Marketplace items: owners/admins can delete"
ON public.marketplace_items
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- 6) Realtime replication
ALTER TABLE public.marketplace_items REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_items';
  END IF;
END $$;