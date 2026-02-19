BEGIN;

ALTER TABLE public.marketplace_order_items
  ADD COLUMN IF NOT EXISTS has_unlinked_items boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inventory_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.marketplace_orders_presented_new(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('reserve','consume','refund')),
  status text NOT NULL CHECK (status IN ('pending','processing','done','failed')) DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error_log text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, job_type)
);

CREATE INDEX IF NOT EXISTS idx_inventory_jobs_order ON public.inventory_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_jobs_status ON public.inventory_jobs(status);
CREATE INDEX IF NOT EXISTS idx_inventory_jobs_next_attempt ON public.inventory_jobs(next_attempt_at);

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS order_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.conname = 'inventory_transactions_order_id_to_presented_new'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.inventory_transactions
      ADD CONSTRAINT inventory_transactions_order_id_to_presented_new
      FOREIGN KEY (order_id)
      REFERENCES public.marketplace_orders_presented_new(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_order_id_presented_new
  ON public.inventory_transactions(order_id);

COMMIT;
