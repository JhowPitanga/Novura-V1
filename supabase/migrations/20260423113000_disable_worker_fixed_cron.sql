-- Disable fixed oauth-refresh-worker cron schedule.
-- Worker will be triggered on-demand by oauth-refresh enqueuer
-- whenever new jobs are inserted into oauth_refresh_jobs.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oauth-refresh-worker') THEN
    PERFORM cron.unschedule('oauth-refresh-worker');
  END IF;
END $$;
