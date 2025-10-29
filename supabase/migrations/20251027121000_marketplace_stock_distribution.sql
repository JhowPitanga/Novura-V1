-- Tabela para distribuição de estoque por origem/depósito para anúncios
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_stock_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_name text NOT NULL DEFAULT 'Mercado Livre',
  marketplace_item_id text NOT NULL,
  warehouse_id text NOT NULL,
  warehouse_name text,
  quantity integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Evita duplicações por org+marketplace+item+depósito
ALTER TABLE public.marketplace_stock_distribution
  ADD CONSTRAINT uq_marketplace_stock_distribution_org_marketplace_item_warehouse UNIQUE (organizations_id, marketplace_name, marketplace_item_id, warehouse_id);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_marketplace_stock_distribution_org ON public.marketplace_stock_distribution(organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_stock_distribution_item ON public.marketplace_stock_distribution(marketplace_item_id);

-- RLS
ALTER TABLE public.marketplace_stock_distribution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stock distribution: members can view" ON public.marketplace_stock_distribution;
CREATE POLICY "Stock distribution: members can view"
ON public.marketplace_stock_distribution
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Stock distribution: owners/admins can insert" ON public.marketplace_stock_distribution;
CREATE POLICY "Stock distribution: owners/admins can insert"
ON public.marketplace_stock_distribution
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Stock distribution: owners/admins can update" ON public.marketplace_stock_distribution;
CREATE POLICY "Stock distribution: owners/admins can update"
ON public.marketplace_stock_distribution
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Stock distribution: owners/admins can delete" ON public.marketplace_stock_distribution;
CREATE POLICY "Stock distribution: owners/admins can delete"
ON public.marketplace_stock_distribution
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- Realtime publication
ALTER TABLE public.marketplace_stock_distribution REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_stock_distribution';
  END IF;
END $$;

COMMIT;