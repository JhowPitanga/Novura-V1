-- Tune oauth refresh cron schedules for batch worker mode.
-- Worker now processes multiple jobs per invocation, so we can reduce
-- fixed cron frequency and rely on on-demand trigger from oauth-refresh.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oauth-refresh-worker') THEN
    PERFORM cron.unschedule('oauth-refresh-worker');
  END IF;
END $$;

SELECT cron.schedule(
  'oauth-refresh-worker',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://frwnfukydjwilfobxxhw.supabase.co/functions/v1/oauth-refresh-worker?batchSize=50',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pgcron_service_role_jwt' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
