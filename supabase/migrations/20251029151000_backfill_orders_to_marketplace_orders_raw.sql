-- Backfill data from simplified orders/order_items into marketplace_orders_raw
-- Then empty orders and order_items as requested

BEGIN;

-- Guard: ensure target table exists
DO $$
BEGIN
  IF to_regclass('public.marketplace_orders_raw') IS NULL THEN
    RAISE EXCEPTION 'Table public.marketplace_orders_raw does not exist. Run the rename migration first.';
  END IF;
END $$;

-- Aggregate order_items per order into JSONB
WITH order_items_agg AS (
  SELECT
    oi.order_id,
    jsonb_agg(
      jsonb_build_object(
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'sku', oi.sku,
        'price_per_unit', oi.price_per_unit
      )
      ORDER BY oi.id
    ) AS items_json
  FROM public.order_items oi
  GROUP BY oi.order_id
)
-- Insert or update raw orders using data from orders
INSERT INTO public.marketplace_orders_raw (
  organizations_id,
  company_id,
  marketplace_name,
  marketplace_order_id,
  status,
  status_detail,
  order_items,
  payments,
  shipments,
  buyer,
  seller,
  feedback,
  tags,
  data,
  date_created,
  date_closed,
  last_updated,
  last_synced_at,
  updated_at
)
SELECT
  c.organization_id,
  o.company_id,
  COALESCE(o.marketplace, 'Mercado Livre') AS marketplace_name,
  o.marketplace_order_id,
  o.status,
  NULL::text AS status_detail,
  COALESCE(oi.items_json, '[]'::jsonb) AS order_items,
  NULL::jsonb AS payments,
  NULL::jsonb AS shipments,
  NULL::jsonb AS buyer,
  NULL::jsonb AS seller,
  NULL::jsonb AS feedback,
  NULL::jsonb AS tags,
  jsonb_build_object('source', 'orders_backfill', 'orders_row', to_jsonb(o), 'order_items', COALESCE(oi.items_json, '[]'::jsonb)) AS data,
  o.created_at::timestamptz,
  NULL::timestamptz AS date_closed,
  o.created_at::timestamptz AS last_updated,
  now()::timestamptz AS last_synced_at,
  now()::timestamptz AS updated_at
FROM public.orders o
LEFT JOIN public.companies c ON c.id = o.company_id
LEFT JOIN order_items_agg oi ON oi.order_id = o.id
WHERE o.marketplace_order_id IS NOT NULL
ON CONFLICT (organizations_id, marketplace_name, marketplace_order_id)
DO UPDATE SET
  status = EXCLUDED.status,
  order_items = EXCLUDED.order_items,
  data = EXCLUDED.data,
  last_updated = EXCLUDED.last_updated,
  last_synced_at = EXCLUDED.last_synced_at,
  updated_at = EXCLUDED.updated_at;

-- Optional cleanup: remove duplicates with NULL organizations_id when a non-NULL row exists for the same order
DELETE FROM public.marketplace_orders_raw r
WHERE r.organizations_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.marketplace_orders_raw r2
    WHERE r2.organizations_id IS NOT NULL
      AND r2.marketplace_name = r.marketplace_name
      AND r2.marketplace_order_id = r.marketplace_order_id
  );

-- Empty the simplified tables as requested
-- Use DELETE to avoid cascading into unrelated tables that reference orders
DELETE FROM public.order_items;
DELETE FROM public.orders;

COMMIT;