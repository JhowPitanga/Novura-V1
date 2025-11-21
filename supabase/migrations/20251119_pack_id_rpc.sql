BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_stock_by_pack_id(
  p_pack_id bigint,
  p_storage_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  rec RECORD;
  v_org_id uuid;
  v_company_id uuid;
BEGIN
  FOR rec IN SELECT id FROM public.marketplace_orders_presented WHERE pack_id = p_pack_id LOOP
    PERFORM public.reserve_stock_for_order(rec.id, p_storage_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_reserved_stock_by_pack_id(
  p_pack_id bigint,
  p_storage_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  rec RECORD;
  v_org_id uuid;
  v_company_id uuid;
BEGIN
  FOR rec IN SELECT id FROM public.marketplace_orders_presented WHERE pack_id = p_pack_id LOOP
    PERFORM public.consume_reserved_stock_for_order(rec.id, p_storage_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_reserved_stock_by_pack_id(
  p_pack_id bigint,
  p_storage_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  rec RECORD;
  v_org_id uuid;
  v_company_id uuid;
BEGIN
  FOR rec IN SELECT id FROM public.marketplace_orders_presented WHERE pack_id = p_pack_id LOOP
    PERFORM public.refund_reserved_stock_for_order(rec.id, p_storage_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_stock_by_pack_id(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_reserved_stock_by_pack_id(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_reserved_stock_by_pack_id(bigint, uuid) TO authenticated;

COMMIT;