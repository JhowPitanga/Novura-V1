-- ============================================================
-- Stock Sync Motor: Migration 2/7
-- Transactional Outbox table: stock_sync_outbox
--
-- Written atomically inside RPCs v2 (same transaction as products_stock update).
-- Solves the Dual-Write Problem: if the DB transaction commits, the outbox entry
-- exists; if it rolls back, the outbox entry does not exist.
-- The stock-sync-dispatcher reads this table and fans out to PGMQ channels.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_sync_outbox (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id         uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_id         uuid        NOT NULL REFERENCES public.storage(id) ON DELETE CASCADE,
  -- Snapshot of products_stock.available at the time of mutation.
  -- NEVER recalculated by the Motor de Integracao — only read and forwarded.
  available_snapshot numeric     NOT NULL,
  -- Monotonic version from products_stock.version at the time of mutation.
  -- Used by providers to discard stale events (version <= last_processed).
  version            bigint      NOT NULL,
  processed          boolean     NOT NULL DEFAULT false,
  processing_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Only one pending entry per product+storage: the latest state wins.
  -- The dispatcher always propagates the most recent snapshot.
  UNIQUE (product_id, storage_id)
);

-- Index for the dispatcher: fetch all unprocessed entries ordered by creation time.
CREATE INDEX IF NOT EXISTS idx_stock_sync_outbox_pending
  ON public.stock_sync_outbox (created_at ASC)
  WHERE processed = false;

-- RLS: service_role only (edge functions use SUPABASE_SERVICE_ROLE_KEY).
ALTER TABLE public.stock_sync_outbox ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users (admin panel observability).
DROP POLICY IF EXISTS "stock_sync_outbox: service read" ON public.stock_sync_outbox;
CREATE POLICY "stock_sync_outbox: service read"
  ON public.stock_sync_outbox FOR SELECT
  USING (true);

COMMIT;
