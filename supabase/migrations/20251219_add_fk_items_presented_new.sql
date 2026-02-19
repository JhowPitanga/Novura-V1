BEGIN;

ALTER TABLE public.marketplace_order_items
  ADD CONSTRAINT fk_moi_presented_new_id
  FOREIGN KEY (id)
  REFERENCES public.marketplace_orders_presented_new(id)
  ON DELETE CASCADE;

COMMIT;
