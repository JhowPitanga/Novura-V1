-- C0-T16: pg_cron schedule for inventory-jobs-worker.
-- The worker has no cron — pending/failed legacy inventory_jobs never retry automatically.
-- This schedule keeps legacy orders (marketplace_orders_presented_new) processing
-- reliably during the transition period until those tables are deprecated.

SELECT cron.schedule(
  'inventory-jobs-worker',
  '30 seconds',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/inventory-jobs-worker',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
