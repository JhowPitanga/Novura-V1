-- Cycle 0: order_shipping table. One row per order.

CREATE TABLE IF NOT EXISTS order_shipping (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id           text,
  logistic_type         text,
  tracking_number       text,
  carrier               text,
  status                text,
  substatus             text,
  street_name           text,
  street_number         text,
  complement            text,
  neighborhood          text,
  city                  text,
  state_uf              text,
  zip_code              text,
  country               text DEFAULT 'BR',
  sla_expected_date     timestamptz,
  sla_status            text,
  estimated_delivery    timestamptz,
  updated_at            timestamptz DEFAULT now(),

  CONSTRAINT order_shipping_order_unique UNIQUE (order_id)
);

CREATE INDEX order_shipping_order_id_idx ON order_shipping (order_id);
CREATE INDEX order_shipping_tracking_idx ON order_shipping (tracking_number);

ALTER TABLE order_shipping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_shipping
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
