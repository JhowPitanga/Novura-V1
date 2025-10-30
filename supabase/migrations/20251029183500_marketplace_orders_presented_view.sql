-- Create a sanitized presentation view for marketplace orders tailored for frontend display
-- This view exposes only essential columns and derives normalized fields from jsonb,
-- while restricting rows to the caller's organizations via get_my_organizations().

CREATE OR REPLACE VIEW public.marketplace_orders_presented AS
WITH base AS (
  SELECT
    mo.id,
    mo.organizations_id,
    mo.company_id,
    mo.marketplace_name AS marketplace,
    mo.marketplace_order_id,
    mo.status,
    mo.status_detail,
    mo.order_items,
    mo.payments,
    mo.shipments,
    mo.buyer,
    mo.date_created AS created_at,
    mo.last_updated,
    mo.last_synced_at,
    mo.data
  FROM public.marketplace_orders_raw mo
  WHERE (
    mo.organizations_id IN (SELECT id FROM public.get_my_organizations())
    OR mo.organizations_id IS NULL
  )
), items AS (
  SELECT
    b.id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'product_name', COALESCE(i->>'title', i->'item'->>'title'),
          'quantity', (i->>'quantity')::int,
          'sku', COALESCE(i->'item'->>'seller_sku', i->>'seller_sku'),
          'price_per_unit', COALESCE((i->>'unit_price')::numeric, (i->>'price')::numeric)
        )
      ) FILTER (WHERE i IS NOT NULL),
      '[]'::jsonb
    ) AS order_items_simplified
  FROM base b
  LEFT JOIN LATERAL jsonb_array_elements(b.order_items) AS i ON true
  GROUP BY b.id
)
SELECT
  b.id,
  b.organizations_id,
  b.company_id,
  b.marketplace,
  b.marketplace_order_id,
  b.status,
  b.status_detail,
  COALESCE((b.data->>'total_amount')::numeric, NULL) AS order_total,
  COALESCE(b.shipments->0->>'logistic_type', b.data->'shipping'->>'logistic_type') AS shipping_type,
  COALESCE(b.buyer->>'nickname', trim(concat_ws(' ', b.buyer->>'first_name', b.buyer->>'last_name'))) AS customer_name,
  b.payments,
  b.shipments,
  b.data,
  b.created_at,
  b.last_updated,
  b.last_synced_at,
  items.order_items_simplified AS order_items
FROM base b
LEFT JOIN items ON items.id = b.id;

GRANT SELECT ON public.marketplace_orders_presented TO authenticated;
GRANT SELECT ON public.marketplace_orders_presented TO anon;