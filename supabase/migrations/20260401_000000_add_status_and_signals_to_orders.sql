-- STATUS-ENGINE-T8: add status engine signal columns to orders
BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipment_status text,
  ADD COLUMN IF NOT EXISTS shipment_substatus text,
  ADD COLUMN IF NOT EXISTS is_fulfillment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_refunded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_returned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_printed_label boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label_printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pickup_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- status may already exist in Cycle 0; keep idempotent
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS status text;

CREATE INDEX IF NOT EXISTS idx_orders_organization_status
  ON orders (organization_id, status)
  WHERE status IS NOT NULL;

COMMIT;
