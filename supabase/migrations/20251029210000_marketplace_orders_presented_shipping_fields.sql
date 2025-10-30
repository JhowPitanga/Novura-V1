-- Atualiza a view marketplace_orders_presented para expor campos derivados de shipments
-- e cria índices por expressão no marketplace_orders_raw para filtros mais rápidos.

BEGIN;

-- Recriar a view mantendo as colunas existentes e adicionando as novas
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
  -- logistic type (mantém coluna existente com fallback adicional ao objeto logistic)
  COALESCE(
    b.shipments->0->>'logistic_type',
    b.data->'shipping'->>'logistic_type',
    b.shipments->0->'logistic'->>'type',
    b.data->'shipping'->'logistic'->>'type'
  ) AS shipping_type,
  COALESCE(b.buyer->>'nickname', trim(concat_ws(' ', b.buyer->>'first_name', b.buyer->>'last_name'))) AS customer_name,

  -- Novos campos derivados de shipments
  COALESCE(
    b.shipments->0->'receiver_address'->'city'->>'name',
    b.data->'shipping'->'receiver_address'->'city'->>'name',
    b.data->'shipping'->'shipping_address'->'city'->>'name'
  ) AS shipping_city_name,

  COALESCE(
    b.shipments->0->'receiver_address'->'state'->>'name',
    b.data->'shipping'->'receiver_address'->'state'->>'name',
    b.data->'shipping'->'shipping_address'->'state'->>'name'
  ) AS shipping_state_name,

  COALESCE(
    NULLIF(split_part(b.shipments->0->'receiver_address'->'state'->>'id', '-', 2), ''),
    NULLIF(split_part(b.data->'shipping'->'receiver_address'->'state'->>'id', '-', 2), ''),
    NULLIF(split_part(b.data->'shipping'->'shipping_address'->'state'->>'id', '-', 2), '')
  ) AS shipping_state_uf,

  COALESCE(
    b.shipments->0->>'status',
    b.data->'shipping'->>'status'
  ) AS shipment_status,

  COALESCE(
    b.shipments->0->'shipping_method'->>'name',
    b.data->'shipping'->'shipping_method'->>'name',
    b.data->'shipping'->'shipping_option'->>'name'
  ) AS shipping_method_name,

  COALESCE(
    (b.shipments->0->'estimated_delivery_limit'->>'date')::timestamptz,
    (b.data->'shipping'->'estimated_delivery_limit'->>'date')::timestamptz
  ) AS estimated_delivery_limit_at,

  b.payments,
  b.shipments,
  b.data,
  b.created_at,
  b.last_updated,
  b.last_synced_at,
  items.order_items_simplified AS order_items
FROM base b
LEFT JOIN items ON items.id = b.id;

-- Permissões: apenas authenticated
GRANT SELECT ON public.marketplace_orders_presented TO authenticated;
REVOKE SELECT ON public.marketplace_orders_presented FROM anon;

-- Índices por expressão no raw (ajudam filtros na view)
-- Observação: combinar organizations_id para suportar os WHERE usuais
CREATE INDEX IF NOT EXISTS idx_mor_org_ship_city_name
  ON public.marketplace_orders_raw (
    organizations_id,
    ((shipments->0->'receiver_address'->'city'->>'name'))
  );

CREATE INDEX IF NOT EXISTS idx_mor_org_ship_state_name
  ON public.marketplace_orders_raw (
    organizations_id,
    ((shipments->0->'receiver_address'->'state'->>'name'))
  );

CREATE INDEX IF NOT EXISTS idx_mor_org_ship_state_uf
  ON public.marketplace_orders_raw (
    organizations_id,
    (
      COALESCE(
        NULLIF(split_part(shipments->0->'receiver_address'->'state'->>'id', '-', 2), ''),
        NULLIF(split_part(data->'shipping'->'receiver_address'->'state'->>'id', '-', 2), ''),
        NULLIF(split_part(data->'shipping'->'shipping_address'->'state'->>'id', '-', 2), '')
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_mor_org_shipment_status
  ON public.marketplace_orders_raw (
    organizations_id,
    (COALESCE(shipments->0->>'status', data->'shipping'->>'status'))
  );

CREATE INDEX IF NOT EXISTS idx_mor_org_shipping_method_name
  ON public.marketplace_orders_raw (
    organizations_id,
    (COALESCE(
      shipments->0->'shipping_method'->>'name',
      data->'shipping'->'shipping_method'->>'name',
      data->'shipping'->'shipping_option'->>'name'
    ))
  );

-- Removido índice por timestamptz (casts não são imutáveis). Avaliar mais tarde
-- alternativas (materialized view ou coluna gerada persistida) se necessário.

-- Atualizar/garantir índice para shipping_type (com fallback logistic.type)
CREATE INDEX IF NOT EXISTS idx_mor_org_shipping_type
  ON public.marketplace_orders_raw (
    organizations_id,
    (COALESCE(
      shipments->0->>'logistic_type',
      data->'shipping'->>'logistic_type',
      shipments->0->'logistic'->>'type',
      data->'shipping'->'logistic'->>'type'
    ))
  );

COMMIT;