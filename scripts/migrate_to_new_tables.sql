-- =============================================================================
-- DATA MIGRATION: Old tables → Cycle 0 tables
-- Run by hand against production. Safe to re-run (idempotent).
-- =============================================================================
-- Source tables:
--   marketplace_orders_presented_new  (87-col denormalized)
--   marketplace_order_items           (items joined via pack_id)
--   notas_fiscais                     (invoices old schema)
--
-- Target tables:
--   orders, order_items, order_shipping, order_labels,
--   order_status_history, invoices
--
-- Strategy:
--   - All inserts use ON CONFLICT DO NOTHING or NOT EXISTS guards.
--   - Wrapped in a single transaction (all-or-nothing).
--   - Run the verification queries at the bottom before COMMITing.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. orders  (from marketplace_orders_presented_new)
-- ---------------------------------------------------------------------------
-- Mapping:
--   organizations_id          → organization_id
--   status                    → marketplace_status  (ML/Shopee raw status)
--   status_interno            → status              (internal ERP status)
--   order_total               → gross_amount
--   payment_marketplace_fee   → marketplace_fee
--   payment_shipping_cost     → shipping_cost
--   payment_total_paid_amount → net_amount
--   customer_name             → buyer_name
--   billing_doc_number        → buyer_document
--   billing_email             → buyer_email
--   billing_phone             → buyer_phone
--   shipping_state_uf         → buyer_state
--   created_at                → created_at
--   last_synced_at            → last_synced_at
-- ---------------------------------------------------------------------------

INSERT INTO orders (
  organization_id,
  marketplace,
  marketplace_order_id,
  pack_id,
  status,
  marketplace_status,
  payment_status,
  gross_amount,
  marketplace_fee,
  shipping_cost,
  shipping_subsidy,
  net_amount,
  buyer_name,
  buyer_document,
  buyer_email,
  buyer_phone,
  buyer_state,
  created_at,
  last_synced_at
)
SELECT
  mopn.organizations_id,
  mopn.marketplace,
  mopn.marketplace_order_id,
  mopn.pack_id,
  COALESCE(mopn.status_interno, 'unknown'),   -- internal ERP status
  COALESCE(mopn.status, 'unknown'),           -- marketplace raw status
  mopn.payment_status,
  mopn.order_total,
  mopn.payment_marketplace_fee,
  mopn.payment_shipping_cost,
  0,                                           -- shipping_subsidy not in old schema
  mopn.payment_total_paid_amount,
  mopn.customer_name,
  mopn.billing_doc_number,
  mopn.billing_email,
  mopn.billing_phone,
  mopn.shipping_state_uf,
  mopn.created_at,
  mopn.last_synced_at
FROM marketplace_orders_presented_new mopn
WHERE mopn.organizations_id IS NOT NULL
  AND mopn.marketplace        IS NOT NULL
  AND mopn.marketplace_order_id IS NOT NULL
ON CONFLICT (organization_id, marketplace, marketplace_order_id)
DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. order_items — two passes
-- ---------------------------------------------------------------------------
-- Pass A: orders with pack_id — source from marketplace_order_items
--         joined via pack_id (multiple items per pack)
-- Pass B: fallback — all remaining orders without items yet,
--         using first_item_* denormalized columns from old table
-- ---------------------------------------------------------------------------

-- Pass A: pack orders → marketplace_order_items
INSERT INTO order_items (
  order_id,
  marketplace_item_id,
  sku,
  title,
  quantity,
  unit_price,
  variation_name,
  image_url
)
SELECT DISTINCT
  o.id                                                  AS order_id,
  moi.model_id_externo                                  AS marketplace_item_id,
  moi.model_sku_externo                                 AS sku,
  COALESCE(NULLIF(moi.item_name, ''), '[sem título]')   AS title,
  COALESCE(moi.quantity, 1)                             AS quantity,
  COALESCE(moi.unit_price, 0)                           AS unit_price,
  moi.variation_name,
  moi.image_url
FROM marketplace_order_items moi
JOIN marketplace_orders_presented_new mopn
  ON mopn.pack_id = moi.pack_id
JOIN orders o
  ON  o.organization_id      = mopn.organizations_id
  AND o.marketplace           = mopn.marketplace
  AND o.marketplace_order_id  = mopn.marketplace_order_id
WHERE moi.pack_id IS NOT NULL
  AND mopn.pack_id IS NOT NULL
  -- Guard: skip if this order already has items (re-run safety)
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
  );

