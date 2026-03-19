-- Cycle 0: order_status_history table. Append-only. source as plain text (no CHECK).

CREATE TABLE IF NOT EXISTS order_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL
);

CREATE INDEX order_status_history_order_id_idx ON order_status_history (order_id);
CREATE INDEX order_status_history_changed_at_idx ON order_status_history (changed_at DESC);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_status_history
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
