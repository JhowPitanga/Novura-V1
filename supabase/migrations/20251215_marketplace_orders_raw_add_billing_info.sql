BEGIN;

ALTER TABLE public.marketplace_orders_raw
  ADD COLUMN IF NOT EXISTS billing_info jsonb;

COMMIT;

