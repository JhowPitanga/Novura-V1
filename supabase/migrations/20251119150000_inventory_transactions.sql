BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_id uuid NOT NULL REFERENCES public.storage(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('ENTRADA','SAIDA','RESERVA','CANCELAMENTO_RESERVA')),
  quantity_change numeric NOT NULL,
  timestamp timestamptz DEFAULT now(),
  source_ref text
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_org ON public.inventory_transactions(organizations_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_order ON public.inventory_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company ON public.inventory_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product ON public.inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_storage ON public.inventory_transactions(storage_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_timestamp ON public.inventory_transactions(timestamp DESC);

ALTER TABLE public.products_stock
  ADD COLUMN IF NOT EXISTS available numeric GENERATED ALWAYS AS (current - COALESCE(reserved, 0)) STORED;

COMMIT;