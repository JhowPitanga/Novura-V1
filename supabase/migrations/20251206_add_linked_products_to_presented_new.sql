BEGIN;

ALTER TABLE public.marketplace_orders_presented_new
  ADD COLUMN IF NOT EXISTS linked_products jsonb;

COMMIT;
