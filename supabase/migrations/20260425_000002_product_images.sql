-- ============================================================
-- T02/T03 - Product images table + RLS + Storage + RPC
-- ============================================================
BEGIN;

-- 1) Create product_images table
CREATE TABLE IF NOT EXISTS public.product_images (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path      text NOT NULL,    -- org/{orgId}/products/{productId}/original/{id}.webp
  public_url        text NOT NULL,
  width             int NOT NULL,
  height            int NOT NULL,
  size_bytes        int NOT NULL,
  format            text NOT NULL DEFAULT 'webp' CHECK (format IN ('webp')),
  is_cover          boolean NOT NULL DEFAULT false,
  position          int NOT NULL DEFAULT 0,
  checksum          text NOT NULL,    -- sha256 of final blob
  source_format     text NULL,        -- original format (jpg, png, heic, etc.)
  source_size_bytes int NULL,
  created_by        uuid NULL REFERENCES auth.users(id),
  deleted_at        timestamptz NULL,
  deleted_by        uuid NULL REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now() NOT NULL
);

-- 2) At most one cover per product (among non-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_cover
  ON public.product_images (product_id)
  WHERE is_cover AND deleted_at IS NULL;

-- 3) Listing index: product + position
CREATE INDEX IF NOT EXISTS idx_product_images_product_position
  ON public.product_images (product_id, position)
  WHERE deleted_at IS NULL;

-- 4) Org-level index for audit queries
CREATE INDEX IF NOT EXISTS idx_product_images_org
  ON public.product_images (organizations_id);

-- 5) Enable RLS
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- 6) RLS Policies
DROP POLICY IF EXISTS "product_images: members can select" ON public.product_images;
CREATE POLICY "product_images: members can select"
  ON public.product_images
  FOR SELECT
  USING (public.is_org_member(auth.uid(), organizations_id));

DROP POLICY IF EXISTS "product_images: owners/admins/sellers can insert" ON public.product_images;
CREATE POLICY "product_images: owners/admins/sellers can insert"
  ON public.product_images
  FOR INSERT
  WITH CHECK (public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin','seller']));

DROP POLICY IF EXISTS "product_images: owners/admins/sellers can update" ON public.product_images;
CREATE POLICY "product_images: owners/admins/sellers can update"
  ON public.product_images
  FOR UPDATE
  USING (public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin','seller']));

DROP POLICY IF EXISTS "product_images: owners/admins can delete" ON public.product_images;
CREATE POLICY "product_images: owners/admins can delete"
  ON public.product_images
  FOR DELETE
  USING (public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin']));

-- 7) Realtime
ALTER TABLE public.product_images REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.product_images';
  END IF;
END $$;

-- 8) RPC: register_product_image (security invoker → runs as caller)
CREATE OR REPLACE FUNCTION public.register_product_image(
  p_product_id        uuid,
  p_storage_path      text,
  p_public_url        text,
  p_width             int,
  p_height            int,
  p_size_bytes        int,
  p_checksum          text,
  p_is_cover          boolean DEFAULT false,
  p_position          int DEFAULT 0,
  p_source_format     text DEFAULT NULL,
  p_source_size_bytes int DEFAULT NULL
)
RETURNS public.product_images
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id  uuid;
  v_count   int;
  v_image   public.product_images;
BEGIN
  -- Validate product belongs to caller's org
  SELECT organizations_id INTO v_org_id
  FROM public.products
  WHERE id = p_product_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  IF NOT public.is_org_member(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Acesso negado ao produto';
  END IF;

  -- Check image limit (max 12 per product)
  SELECT COUNT(*) INTO v_count
  FROM public.product_images
  WHERE product_id = p_product_id AND deleted_at IS NULL;

  IF v_count >= 12 THEN
    RAISE EXCEPTION 'Limite de 12 imagens por produto atingido';
  END IF;

  -- Remove previous cover if new one is being set
  IF p_is_cover THEN
    UPDATE public.product_images
    SET is_cover = false
    WHERE product_id = p_product_id
      AND is_cover = true
      AND deleted_at IS NULL;
  END IF;

  -- Insert new image record
  INSERT INTO public.product_images (
    organizations_id, product_id, storage_path, public_url,
    width, height, size_bytes, format, is_cover, position,
    checksum, source_format, source_size_bytes, created_by
  )
  VALUES (
    v_org_id, p_product_id, p_storage_path, p_public_url,
    p_width, p_height, p_size_bytes, 'webp', p_is_cover, p_position,
    p_checksum, p_source_format, p_source_size_bytes, auth.uid()
  )
  RETURNING * INTO v_image;

  -- Sync image_urls array on products table
  PERFORM public.sync_product_image_urls(p_product_id);

  RETURN v_image;
END;
$$;

-- 9) Helper: sync products.image_urls from product_images
CREATE OR REPLACE FUNCTION public.sync_product_image_urls(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.products
  SET image_urls = ARRAY(
    SELECT public_url
    FROM public.product_images
    WHERE product_id = p_product_id
      AND deleted_at IS NULL
    ORDER BY position ASC, created_at ASC
  )
  WHERE id = p_product_id;
END;
$$;

-- 10) Trigger: auto-sync image_urls after insert/update/delete on product_images
CREATE OR REPLACE FUNCTION public.trg_sync_product_image_urls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_product_image_urls(OLD.product_id);
  ELSE
    PERFORM public.sync_product_image_urls(NEW.product_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_image_urls ON public.product_images;
CREATE TRIGGER trg_sync_product_image_urls
  AFTER INSERT OR UPDATE OR DELETE
  ON public.product_images
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_product_image_urls();

-- 11) RPC: reorder product images
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
  FROM public.products WHERE id = p_product_id;

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
    WHERE id = v_id AND product_id = p_product_id AND deleted_at IS NULL;
    v_pos := v_pos + 1;
  END LOOP;

  -- Set the first image in the ordered list as cover
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

-- 12) RPC: soft-delete image
CREATE OR REPLACE FUNCTION public.delete_product_image(p_image_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id    uuid;
  v_product_id uuid;
  v_was_cover boolean;
BEGIN
  SELECT organizations_id, product_id, is_cover
  INTO v_org_id, v_product_id, v_was_cover
  FROM public.product_images
  WHERE id = p_image_id AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Imagem não encontrada';
  END IF;

  IF NOT public.has_org_role(auth.uid(), v_org_id, ARRAY['owner','admin','seller']) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.product_images
  SET deleted_at = now(), deleted_by = auth.uid(), is_cover = false
  WHERE id = p_image_id;

  -- If deleted was cover, assign cover to first remaining image
  IF v_was_cover THEN
    UPDATE public.product_images
    SET is_cover = true
    WHERE id = (
      SELECT id
      FROM public.product_images
      WHERE product_id = v_product_id
        AND deleted_at IS NULL
      ORDER BY position ASC, created_at ASC
      LIMIT 1
    );
  END IF;

  PERFORM public.sync_product_image_urls(v_product_id);
END;
$$;

COMMIT;
