-- C0-T10: Add internal_status and has_unlinked_items to orders.
-- Also adds UNIQUE on order_items(order_id, marketplace_item_id) so syncs can UPSERT
-- without losing the product_id column set during manual linking.
-- Fixes the order_items RLS policy that incorrectly referenced the profiles table.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_unlinked_items boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_internal_status_idx ON orders (internal_status);
CREATE INDEX IF NOT EXISTS orders_has_unlinked_idx ON orders (has_unlinked_items) WHERE has_unlinked_items = true;

-- Unique constraint so OrdersUpsertAdapter can UPSERT items without deleting product_id.
ALTER TABLE order_items
  ADD CONSTRAINT IF NOT EXISTS order_items_order_marketplace_item_unique
  UNIQUE (order_id, marketplace_item_id);

-- Fix order_items RLS (profiles table does not exist in this schema).
DROP POLICY IF EXISTS "org_isolation" ON order_items;
CREATE POLICY "org_isolation" ON order_items
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE organization_id = public.get_current_user_organization_id()
    )
  );
