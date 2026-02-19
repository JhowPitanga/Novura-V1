BEGIN;

ALTER TABLE public.marketplace_orders_presented_new
  ADD COLUMN IF NOT EXISTS tracking_number text;

ALTER TABLE public.marketplace_orders_presented_new
  ADD COLUMN IF NOT EXISTS ship_order_planned_at timestamptz;

COMMIT;
