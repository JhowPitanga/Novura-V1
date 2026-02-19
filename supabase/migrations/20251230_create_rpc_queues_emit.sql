BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_queues_emit(p_message jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF p_message ? 'orderIds' THEN
    UPDATE marketplace_orders_presented_new
    SET status_interno = 'Processando NF'
    WHERE id::text IN (
      SELECT jsonb_array_elements_text(p_message->'orderIds')
    );
  END IF;

  SELECT pgmq.send('q_emit_focus', p_message) INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_queues_emit(jsonb) TO authenticated, service_role;

COMMIT;
