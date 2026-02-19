BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_mock_orders_a_vincular()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_company_id uuid;
  v_order1 uuid := gen_random_uuid();
  v_order2 uuid := gen_random_uuid();
  v_order3 uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('row_security','off', true);

  SELECT public.get_current_user_organization_id() INTO v_org_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para o usuário atual';
  END IF;

  SELECT c.id INTO v_company_id
  FROM public.companies c
  WHERE c.organization_id = v_org_id
  ORDER BY c.is_active DESC NULLS LAST, c.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa encontrada para a organização %', v_org_id;
  END IF;

  INSERT INTO public.marketplace_orders_presented_new (
    id, organizations_id, company_id, marketplace, marketplace_order_id,
    status, status_interno, customer_name, items_total_quantity, items_total_amount,
    has_unlinked_items, created_at
  ) VALUES
    (v_order1, v_org_id, v_company_id, 'Mercado Livre', 'MLB-MOCK-001',
     'A vincular', 'A vincular', 'Cliente Mock 1', 1, 99.90, true, now()),
    (v_order2, v_org_id, v_company_id, 'Mercado Livre', 'MLB-MOCK-002',
     'A vincular', 'A vincular', 'Cliente Mock 2', 2, 149.90, true, now()),
    (v_order3, v_org_id, v_company_id, 'Mercado Livre', 'MLB-MOCK-003',
     'A vincular', 'A vincular', 'Cliente Mock 3', 3, 199.90, true, now());

  INSERT INTO public.marketplace_order_items (
    id, model_sku_externo, model_id_externo, variation_name, pack_id,
    linked_products, item_name, quantity, unit_price, image_url
  ) VALUES
    (v_order1, 'SKU-MOCK-001', 'VAR-MOCK-001', 'Cor Azul', NULL,
     NULL, 'Produto Mock A', 1, 99.90, 'https://placeholder.svg'),

    (v_order2, 'SKU-MOCK-002-A', 'VAR-MOCK-002-A', 'Cor Verde', NULL,
     NULL, 'Produto Mock B1', 1, 59.95, 'https://placeholder.svg'),
    (v_order2, 'SKU-MOCK-002-B', 'VAR-MOCK-002-B', 'Cor Vermelha', NULL,
     NULL, 'Produto Mock B2', 1, 89.95, 'https://placeholder.svg'),

    (v_order3, 'SKU-MOCK-003-A', 'VAR-MOCK-003-A', 'Tamanho P', NULL,
     NULL, 'Produto Mock C1', 1, 49.95, 'https://placeholder.svg'),
    (v_order3, 'SKU-MOCK-003-B', 'VAR-MOCK-003-B', 'Tamanho M', NULL,
     NULL, 'Produto Mock C2', 1, 69.95, 'https://placeholder.svg'),
    (v_order3, 'SKU-MOCK-003-C', 'VAR-MOCK-003-C', 'Tamanho G', NULL,
     NULL, 'Produto Mock C3', 1, 79.95, 'https://placeholder.svg');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_mock_orders_a_vincular() TO authenticated;

COMMIT;

