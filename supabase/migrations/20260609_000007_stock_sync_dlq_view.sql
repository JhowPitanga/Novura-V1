-- ============================================================
-- Stock Sync Motor: Migration 7/7
-- Observability view for the Dead Letter Queue (DLQ).
-- Exposed to the Novura admin panel for manual triage of failed sync events.
-- ============================================================

-- PGMQ stores archived messages in per-queue tables: pgmq.a_<queue_name>
CREATE OR REPLACE VIEW public.v_stock_sync_dlq AS
SELECT
  q.msg_id,
  (q.message->>'organization_id')::uuid AS organization_id,
  q.message->>'marketplace_name'        AS marketplace_name,
  q.message->>'marketplace_item_id'     AS marketplace_item_id,
  q.message->>'variation_id'            AS variation_id,
  (q.message->>'available')::integer    AS available_attempted,
  (q.message->>'version')::bigint       AS event_version,
  q.message->>'last_error'              AS last_error,
  q.archived_at                         AS enqueued_at,
  q.read_ct                             AS retry_count
FROM pgmq.a_fila_sincronizacao_shopee q
UNION ALL
SELECT
  q.msg_id,
  (q.message->>'organization_id')::uuid AS organization_id,
  q.message->>'marketplace_name'        AS marketplace_name,
  q.message->>'marketplace_item_id'     AS marketplace_item_id,
  q.message->>'variation_id'            AS variation_id,
  (q.message->>'available')::integer    AS available_attempted,
  (q.message->>'version')::bigint       AS event_version,
  q.message->>'last_error'              AS last_error,
  q.archived_at                         AS enqueued_at,
  q.read_ct                             AS retry_count
FROM pgmq.a_fila_sincronizacao_mercadolivre q
ORDER BY enqueued_at DESC;
