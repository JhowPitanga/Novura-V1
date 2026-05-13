-- Schedule the promotions-cron-sync edge function every 30 minutes.
-- Requires vault secrets: supabase_url, pgcron_service_role_jwt.
-- pg_cron and pg_net extensions must be enabled (already used by oauth-refresh cron).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'promotions-sync') THEN
    PERFORM cron.unschedule('promotions-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'promotions-sync',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1)
           || '/functions/v1/promotions-cron-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pgcron_service_role_jwt' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
