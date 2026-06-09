-- ============================================================
-- Stock Sync Motor: Migration 5/7
-- pg_cron job registration for:
--   stock-sync-dispatcher   → every 30s: reads outbox, fans out to PGMQ
--   stock-reconciliation-sweeper → daily at 03:00 BRT: drift detection
-- ============================================================

-- Remove old schedules if they exist (idempotent re-run).
SELECT cron.unschedule('stock-sync-dispatcher')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stock-sync-dispatcher');

SELECT cron.unschedule('stock-reconciliation-sweeper')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stock-reconciliation-sweeper');

-- Dispatcher: runs every 30 seconds, reads stock_sync_outbox, validates
-- marketplace_item_product_links (gate), and fans out to PGMQ channel queues.
SELECT cron.schedule(
  'stock-sync-dispatcher',
  '30 seconds',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/stock-sync-dispatcher',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Reconciliation sweeper: daily at 03:00 UTC-3 (06:00 UTC).
-- Compares internal products_stock.available with live API data per channel,
-- injects corrections back into stock_sync_outbox for self-healing.
SELECT cron.schedule(
  'stock-reconciliation-sweeper',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/stock-reconciliation-sweeper',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
