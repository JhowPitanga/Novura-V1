BEGIN;

ALTER TABLE public.marketplace_orders_presented_new
  ADD COLUMN IF NOT EXISTS shipping_info jsonb;

ALTER TABLE public.marketplace_orders_presented_new
  DROP COLUMN IF EXISTS shipping_info_needed,
  DROP COLUMN IF EXISTS shipping_dropoff,
  DROP COLUMN IF EXISTS shipping_package_number,
  DROP COLUMN IF EXISTS ship_order_payload,
  DROP COLUMN IF EXISTS ship_order_channel;

COMMIT;
