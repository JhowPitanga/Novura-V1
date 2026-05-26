-- Cycle 0 — orders_sync queue and worker schedule
-- Creates pgmq queue for order sync events and pg_cron job to trigger the worker.

-- Enable required extensions (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create durable (logged) queue for order sync events
SELECT pgmq.create('orders_sync');

-- Schedule the worker every 30 seconds
-- pg_cron calls the orders-queue-worker edge function via pg_net HTTP POST
SELECT cron.schedule(
  'orders-queue-worker',
  '30 seconds',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/orders-queue-worker',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

