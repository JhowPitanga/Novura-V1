-- Cycle 0: orders table (internal status = status, marketplace status = marketplace_status)
-- No PostgreSQL enums. No CHECK(marketplace IN). No raw_snapshot. numeric(18,6) for monetary columns.

CREATE TABLE IF NOT EXISTS orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  marketplace           text NOT NULL,
  marketplace_order_id  text NOT NULL,
  pack_id               text,
  status                text,
  marketplace_status    text NOT NULL DEFAULT 'unknown',
  payment_status        text,
  gross_amount          numeric(18,6),
  marketplace_fee       numeric(18,6),
  shipping_cost         numeric(18,6),
  shipping_subsidy      numeric(18,6) DEFAULT 0,
  net_amount            numeric(18,6),
  buyer_name            text,
  buyer_document        text,
  buyer_email           text,
  buyer_phone           text,
  buyer_state           text,
  created_at            timestamptz,
  shipped_at            timestamptz,
  delivered_at          timestamptz,
  canceled_at           timestamptz,
  last_synced_at        timestamptz DEFAULT now(),

  CONSTRAINT orders_marketplace_unique UNIQUE (organization_id, marketplace, marketplace_order_id)
);

CREATE INDEX orders_org_id_idx ON orders (organization_id);
CREATE INDEX orders_marketplace_idx ON orders (marketplace);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_marketplace_status_idx ON orders (marketplace_status);
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX orders_org_created_idx ON orders (organization_id, created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON orders
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
