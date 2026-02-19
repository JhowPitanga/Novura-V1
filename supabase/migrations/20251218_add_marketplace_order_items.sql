BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_sku_externo text,
  model_id_externo text,
  variation_name text,
  pack_id text,
  linked_products text,
  item_name text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  image_url text,
);
