BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_mock_orders_a_vincular(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_company_id uuid;
  v_now timestamptz := now();
  o1 uuid := gen_random_uuid();
  o2 uuid := gen_random_uuid();
  o3 uuid := gen_random_uuid();
  created_ids uuid[] := ARRAY[]::uuid[];
  items jsonb;
  qty integer;
  total numeric;
  var_names text[];
  first_name text;
BEGIN
  v_org_id := COALESCE(p_organization_id, public.get_current_user_organization_id());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT id
  INTO v_company_id
  FROM public.companies
  WHERE organization_id = v_org_id
  ORDER BY is_active DESC NULLS LAST, created_at ASC
  LIMIT 1;

  items := jsonb_build_array(
    jsonb_build_object('item_name','Produto A','quantity',1,'unit_price',79.90,'image_url','https://via.placeholder.com/64','model_sku_externo',NULL,'model_id_externo','VAR-001','variation_name','Azul')
  );
  SELECT COALESCE(SUM((x->>'quantity')::int),0),
         COALESCE(SUM(((x->>'unit_price')::numeric) * ((x->>'quantity')::int)),0),
         COALESCE(ARRAY(SELECT DISTINCT x->>'variation_name' FROM jsonb_array_elements(items) x WHERE x->>'variation_name' IS NOT NULL), ARRAY[]::text[]),
         COALESCE((items->0)->>'item_name','Item 1')
  INTO qty, total, var_names, first_name
  FROM jsonb_array_elements(items) x;
  INSERT INTO public.marketplace_orders_presented_new (
    id, organizations_id, company_id, marketplace, marketplace_order_id,
    status, status_interno, order_total, items_total_quantity, items_total_amount,
    created_at, first_item_id, first_item_title, first_item_sku, first_item_variation_id, first_item_permalink,
    has_unlinked_items, unlinked_items_count, variation_color_names
  ) VALUES (
    o1, v_org_id, v_company_id, 'Mercado Livre', 'MOCK-AV-001',
    'Pendente', 'A vincular', total, qty, total,
    v_now, 'MLB123001', first_name, NULL, NULL, 'https://example.com/mock-1',
    TRUE, 1, var_names
  );
  INSERT INTO public.marketplace_order_items (id, model_sku_externo, model_id_externo, variation_name, pack_id, linked_products, item_name, quantity, unit_price, image_url)
  SELECT o1, NULL, (x->>'model_id_externo'), (x->>'variation_name'), NULL, NULL, (x->>'item_name'), (x->>'quantity')::int, (x->>'unit_price')::numeric, (x->>'image_url')
  FROM jsonb_array_elements(items) x;
  created_ids := array_append(created_ids, o1);

  items := jsonb_build_array(
    jsonb_build_object('item_name','Produto B','quantity',1,'unit_price',49.90,'image_url','https://via.placeholder.com/64','model_sku_externo',NULL,'model_id_externo','VAR-101','variation_name','Preto'),
    jsonb_build_object('item_name','Produto C','quantity',2,'unit_price',89.50,'image_url','https://via.placeholder.com/64','model_sku_externo',NULL,'model_id_externo','VAR-102','variation_name','M')
  );
  SELECT COALESCE(SUM((x->>'quantity')::int),0),
         COALESCE(SUM(((x->>'unit_price')::numeric) * ((x->>'quantity')::int)),0),
         COALESCE(ARRAY(SELECT DISTINCT x->>'variation_name' FROM jsonb_array_elements(items) x WHERE x->>'variation_name' IS NOT NULL), ARRAY[]::text[]),
         COALESCE((items->0)->>'item_name','Item 1')
  INTO qty, total, var_names, first_name
  FROM jsonb_array_elements(items) x;
  INSERT INTO public.marketplace_orders_presented_new (
    id, organizations_id, company_id, marketplace, marketplace_order_id,
    status, status_interno, order_total, items_total_quantity, items_total_amount,
    created_at, first_item_id, first_item_title, first_item_sku, first_item_variation_id, first_item_permalink,
    has_unlinked_items, unlinked_items_count, variation_color_names
  ) VALUES (
    o2, v_org_id, v_company_id, 'Mercado Livre', 'MOCK-AV-002',
    'Pendente', 'A vincular', total, qty, total,
    v_now, 'MLB123002', first_name, NULL, NULL, 'https://example.com/mock-2',
    TRUE, 2, var_names
  );
  INSERT INTO public.marketplace_order_items (id, model_sku_externo, model_id_externo, variation_name, pack_id, linked_products, item_name, quantity, unit_price, image_url)
  SELECT o2, NULL, (x->>'model_id_externo'), (x->>'variation_name'), NULL, NULL, (x->>'item_name'), (x->>'quantity')::int, (x->>'unit_price')::numeric, (x->>'image_url')
  FROM jsonb_array_elements(items) x;
  created_ids := array_append(created_ids, o2);

  items := jsonb_build_array(
    jsonb_build_object('item_name','Produto D','quantity',1,'unit_price',39.00,'image_url','https://via.placeholder.com/64','model_sku_externo',NULL,'model_id_externo','VAR-201','variation_name','Branco'),
    jsonb_build_object('item_name','Produto E','quantity',1,'unit_price',129.90,'image_url','https://via.placeholder.com/64','model_sku_externo',NULL,'model_id_externo','VAR-202','variation_name','G'),
    jsonb_build_object('item_name','Produto F','quantity',3,'unit_price',19.90,'image_url','https://via.placeholder.com/64','model_sku_externo',NULL,'model_id_externo','VAR-203','variation_name','Único')
  );
  SELECT COALESCE(SUM((x->>'quantity')::int),0),
         COALESCE(SUM(((x->>'unit_price')::numeric) * ((x->>'quantity')::int)),0),
         COALESCE(ARRAY(SELECT DISTINCT x->>'variation_name' FROM jsonb_array_elements(items) x WHERE x->>'variation_name' IS NOT NULL), ARRAY[]::text[]),
         COALESCE((items->0)->>'item_name','Item 1')
  INTO qty, total, var_names, first_name
  FROM jsonb_array_elements(items) x;
  INSERT INTO public.marketplace_orders_presented_new (
    id, organizations_id, company_id, marketplace, marketplace_order_id,
    status, status_interno, order_total, items_total_quantity, items_total_amount,
    created_at, first_item_id, first_item_title, first_item_sku, first_item_variation_id, first_item_permalink,
    has_unlinked_items, unlinked_items_count, variation_color_names
  ) VALUES (
    o3, v_org_id, v_company_id, 'Mercado Livre', 'MOCK-AV-003',
    'Pendente', 'A vincular', total, qty, total,
    v_now, 'MLB123003', first_name, NULL, NULL, 'https://example.com/mock-3',
    TRUE, 3, var_names
  );
  INSERT INTO public.marketplace_order_items (id, model_sku_externo, model_id_externo, variation_name, pack_id, linked_products, item_name, quantity, unit_price, image_url)
  SELECT o3, NULL, (x->>'model_id_externo'), (x->>'variation_name'), NULL, NULL, (x->>'item_name'), (x->>'quantity')::int, (x->>'unit_price')::numeric, (x->>'image_url')
  FROM jsonb_array_elements(items) x;
  created_ids := array_append(created_ids, o3);

  RETURN jsonb_build_object('order_ids', created_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_mock_orders_a_vincular(uuid) TO authenticated;

COMMIT;

