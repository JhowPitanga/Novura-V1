-- ============================================================
-- T12 - product_kits: add conversion tracking + RPCs
-- ============================================================
BEGIN;

-- 1) Track which product(s) originated a kit via conversion
ALTER TABLE public.product_kits
  ADD COLUMN IF NOT EXISTS converted_from_product_id uuid NULL
    REFERENCES public.products(id) ON DELETE SET NULL;

-- 2) Add unique constraint on kit items (no duplicate product per kit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_kit_items'::regclass
      AND conname = 'uq_product_kit_items_kit_product'
  ) THEN
    ALTER TABLE public.product_kit_items
      ADD CONSTRAINT uq_product_kit_items_kit_product
      UNIQUE (kit_id, product_id);
  END IF;
END $$;

-- 3) Quantity must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_kit_items'::regclass
      AND conname = 'product_kit_items_quantity_positive'
  ) THEN
    ALTER TABLE public.product_kit_items
      ADD CONSTRAINT product_kit_items_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;

-- 4) RPC: duplicate_product
CREATE OR REPLACE FUNCTION public.duplicate_product(
  p_product_id   uuid,
  p_with_images  boolean DEFAULT false
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
  FROM public.products WHERE id = p_product_id;

  IF NOT public.is_org_member(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Generate unique SKU with random suffix
  LOOP
    v_suffix  := substring(md5(random()::text) FROM 1 FOR 4);
    SELECT sku || '-' || upper(v_suffix) INTO v_new_sku
    FROM public.products WHERE id = p_product_id;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE organizations_id = v_org_id
        AND sku = v_new_sku
        AND deleted_at IS NULL
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Não foi possível gerar SKU único para duplicata';
    END IF;
  END LOOP;

  -- Insert duplicate
  INSERT INTO public.products (
    organizations_id, company_id, user_id, type,
    name, sku, description, category_id,
    cost_price, sell_price,
    package_height, package_width, package_length, weight, weight_type,
    barcode, ncm, cest, tax_origin_code,
    color, size, custom_attributes
  )
  SELECT
    organizations_id, company_id, auth.uid(), type,
    name || ' — Cópia', v_new_sku, description, category_id,
    cost_price, sell_price,
    package_height, package_width, package_length, weight, weight_type,
    barcode, ncm, cest, tax_origin_code,
    color, size, custom_attributes
  FROM public.products
  WHERE id = p_product_id
  RETURNING id INTO v_new_id;

  -- Optionally duplicate image references (same storage_path, not a real copy)
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
    WHERE product_id = p_product_id AND deleted_at IS NULL
    ORDER BY position ASC;

    PERFORM public.sync_product_image_urls(v_new_id);
  END IF;

  RETURN v_new_id;
END;
$$;

-- 5) RPC: convert_products_to_kit
CREATE OR REPLACE FUNCTION public.convert_products_to_kit(
  p_product_ids  uuid[],
  p_kit          jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id         uuid;
  v_company_id     uuid;
  v_kit_product_id uuid;
  v_kit_id         uuid;
  v_pid            uuid;
  v_qty            int;
  v_kit_name       text;
  v_kit_sku        text;
  v_sell_price     numeric;
BEGIN
  -- Validate minimum 2 products
  IF array_length(p_product_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Mínimo de 2 produtos para criar um kit';
  END IF;

  -- Get org from first product
  SELECT organizations_id, company_id INTO v_org_id, v_company_id
  FROM public.products WHERE id = p_product_ids[1];

  IF NOT public.is_org_member(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Validate all products are UNICO and belong to same org
  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE id = ANY(p_product_ids)
      AND (type <> 'UNICO' OR organizations_id <> v_org_id OR deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Todos os produtos devem ser do tipo Único e pertencer à mesma organização';
  END IF;

  v_kit_name   := p_kit->>'name';
  v_kit_sku    := p_kit->>'sku';
  v_sell_price := (p_kit->>'sell_price')::numeric;

  -- Create kit product
  INSERT INTO public.products (
    organizations_id, company_id, user_id, type,
    name, sku, sell_price
  )
  VALUES (
    v_org_id, v_company_id, auth.uid(), 'KIT',
    v_kit_name, v_kit_sku, v_sell_price
  )
  RETURNING id INTO v_kit_product_id;

  -- Create kit record
  INSERT INTO public.product_kits (product_id)
  VALUES (v_kit_product_id)
  RETURNING id INTO v_kit_id;

  -- Add kit items with quantities from JSON
  FOREACH v_pid IN ARRAY p_product_ids LOOP
    -- Extract quantity for this product_id from the JSON array
    SELECT COALESCE((p_kit->'items'->>(row_number() OVER () - 1)::int)::int, 1)
    INTO v_qty
    FROM (VALUES (v_pid)) AS t(pid);

    -- Fallback: use quantity from items array keyed by product_id
    v_qty := COALESCE(
      (SELECT (elem->>'quantity')::int
       FROM jsonb_array_elements(p_kit->'items') AS elem
       WHERE elem->>'product_id' = v_pid::text
       LIMIT 1),
      1
    );

    INSERT INTO public.product_kit_items (kit_id, product_id, quantity)
    VALUES (v_kit_id, v_pid, v_qty);
  END LOOP;

  RETURN v_kit_product_id;
END;
$$;

COMMIT;
