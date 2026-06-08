-- Ensure oauth-refresh-worker cron runs every minute as fallback when on-demand trigger fails.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oauth-refresh-worker') THEN
    PERFORM cron.unschedule('oauth-refresh-worker');
  END IF;
END $$;

SELECT cron.schedule(
  'oauth-refresh-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1)
           || '/functions/v1/oauth-refresh-worker?batchSize=50',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pgcron_service_role_jwt' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
