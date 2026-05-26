-- Update pg_cron jobs to use the new generic oauth-refresh function.
-- Replaces individual mercado-livre-refresh and shopee-refresh cron jobs.
-- Also adds a worker job to process refresh jobs every minute.
--
-- Prerequisites:
--   1. Apply migrations 20260422100000 - 20260422100300 first.
--   2. Ensure vault secret 'pgcron_service_role_jwt' exists (see docs/operations/pgcron-app-settings.md).

-- Remove old provider-specific refresh cron jobs if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mercado-livre-refresh') THEN
    PERFORM cron.unschedule('mercado-livre-refresh');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shopee-refresh') THEN
    PERFORM cron.unschedule('shopee-refresh');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ml-token-refresh') THEN
    PERFORM cron.unschedule('ml-token-refresh');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shopee-token-refresh') THEN
    PERFORM cron.unschedule('shopee-token-refresh');
  END IF;
END $$;

-- Schedule generic enqueuer: runs every 5 minutes to queue integrations needing refresh
SELECT cron.schedule(
  'oauth-refresh-enqueuer',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1)
           || '/functions/v1/oauth-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pgcron_service_role_jwt' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule worker: runs every minute to process pending refresh jobs
SELECT cron.schedule(
  'oauth-refresh-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1)
           || '/functions/v1/oauth-refresh-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pgcron_service_role_jwt' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
