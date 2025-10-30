-- Recria marketplace_orders_presented com colunas separadas para SLA e atrasos

BEGIN;

DROP VIEW IF EXISTS public.marketplace_orders_presented CASCADE;

CREATE VIEW public.marketplace_orders_presented AS
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
), items_agg AS (
  SELECT
    b.id,
    COUNT(oi) AS items_count,
    COALESCE(SUM(COALESCE((oi->>'quantity')::int, (oi->'requested_quantity'->>'value')::int, 1)), 0) AS items_total_quantity,
    COALESCE(SUM(
      COALESCE((oi->>'unit_price')::numeric, (oi->>'price')::numeric, 0) *
      COALESCE((oi->>'quantity')::int, (oi->'requested_quantity'->>'value')::int, 1)
    ), 0)::numeric AS items_total_amount,
    COALESCE(SUM(
      COALESCE((oi->>'full_unit_price')::numeric, (oi->>'unit_price')::numeric, 0) *
      COALESCE((oi->>'quantity')::int, (oi->'requested_quantity'->>'value')::int, 1)
    ), 0)::numeric AS items_total_full_amount,
    COALESCE(SUM(COALESCE((oi->>'sale_fee')::numeric, 0)), 0)::numeric AS items_total_sale_fee,

    COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(oi->'item'->>'category_id', oi->>'category_id')), NULL), ARRAY[]::text[]) AS category_ids,
    COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT oi->>'listing_type_id'), NULL), ARRAY[]::text[]) AS listing_type_ids,
    COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT oi->'stock'->>'node_id'), NULL), ARRAY[]::text[]) AS stock_node_ids,

    COALESCE(BOOL_OR( (oi->>'bundle') IS NOT NULL ), false) AS has_bundle,
    COALESCE(BOOL_OR( (oi->>'kit_instance_id') IS NOT NULL ), false) AS has_kit,
    COALESCE(BOOL_OR( (oi->'item'->>'variation_id') IS NOT NULL OR jsonb_array_length(COALESCE(oi->'item'->'variation_attributes', '[]'::jsonb)) > 0 ), false) AS has_variations
  FROM base b
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(b.order_items, '[]'::jsonb)) oi ON true
  GROUP BY b.id
), colors AS (
  SELECT
    b.id,
    COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT va->>'value_name'), NULL), ARRAY[]::text[]) AS variation_color_names
  FROM base b
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(b.order_items, '[]'::jsonb)) oi ON true
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(oi->'item'->'variation_attributes', '[]'::jsonb)) va ON (va->>'id' = 'COLOR')
  GROUP BY b.id
), first_item AS (
  SELECT
    b.id,
    fi AS first_item_json
  FROM base b
  LEFT JOIN LATERAL (
    SELECT fi
    FROM jsonb_array_elements(COALESCE(b.order_items, '[]'::jsonb)) fi
    LIMIT 1
  ) sub ON true
)
SELECT
  b.id,
  b.organizations_id,
  b.company_id,
  b.marketplace,
  b.marketplace_order_id,
  b.status,
  b.status_detail,
  COALESCE((b.data->>'total_amount')::numeric, 0) AS order_total,
  COALESCE(
    b.data->'shipping'->>'logistic_type',
    b.shipments->0->'logistic'->>'type',
    b.data->'shipping'->'logistic'->>'type'
  ) AS shipping_type,

  COALESCE(b.buyer->>'nickname', trim(concat_ws(' ', b.buyer->>'first_name', b.buyer->>'last_name'))) AS customer_name,

  COALESCE(
    (b.buyer->>'id')::bigint,
    (b.data->'buyer'->>'id')::bigint,
    0
  ) AS id_buyer,
  COALESCE(
    NULLIF(trim(b.buyer->>'first_name'), ''),
    NULLIF(trim(b.data->'buyer'->>'first_name'), ''),
    ''
  ) AS first_name_buyer,
  COALESCE(
    NULLIF(trim(b.buyer->>'last_name'), ''),
    NULLIF(trim(b.data->'buyer'->>'last_name'), ''),
    ''
  ) AS last_name_buyer,

  COALESCE(
    b.shipments->0->'destination'->'shipping_address'->'city'->>'name',
    b.data->'shipping'->'receiver_address'->'city'->>'name',
    b.data->'shipping'->'shipping_address'->'city'->>'name'
  ) AS shipping_city_name,
  COALESCE(
    b.shipments->0->'destination'->'shipping_address'->'state'->>'name',
    b.data->'shipping'->'receiver_address'->'state'->>'name',
    b.data->'shipping'->'shipping_address'->'state'->>'name'
  ) AS shipping_state_name,
  COALESCE(
    NULLIF(split_part(b.shipments->0->'destination'->'shipping_address'->'state'->>'id', '-', 2), ''),
    NULLIF(split_part(b.data->'shipping'->'shipping_address'->'state'->>'id', '-', 2), '')
  ) AS shipping_state_uf,
  COALESCE(
    b.shipments->0->>'status',
    b.data->'shipping'->>'status'
  ) AS shipment_status,
  COALESCE(
    b.shipments->0->'lead_time'->'shipping_method'->>'name',
    b.shipments->0->'shipping_method'->>'name',
    b.data->'shipping'->'shipping_method'->>'name',
    b.data->'shipping'->'shipping_option'->>'name'
  ) AS shipping_method_name,
  COALESCE(
    (b.shipments->0->'lead_time'->'estimated_delivery_limit'->>'date')::timestamptz,
    (b.shipments->0->'lead_time'->'estimated_delivery_final'->>'date')::timestamptz,
    (b.data->'shipping'->'estimated_delivery_limit'->>'date')::timestamptz
  ) AS estimated_delivery_limit_at,

  -- Colunas separadas para SLA de despacho e atrasos
  COALESCE(b.shipments->0->>'sla_status', b.shipments->0->'sla'->>'status') AS shipment_sla_status,
  COALESCE(b.shipments->0->>'sla_service', b.shipments->0->'sla'->>'service') AS shipment_sla_service,
  COALESCE(
    (b.shipments->0->>'sla_expected_date')::timestamptz,
    (b.shipments->0->'sla'->>'expected_date')::timestamptz,
    (b.shipments->0->'lead_time'->'estimated_delivery_limit'->>'date')::timestamptz
  ) AS shipment_sla_expected_date,
  COALESCE(
    (b.shipments->0->>'sla_last_updated')::timestamptz,
    (b.shipments->0->'sla'->>'last_updated')::timestamptz,
    b.last_updated
  ) AS shipment_sla_last_updated,
  COALESCE(b.shipments->0->'delays', '[]'::jsonb) AS shipment_delays,

  COALESCE(
    COALESCE(ap.payment, '{}'::jsonb)->>'status',
    COALESCE(fp.payment, '{}'::jsonb)->>'status',
    'unknown'
  ) AS payment_status,
  COALESCE(
    (COALESCE(ap.payment, '{}'::jsonb)->>'total_paid_amount')::numeric,
    (COALESCE(fp.payment, '{}'::jsonb)->>'total_paid_amount')::numeric,
    (COALESCE(ap.payment, '{}'::jsonb)->>'transaction_amount')::numeric,
    (COALESCE(fp.payment, '{}'::jsonb)->>'transaction_amount')::numeric,
    0
  ) AS payment_total_paid_amount,
  COALESCE(
    (COALESCE(ap.payment, '{}'::jsonb)->>'marketplace_fee')::numeric,
    0
  ) AS payment_marketplace_fee,
  COALESCE(
    (COALESCE(ap.payment, '{}'::jsonb)->>'shipping_cost')::numeric,
    (COALESCE(fp.payment, '{}'::jsonb)->>'shipping_cost')::numeric,
    0
  ) AS payment_shipping_cost,
  COALESCE(
    (COALESCE(ap.payment, '{}'::jsonb)->>'date_created')::timestamptz,
    (COALESCE(fp.payment, '{}'::jsonb)->>'date_created')::timestamptz,
    b.created_at
  ) AS payment_date_created,
  COALESCE(
    (COALESCE(ap.payment, '{}'::jsonb)->>'date_approved')::timestamptz,
    (COALESCE(fp.payment, '{}'::jsonb)->>'date_approved')::timestamptz,
    (COALESCE(ap.payment, '{}'::jsonb)->>'date_last_modified')::timestamptz,
    (COALESCE(fp.payment, '{}'::jsonb)->>'date_last_modified')::timestamptz,
    (COALESCE(ap.payment, '{}'::jsonb)->>'date_created')::timestamptz,
    (COALESCE(fp.payment, '{}'::jsonb)->>'date_created')::timestamptz,
    b.created_at
  ) AS payment_date_approved,
  COALESCE(
    (COALESCE(ap.payment, '{}'::jsonb)->>'transaction_amount_refunded')::numeric,
    (COALESCE(fp.payment, '{}'::jsonb)->>'transaction_amount_refunded')::numeric,
    0
  ) AS payment_refunded_amount,

  COALESCE(ia.items_count, 0) AS items_count,
  COALESCE(ia.items_total_quantity, 0) AS items_total_quantity,
  COALESCE(ia.items_total_amount, 0) AS items_total_amount,
  COALESCE(ia.items_total_full_amount, 0) AS items_total_full_amount,
  COALESCE(ia.items_total_sale_fee, 0) AS items_total_sale_fee,
  COALESCE(
    COALESCE(first_item_json->>'currency_id', first_item_json->>'full_unit_price_currency_id', b.data->>'currency_id'),
    'BRL'
  ) AS items_currency_id,
  COALESCE(first_item_json->'item'->>'id', first_item_json->>'id', '') AS first_item_id,
  COALESCE(first_item_json->'item'->>'title', first_item_json->>'title', '') AS first_item_title,
  COALESCE(first_item_json->'item'->>'seller_sku', first_item_json->>'seller_sku', '') AS first_item_sku,
  COALESCE((first_item_json->'item'->>'variation_id')::bigint, 0) AS first_item_variation_id,
  colors.variation_color_names,
  ia.category_ids,
  ia.listing_type_ids,
  ia.stock_node_ids,
  ia.has_variations,
  ia.has_bundle,
  ia.has_kit,

  COALESCE((b.data->>'pack_id')::bigint, 0) AS pack_id,

  b.created_at,
  b.last_updated,
  b.last_synced_at
FROM base b
LEFT JOIN items_agg ia ON ia.id = b.id
LEFT JOIN colors ON colors.id = b.id
LEFT JOIN first_item fi ON fi.id = b.id
LEFT JOIN LATERAL (
  SELECT p AS payment
  FROM jsonb_array_elements(COALESCE(b.payments, '[]'::jsonb)) p
  WHERE COALESCE(p->>'status','') = 'approved'
  ORDER BY COALESCE((p->>'date_approved')::timestamptz, (p->>'date_created')::timestamptz) DESC
  LIMIT 1
) ap ON true
LEFT JOIN LATERAL (
  SELECT p AS payment
  FROM jsonb_array_elements(COALESCE(b.payments, '[]'::jsonb)) p
  LIMIT 1
) fp ON true;

GRANT SELECT ON public.marketplace_orders_presented TO authenticated;
REVOKE SELECT ON public.marketplace_orders_presented FROM anon;

COMMIT;