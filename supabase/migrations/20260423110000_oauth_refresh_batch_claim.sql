-- Batch claim helpers for oauth_refresh_jobs using SKIP LOCKED.
-- This allows multiple worker invocations to run safely in parallel
-- without claiming the same jobs.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_oauth_refresh_jobs(
  p_batch_size integer DEFAULT 50
) RETURNS TABLE (
  id uuid,
  integration_id uuid,
  attempt_count smallint,
  max_attempts smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH locked AS (
    SELECT j.id
    FROM public.oauth_refresh_jobs j
    WHERE j.status = 'pending'
      AND j.scheduled_at <= now()
      AND j.attempt_count < j.max_attempts
    ORDER BY j.scheduled_at ASC
    LIMIT GREATEST(1, p_batch_size)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.oauth_refresh_jobs j
    SET
      status = 'processing',
      started_at = now()
    FROM locked
    WHERE j.id = locked.id
    RETURNING j.id, j.integration_id, j.attempt_count, j.max_attempts
  )
  SELECT u.id, u.integration_id, u.attempt_count, u.max_attempts
  FROM updated u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_oauth_refresh_jobs(integer) TO service_role;

COMMIT;
