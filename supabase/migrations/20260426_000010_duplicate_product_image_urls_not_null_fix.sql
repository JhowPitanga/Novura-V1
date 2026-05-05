-- Hotfix: duplicate_product must always provide products.image_urls (NOT NULL)
BEGIN;

CREATE OR REPLACE FUNCTION public.duplicate_product(
  p_product_id uuid,
  p_with_images boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id      uuid;
  v_new_sku     text;
  v_new_id      uuid;
  v_suffix      text;
  v_attempts    int := 0;
BEGIN
  SELECT organizations_id INTO v_org_id
  FROM public.products
  WHERE id = p_product_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  IF NOT public.is_org_member(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  LOOP
    v_suffix  := substring(md5(random()::text) FROM 1 FOR 4);
    SELECT sku || '-' || upper(v_suffix) INTO v_new_sku
    FROM public.products
    WHERE id = p_product_id;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.products
      WHERE organizations_id = v_org_id
        AND sku = v_new_sku
        AND deleted_at IS NULL
    );

    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Não foi possível gerar SKU único para duplicata';
    END IF;
  END LOOP;

  INSERT INTO public.products (
    organizations_id, company_id, user_id, type,
    name, sku, description, category_id,
    cost_price, sell_price,
    package_height, package_width, package_length, weight, weight_type,
    barcode, ncm, cest, tax_origin_code,
    color, size, custom_attributes, image_urls
  )
  SELECT
    organizations_id, company_id, auth.uid(), type,
    name || ' - Copia', v_new_sku, description, category_id,
    cost_price, sell_price,
    package_height, package_width, package_length, weight, weight_type,
    barcode, ncm, cest, tax_origin_code,
    color, size, custom_attributes, COALESCE(image_urls, ARRAY[]::text[])
  FROM public.products
  WHERE id = p_product_id
  RETURNING id INTO v_new_id;

  IF p_with_images THEN
    INSERT INTO public.product_images (
      organizations_id, product_id, storage_path, public_url,
      width, height, size_bytes, format, is_cover, position,
      checksum, source_format, source_size_bytes, created_by
    )
    SELECT
      organizations_id, v_new_id, storage_path, public_url,
      width, height, size_bytes, format, is_cover, position,
      checksum, source_format, source_size_bytes, auth.uid()
    FROM public.product_images
    WHERE product_id = p_product_id
      AND deleted_at IS NULL
    ORDER BY position ASC;

    PERFORM public.sync_product_image_urls(v_new_id);
  END IF;

  RETURN v_new_id;
END;
$$;

COMMIT;
