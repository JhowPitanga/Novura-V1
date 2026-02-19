BEGIN;
CREATE EXTENSION IF NOT EXISTS pgmq;
DO $$
BEGIN
  PERFORM pgmq.create('q_emit_focus');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
-- Wrappers no schema public para uso via PostgREST (evitam PGRST106)
CREATE OR REPLACE FUNCTION public.q_emit_focus_send(p_message jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  SELECT pgmq.send('q_emit_focus', p_message) INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.q_emit_focus_read(p_vt integer, p_qty integer)
RETURNS TABLE (
  msg_id bigint,
  vt timestamptz,
  message jsonb,
  enqueued_at timestamptz,
  read_ct integer
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT msg_id, vt, message, enqueued_at, read_ct
  FROM pgmq.read('q_emit_focus', p_vt, p_qty);
$$;

CREATE OR REPLACE FUNCTION public.q_emit_focus_delete(p_msg_id bigint)
RETURNS boolean
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pgmq.delete('q_emit_focus', p_msg_id);
$$;

CREATE OR REPLACE FUNCTION public.q_emit_focus_archive(p_msg_id bigint)
RETURNS boolean
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pgmq.archive('q_emit_focus', p_msg_id);
$$;

GRANT EXECUTE ON FUNCTION public.q_emit_focus_send(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.q_emit_focus_read(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.q_emit_focus_delete(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.q_emit_focus_archive(bigint) TO service_role;
COMMIT;
