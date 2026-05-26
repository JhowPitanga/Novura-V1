-- Cycle 0: order_items table. numeric(18,6) for unit_price, unit_cost.
-- RLS via subquery (no organization_id on this table).

CREATE TABLE IF NOT EXISTS order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id            uuid REFERENCES products(id) ON DELETE SET NULL,
  marketplace_item_id   text,
  sku                   text,
  title                 text NOT NULL,
  quantity              integer NOT NULL DEFAULT 1,
  unit_price            numeric(18,6) NOT NULL,
  unit_cost             numeric(18,6),
  variation_name        text,
  image_url             text
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);
CREATE INDEX order_items_sku_idx ON order_items (sku);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_items
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
