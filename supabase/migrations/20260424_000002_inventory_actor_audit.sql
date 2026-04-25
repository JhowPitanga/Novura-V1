BEGIN;

-- Add explicit actor for inventory movements (manual operations)
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_by_user_id
  ON public.inventory_transactions (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

-- Rebuild transfer RPC to record user actor in audit rows
CREATE OR REPLACE FUNCTION public.transfer_stock_between_warehouses(
  p_product_id uuid,
  p_from_storage_id uuid,
  p_to_storage_id uuid,
  p_quantity numeric,
  p_org_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_from_type text;
  v_from_readonly boolean;
  v_to_type text;
  v_to_readonly boolean;
  v_company_id uuid;
  v_from_current numeric;
  v_source_ref text;
  v_actor_id uuid;
BEGIN
  v_actor_id := auth.uid();

  IF p_from_storage_id = p_to_storage_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SAME_STORAGE');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_QUANTITY');
  END IF;

  SELECT type, readonly INTO v_from_type, v_from_readonly
  FROM public.storage
  WHERE id = p_from_storage_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORIGIN_NOT_FOUND');
  END IF;

  IF v_from_type <> 'physical' OR v_from_readonly = true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORIGIN_NOT_PHYSICAL');
  END IF;

  SELECT type, readonly INTO v_to_type, v_to_readonly
  FROM public.storage
  WHERE id = p_to_storage_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DESTINATION_NOT_FOUND');
  END IF;

  IF v_to_type <> 'physical' OR v_to_readonly = true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DESTINATION_NOT_PHYSICAL');
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.organization_id = p_org_id
  ORDER BY c.is_active DESC NULLS LAST, c.created_at
  LIMIT 1;

  SELECT GREATEST(COALESCE(ps.current, 0) - COALESCE(ps.reserved, 0), 0)
  INTO v_from_current
  FROM public.products_stock ps
  WHERE ps.product_id = p_product_id
    AND ps.storage_id = p_from_storage_id
    AND (ps.company_id IS NULL OR ps.company_id = v_company_id)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRODUCT_NOT_IN_ORIGIN');
  END IF;

  IF v_from_current < p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_STOCK', 'available', v_from_current);
  END IF;

  v_source_ref := COALESCE(p_note, 'TRANSFERENCIA');

  UPDATE public.products_stock
  SET current = GREATEST(current - p_quantity, 0),
      updated_at = now()
  WHERE product_id = p_product_id
    AND storage_id = p_from_storage_id
    AND (company_id IS NULL OR company_id = v_company_id);

  INSERT INTO public.products_stock (product_id, storage_id, company_id, current, reserved, in_transit)
  VALUES (p_product_id, p_to_storage_id, v_company_id, p_quantity, 0, 0)
  ON CONFLICT (product_id, storage_id)
  DO UPDATE SET current = GREATEST(public.products_stock.current, 0) + p_quantity,
                updated_at = now();

  INSERT INTO public.inventory_transactions (
    organizations_id, company_id, product_id, storage_id,
    movement_type, quantity_change, timestamp, source_ref,
    entity_type, reason_code, counterpart_storage_id, created_by_user_id
  ) VALUES (
    p_org_id, v_company_id, p_product_id, p_from_storage_id,
    'TRANSFERENCIA', -p_quantity, now(), v_source_ref,
    'transfer_out', 'warehouse_transfer', p_to_storage_id, v_actor_id
  );

  INSERT INTO public.inventory_transactions (
    organizations_id, company_id, product_id, storage_id,
    movement_type, quantity_change, timestamp, source_ref,
    entity_type, reason_code, counterpart_storage_id, created_by_user_id
  ) VALUES (
    p_org_id, v_company_id, p_product_id, p_to_storage_id,
    'TRANSFERENCIA', p_quantity, now(), v_source_ref,
    'transfer_in', 'warehouse_transfer', p_from_storage_id, v_actor_id
  );

  RETURN jsonb_build_object('ok', true, 'transferred', p_quantity);
END;
$$;

-- Enrich audit view with actor identity
CREATE OR REPLACE VIEW public.v_inventory_audit AS
SELECT
  it.id,
  it.timestamp,
  it.organizations_id,
  it.product_id,
  p.name AS product_name,
  p.sku AS product_sku,
  p.image_urls AS product_image_urls,
  it.storage_id,
  s.name AS storage_name,
  s.type AS storage_type,
  it.order_id,
  o.marketplace_order_id,
  it.integration_id,
  mi.marketplace_name AS integration_marketplace,
  it.marketplace_name,
  it.movement_type,
  it.quantity_change,
  it.source_ref,
  it.entity_type,
  it.reason_code,
  it.counterpart_storage_id,
  cs.name AS counterpart_storage_name,
  it.created_by_user_id,
  COALESCE(up.display_name, up.full_name, 'Novura') AS actor_name
FROM public.inventory_transactions it
LEFT JOIN public.products p ON p.id = it.product_id
LEFT JOIN public.storage s ON s.id = it.storage_id
LEFT JOIN public.storage cs ON cs.id = it.counterpart_storage_id
LEFT JOIN public.orders o ON o.id = it.order_id
LEFT JOIN public.marketplace_integrations mi ON mi.id = it.integration_id
LEFT JOIN public.user_profiles up ON up.id = it.created_by_user_id;

COMMIT;
