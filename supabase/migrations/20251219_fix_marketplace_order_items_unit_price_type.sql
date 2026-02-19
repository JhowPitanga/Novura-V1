BEGIN;

ALTER TABLE public.marketplace_order_items
  ALTER COLUMN unit_price TYPE numeric USING unit_price::numeric;

COMMIT;
