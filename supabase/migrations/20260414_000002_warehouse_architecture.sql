-- ============================================================
-- WAREHOUSE-T1: Warehouse Architecture Schema
-- Adds warehouse type/integration columns to storage,
-- creates integration_warehouse_config and fulfillment_stock,
-- adds storage_id to orders for warehouse resolution tracking.
-- ============================================================

-- 1. Evolve storage table: add warehouse type and integration columns
ALTER TABLE public.storage
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'physical'
    CHECK (type IN ('physical', 'fulfillment')),
  ADD COLUMN IF NOT EXISTS integration_id uuid
    REFERENCES public.marketplace_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketplace_name text,
  ADD COLUMN IF NOT EXISTS is_auto_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS readonly boolean NOT NULL DEFAULT false;

-- Backfill: all existing storage records are physical warehouses
UPDATE public.storage SET type = 'physical' WHERE type IS NULL;

CREATE INDEX IF NOT EXISTS idx_storage_integration_id
  ON public.storage (integration_id)
  WHERE integration_id IS NOT NULL;

-- 2. Create integration_warehouse_config: maps each integration to its warehouses
CREATE TABLE IF NOT EXISTS public.integration_warehouse_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id        uuid NOT NULL REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE,
  physical_storage_id   uuid NOT NULL REFERENCES public.storage(id) ON DELETE RESTRICT,
  fulfillment_storage_id uuid REFERENCES public.storage(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_id)
);

ALTER TABLE public.integration_warehouse_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage integration_warehouse_config"
  ON public.integration_warehouse_config
  FOR ALL
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages integration_warehouse_config"
  ON public.integration_warehouse_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_iwc_integration_id
  ON public.integration_warehouse_config (integration_id);

CREATE INDEX IF NOT EXISTS idx_iwc_organization_id
  ON public.integration_warehouse_config (organization_id);

-- 3. Create fulfillment_stock: stores fulfillment stock per product/listing synced from marketplace APIs
CREATE TABLE IF NOT EXISTS public.fulfillment_stock (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_id          uuid NOT NULL REFERENCES public.storage(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  marketplace_item_id text NOT NULL,
  variation_id        text NOT NULL DEFAULT '',
  quantity            integer NOT NULL DEFAULT 0,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_id, product_id, marketplace_item_id, variation_id)
);

ALTER TABLE public.fulfillment_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view fulfillment_stock"
  ON public.fulfillment_stock
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages fulfillment_stock"
  ON public.fulfillment_stock
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fulfillment_stock_organization_id
  ON public.fulfillment_stock (organization_id);

CREATE INDEX IF NOT EXISTS idx_fulfillment_stock_storage_product
  ON public.fulfillment_stock (storage_id, product_id);

CREATE INDEX IF NOT EXISTS idx_fulfillment_stock_product_id
  ON public.fulfillment_stock (product_id);

-- 4. Add storage_id to orders: records which warehouse resolved for each order
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS storage_id uuid
    REFERENCES public.storage(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_storage_id
  ON public.orders (storage_id)
  WHERE storage_id IS NOT NULL;
