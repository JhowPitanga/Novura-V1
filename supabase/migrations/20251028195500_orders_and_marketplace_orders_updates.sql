-- Atualizações de esquema para suportar sincronização de pedidos do Mercado Livre
-- 1) Adiciona colunas necessárias em public.orders
-- 2) Cria/ajusta public.marketplace_orders com chave única composta
-- 3) Índices auxiliares

BEGIN;

-- 1) Atualizações na tabela orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS marketplace text,
  ADD COLUMN IF NOT EXISTS marketplace_order_id text,
  ADD COLUMN IF NOT EXISTS order_total numeric(18,2),
  ADD COLUMN IF NOT EXISTS order_cost numeric(18,2),
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text,
  ADD COLUMN IF NOT EXISTS shipping_zip_code text,
  ADD COLUMN IF NOT EXISTS shipping_type text,
  ADD COLUMN IF NOT EXISTS platform_id text;

-- Índice para busca por pedido do marketplace dentro da empresa
CREATE INDEX IF NOT EXISTS idx_orders_company_marketplace_order_id
  ON public.orders (company_id, marketplace_order_id);

-- 2) Tabela marketplace_orders
CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  marketplace_name text NOT NULL,
  marketplace_order_id text NOT NULL,
  status text,
  status_detail text,
  order_items jsonb,
  payments jsonb,
  shipments jsonb,
  buyer jsonb,
  seller jsonb,
  feedback jsonb,
  tags jsonb,
  data jsonb,
  date_created timestamptz,
  date_closed timestamptz,
  last_updated timestamptz,
  last_synced_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Restrição única composta para upsert (organizations_id, marketplace_name, marketplace_order_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketplace_orders_org_marketplace_order_key'
  ) THEN
    ALTER TABLE public.marketplace_orders
      ADD CONSTRAINT marketplace_orders_org_marketplace_order_key
      UNIQUE (organizations_id, marketplace_name, marketplace_order_id);
  END IF;
END $$;

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_org ON public.marketplace_orders (organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_company ON public.marketplace_orders (company_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_order_id ON public.marketplace_orders (marketplace_order_id);

-- 3) Índice composto útil para deleção seletiva em order_items (order_id + marketplace_item_id)
CREATE INDEX IF NOT EXISTS idx_order_items_order_marketplace_item
  ON public.order_items (order_id, marketplace_item_id);

COMMIT;