-- Pass B: single-item fallback from first_item_* columns
INSERT INTO order_items (
  order_id,
  marketplace_item_id,
  sku,
  title,
  quantity,
  unit_price
)
SELECT
  o.id                                                       AS order_id,
  mopn.first_item_id                                         AS marketplace_item_id,
  mopn.first_item_sku                                        AS sku,
  COALESCE(NULLIF(mopn.first_item_title, ''), '[sem título]') AS title,
  GREATEST(COALESCE(mopn.items_total_quantity, 1), 1)        AS quantity,
  -- best-effort unit price: total_amount / qty, fallback to order_total
  COALESCE(
    mopn.items_total_amount / NULLIF(mopn.items_total_quantity::numeric, 0),
    mopn.order_total,
    0
  )                                                          AS unit_price
FROM marketplace_orders_presented_new mopn
JOIN orders o
  ON  o.organization_id      = mopn.organizations_id
  AND o.marketplace           = mopn.marketplace
  AND o.marketplace_order_id  = mopn.marketplace_order_id
-- Only for orders that have no items yet (pack orders already inserted above)
WHERE NOT EXISTS (
  SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
);

-- ---------------------------------------------------------------------------
-- 3. order_shipping  (from shipping_* / shipment_* columns)
-- ---------------------------------------------------------------------------
INSERT INTO order_shipping (
  order_id,
  logistic_type,
  status,
  substatus,
  street_name,
  street_number,
  neighborhood,
  city,
  state_uf,
  zip_code,
  country,
  sla_expected_date,
  sla_status,
  estimated_delivery
)
SELECT
  o.id                              AS order_id,
  mopn.shipping_type                AS logistic_type,
  mopn.shipment_status              AS status,
  mopn.shipment_substatus           AS substatus,
  mopn.shipping_street_name         AS street_name,
  mopn.shipping_street_number       AS street_number,
  mopn.shipping_neighborhood_name   AS neighborhood,
  mopn.shipping_city_name           AS city,
  mopn.shipping_state_uf            AS state_uf,
  mopn.shipping_zip_code            AS zip_code,
  'BR'                              AS country,
  mopn.shipment_sla_expected_date   AS sla_expected_date,
  mopn.shipment_sla_status          AS sla_status,
  mopn.estimated_delivery_limit_at  AS estimated_delivery
FROM marketplace_orders_presented_new mopn
JOIN orders o
  ON  o.organization_id      = mopn.organizations_id
  AND o.marketplace           = mopn.marketplace
  AND o.marketplace_order_id  = mopn.marketplace_order_id
