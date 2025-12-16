BEGIN;
ALTER TABLE public.marketplace_orders_presented_new
  ADD COLUMN IF NOT EXISTS xml_to_submit text;
COMMIT;
