-- Cycle 0: order_labels table. label_type as plain text (no CHECK).

CREATE TABLE IF NOT EXISTS order_labels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  label_type      text NOT NULL,
  content_base64  text NOT NULL,
  content_type    text NOT NULL,
  size_bytes      integer,
  fetched_at      timestamptz DEFAULT now(),

  CONSTRAINT order_labels_order_type_unique UNIQUE (order_id, label_type)
);

CREATE INDEX order_labels_order_id_idx ON order_labels (order_id);

ALTER TABLE order_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_labels
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
