-- ============================================================
-- Fix reorder_product_images transient unique cover conflicts
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.reorder_product_images(
  p_product_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id uuid;
  v_id     uuid;
  v_pos    int := 0;
BEGIN
  SELECT organizations_id INTO v_org_id
  FROM public.products
  WHERE id = p_product_id;

  IF NOT public.is_org_member(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Reset cover first to avoid transient unique-index conflicts
  UPDATE public.product_images
  SET is_cover = false
  WHERE product_id = p_product_id
    AND deleted_at IS NULL
    AND is_cover = true;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE public.product_images
    SET position = v_pos
    WHERE id = v_id
      AND product_id = p_product_id
      AND deleted_at IS NULL;
    v_pos := v_pos + 1;
  END LOOP;

  -- Set first image in the ordered list as cover
  IF array_length(p_ordered_ids, 1) >= 1 THEN
    UPDATE public.product_images
    SET is_cover = true
    WHERE id = p_ordered_ids[1]
      AND product_id = p_product_id
      AND deleted_at IS NULL;
  END IF;

  PERFORM public.sync_product_image_urls(p_product_id);
END;
$$;

COMMIT;
