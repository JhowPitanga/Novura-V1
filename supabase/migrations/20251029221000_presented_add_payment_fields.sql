-- Adiciona colunas de pagamento na view marketplace_orders_presented
-- com fallbacks para evitar valores NULL e garantir preenchimento correto.

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
  -- logistic type com fallback
  COALESCE(
    b.shipments->0->>'logistic_type',
    b.data->'shipping'->>'logistic_type',
    b.shipments->0->'logistic'->>'type',
    b.data->'shipping'->'logistic'->>'type'
  ) AS shipping_type,
  COALESCE(b.buyer->>'nickname', trim(concat_ws(' ', b.buyer->>'first_name', b.buyer->>'last_name'))) AS customer_name,

  -- Campos de envio (destinatário)
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
    NULLIF(split_part(b.data->'shipping'->'receiver_address'->'state'->>'id', '-', 2), ''),
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

  -- LATERAL: pagamento primário aprovado e primeiro pagamento
  -- Nota: usamos COALESCE(ap.payment,'{}') para evitar operadores em NULL
  -- Columns de pagamento solicitadas
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
    (COALESCE(fp.payment, '{}'::jsonb)->>'marketplace_fee')::numeric,
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

  b.payments,
  b.shipments,
  b.data,
  b.created_at,
  b.last_updated,
  b.last_synced_at,
  items.order_items_simplified AS order_items
FROM base b
LEFT JOIN items ON items.id = b.id
LEFT JOIN LATERAL (
  SELECT p AS payment
  FROM jsonb_array_elements(b.payments) p
  WHERE COALESCE(p->>'status','') = 'approved'
  ORDER BY COALESCE((p->>'date_approved')::timestamptz, (p->>'date_created')::timestamptz) DESC
  LIMIT 1
) ap ON true
LEFT JOIN LATERAL (
  SELECT p AS payment
  FROM jsonb_array_elements(b.payments) p
  LIMIT 1
) fp ON true;

GRANT SELECT ON public.marketplace_orders_presented TO authenticated;
REVOKE SELECT ON public.marketplace_orders_presented FROM anon;

COMMIT;