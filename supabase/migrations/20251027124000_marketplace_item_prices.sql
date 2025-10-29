-- Tabela normalizada para preços e taxas dos anúncios (Mercado Livre)
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_name text NOT NULL DEFAULT 'Mercado Livre',
  marketplace_item_id text NOT NULL,
  -- Preço de venda atual (sale_price)
  sale_price_amount numeric,
  sale_price_regular_amount numeric,
  sale_price_currency_id text,
  sale_price_context jsonb,
  -- Comissão por vender / listing_prices
  listing_prices jsonb,
  -- Preços por quantidade (wholesale)
  prices_by_quantity jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Evita duplicação por item/organização/marketplace
ALTER TABLE public.marketplace_item_prices
  ADD CONSTRAINT uq_marketplace_item_prices_org_marketplace_item UNIQUE (organizations_id, marketplace_name, marketplace_item_id);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_marketplace_item_prices_org ON public.marketplace_item_prices(organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_item_prices_item ON public.marketplace_item_prices(marketplace_item_id);

-- RLS
ALTER TABLE public.marketplace_item_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Item prices: members can view" ON public.marketplace_item_prices;
CREATE POLICY "Item prices: members can view"
ON public.marketplace_item_prices
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Item prices: owners/admins can insert" ON public.marketplace_item_prices;
CREATE POLICY "Item prices: owners/admins can insert"
ON public.marketplace_item_prices
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Item prices: owners/admins can update" ON public.marketplace_item_prices;
CREATE POLICY "Item prices: owners/admins can update"
ON public.marketplace_item_prices
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Item prices: owners/admins can delete" ON public.marketplace_item_prices;
CREATE POLICY "Item prices: owners/admins can delete"
ON public.marketplace_item_prices
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- Realtime publication
ALTER TABLE public.marketplace_item_prices REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_item_prices';
  END IF;
END $$;

-- TTL auxiliar em marketplace_items
ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS last_prices_update timestamptz;

-- Índice útil para ordenar por atualização de preço
CREATE INDEX IF NOT EXISTS idx_marketplace_items_last_prices_update
  ON public.marketplace_items (organizations_id, last_prices_update DESC);

COMMIT;