ON CONFLICT (order_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. order_labels  (ZPL2 and PDF stored separately)
-- ---------------------------------------------------------------------------

-- ZPL2 labels
INSERT INTO order_labels (
  order_id,
  label_type,
  content_base64,
  content_type,
  size_bytes,
  fetched_at
)
SELECT
  o.id                                                AS order_id,
  'zpl2'                                              AS label_type,
  mopn.label_zpl2_base64                              AS content_base64,
  COALESCE(mopn.label_content_type, 'text/plain')     AS content_type,
  mopn.label_size_bytes                               AS size_bytes,
  COALESCE(mopn.label_fetched_at, mopn.last_synced_at) AS fetched_at
FROM marketplace_orders_presented_new mopn
JOIN orders o
  ON  o.organization_id      = mopn.organizations_id
  AND o.marketplace           = mopn.marketplace
  AND o.marketplace_order_id  = mopn.marketplace_order_id
WHERE mopn.label_zpl2_base64 IS NOT NULL
ON CONFLICT (order_id, label_type) DO NOTHING;

-- PDF labels
INSERT INTO order_labels (
  order_id,
  label_type,
  content_base64,
  content_type,
  size_bytes,
  fetched_at
)
SELECT
  o.id                                                AS order_id,
  'pdf'                                               AS label_type,
  mopn.label_pdf_base64                               AS content_base64,
  COALESCE(mopn.label_content_type, 'application/pdf') AS content_type,
  mopn.label_size_bytes                               AS size_bytes,
  COALESCE(mopn.label_fetched_at, mopn.last_synced_at) AS fetched_at
FROM marketplace_orders_presented_new mopn
JOIN orders o
  ON  o.organization_id      = mopn.organizations_id
  AND o.marketplace           = mopn.marketplace
  AND o.marketplace_order_id  = mopn.marketplace_order_id
WHERE mopn.label_pdf_base64 IS NOT NULL
ON CONFLICT (order_id, label_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. order_status_history  (one bootstrap entry per order, source='migration')
-- ---------------------------------------------------------------------------
INSERT INTO order_status_history (
  order_id,
  from_status,
  to_status,
  changed_at,
  source
)
SELECT
  o.id                                          AS order_id,
  NULL                                          AS from_status,
  COALESCE(mopn.status_interno, 'unknown')      AS to_status,
  COALESCE(mopn.created_at, NOW())              AS changed_at,
  'migration'                                   AS source
FROM marketplace_orders_presented_new mopn
JOIN orders o
  ON  o.organization_id      = mopn.organizations_id
  AND o.marketplace           = mopn.marketplace
  AND o.marketplace_order_id  = mopn.marketplace_order_id
WHERE NOT EXISTS (
  SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id
);

-- ---------------------------------------------------------------------------
-- 6. invoices  (from notas_fiscais → joined through old order → new order)
-- ---------------------------------------------------------------------------
-- Notes:
--   - notas_fiscais.order_id is FK to marketplace_orders_presented_new.id
--   - We resolve new orders.id via the marketplace+marketplace_order_id join
--   - idempotency_key = org_id || ':' || new_order_id || ':' || env
--   - xml_base64/pdf_base64 NOT migrated (new schema uses xml_url/pdf_url)
--   - playload_enviado (typo in old schema) → payload_sent
--   - status_focus → status (Focus NFe status is canonical status)
--   - error_details jsonb → error_message (cast to text)
-- ---------------------------------------------------------------------------
INSERT INTO invoices (
  organization_id,
  order_id,
  company_id,
  idempotency_key,
  focus_id,
  nfe_number,
  nfe_key,
  serie,
  status,
  emission_environment,
  marketplace,
  marketplace_order_id,
  marketplace_submission_status,
  total_value,
  payload_sent,
  error_message,
  retry_count,
  authorized_at,
  created_at
)
SELECT
  mopn.organizations_id                                      AS organization_id,
  o.id                                                       AS order_id,
  nf.company_id,
  -- idempotency_key: org:new_order_id:env — stable even after re-runs
  mopn.organizations_id::text
    || ':' || o.id::text
    || ':' || COALESCE(nf.emissao_ambiente, 'homologacao')   AS idempotency_key,
  nf.focus_nfe_id                                            AS focus_id,
  nf.nfe_number,
  nf.nfe_key,
  nf.serie,
  COALESCE(
    NULLIF(nf.status_focus, ''),
    NULLIF(nf.status, ''),
    'pending'
  )                                                          AS status,
  COALESCE(nf.emissao_ambiente, 'homologacao')               AS emission_environment,
  nf.marketplace,
  nf.marketplace_order_id,
  nf.marketplace_submission_status,
  nf.total_value,
  nf.playload_enviado                                        AS payload_sent,
  -- error_details is jsonb in old schema; cast to text for the text column
  (nf.error_details)::text                                   AS error_message,
  0                                                          AS retry_count,
  nf.authorized_at,
  COALESCE(nf.created_at, NOW())                             AS created_at
FROM notas_fiscais nf
-- Resolve the old order row for org context
JOIN marketplace_orders_presented_new mopn
  ON mopn.id = nf.order_id
-- Resolve the new orders.id
JOIN orders o
  ON  o.organization_id      = mopn.organizations_id
  AND o.marketplace           = mopn.marketplace
  AND o.marketplace_order_id  = mopn.marketplace_order_id
WHERE mopn.organizations_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

-- =============================================================================
-- VERIFICATION  — uncomment and run these before committing
-- =============================================================================

-- SELECT 'orders migrated'          AS table_name, COUNT(*) FROM orders;
-- SELECT 'source orders'            AS table_name, COUNT(*) FROM marketplace_orders_presented_new
--   WHERE organizations_id IS NOT NULL AND marketplace IS NOT NULL AND marketplace_order_id IS NOT NULL;

-- SELECT 'order_items'              AS table_name, COUNT(*) FROM order_items;
-- SELECT 'order_shipping'           AS table_name, COUNT(*) FROM order_shipping;
-- SELECT 'order_labels zpl2'        AS table_name, COUNT(*) FROM order_labels WHERE label_type = 'zpl2';
-- SELECT 'order_labels pdf'         AS table_name, COUNT(*) FROM order_labels WHERE label_type = 'pdf';
-- SELECT 'order_status_history'     AS table_name, COUNT(*) FROM order_status_history;
-- SELECT 'invoices migrated'        AS table_name, COUNT(*) FROM invoices;
-- SELECT 'source notas_fiscais'     AS table_name, COUNT(*) FROM notas_fiscais;

-- -- Orders with no items (investigate before committing):
-- SELECT COUNT(*) AS orders_without_items
-- FROM orders o
-- WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);

-- -- Invoices that could not resolve a new order (only if notas_fiscais rows exist):
-- SELECT COUNT(*) AS unresolved_invoices
-- FROM notas_fiscais nf
-- JOIN marketplace_orders_presented_new mopn ON mopn.id = nf.order_id
-- WHERE NOT EXISTS (
--   SELECT 1 FROM orders o
--   WHERE o.organization_id = mopn.organizations_id
--     AND o.marketplace = mopn.marketplace
--     AND o.marketplace_order_id = mopn.marketplace_order_id
-- );

COMMIT;
