-- Tabela normalizada para Shipments do Mercado Livre
-- Segue padrão de isolamento por organização, índices úteis, RLS e Realtime

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,

  marketplace_name text NOT NULL DEFAULT 'Mercado Livre',
  marketplace_shipment_id text NOT NULL,
  marketplace_order_id text NOT NULL,

  -- Campos principais de status e modalidade logística
  status text,
  substatus text,
  logistic_type text,
  mode text,
  shipping_mode text,
  service_id text,

  -- Rastreamento
  carrier text,
  tracking_number text,
  tracking_url text,
  tracking_history jsonb,

  -- Endereços e custos
  receiver_address jsonb,
  sender_address jsonb,
  costs jsonb,

  -- Itens, promessas e metadados
  items jsonb,
  promise jsonb,
  tags jsonb,
  dimensions jsonb,
  data jsonb,

  -- Datas relevantes
  date_created timestamptz,
  last_updated timestamptz,
  date_ready_to_ship timestamptz,
  date_first_printed timestamptz,

  -- Controle de sincronização
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Evita duplicação por organização+marketplace+shipment_id
ALTER TABLE public.marketplace_shipments
  ADD CONSTRAINT uq_marketplace_shipments_org_marketplace_shipment
  UNIQUE (organizations_id, marketplace_name, marketplace_shipment_id);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_org
  ON public.marketplace_shipments (organizations_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_shipment_id
  ON public.marketplace_shipments (marketplace_shipment_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_order_id
  ON public.marketplace_shipments (marketplace_order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_status
  ON public.marketplace_shipments (status);
CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_last_updated
  ON public.marketplace_shipments (organizations_id, last_updated DESC);

-- RLS
ALTER TABLE public.marketplace_shipments ENABLE ROW LEVEL SECURITY;

-- SELECT: membros da organização podem visualizar
DROP POLICY IF EXISTS "Marketplace shipments: members can view" ON public.marketplace_shipments;
CREATE POLICY "Marketplace shipments: members can view"
ON public.marketplace_shipments
FOR SELECT
USING (
  organizations_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organizations_id)
);

-- INSERT: owners/admins
DROP POLICY IF EXISTS "Marketplace shipments: owners/admins can insert" ON public.marketplace_shipments;
CREATE POLICY "Marketplace shipments: owners/admins can insert"
ON public.marketplace_shipments
FOR INSERT
WITH CHECK (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- UPDATE: owners/admins
DROP POLICY IF EXISTS "Marketplace shipments: owners/admins can update" ON public.marketplace_shipments;
CREATE POLICY "Marketplace shipments: owners/admins can update"
ON public.marketplace_shipments
FOR UPDATE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- DELETE: owners/admins
DROP POLICY IF EXISTS "Marketplace shipments: owners/admins can delete" ON public.marketplace_shipments;
CREATE POLICY "Marketplace shipments: owners/admins can delete"
ON public.marketplace_shipments
FOR DELETE
USING (
  organizations_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

-- Realtime publication
ALTER TABLE public.marketplace_shipments REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_shipments';
  END IF;
END $$;

COMMIT;