-- ============================================================
-- Fix RLS for product images uploads and metadata persistence
-- ============================================================
BEGIN;

-- Ensure bucket exists with expected constraints
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  1572864,
  ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------
-- storage.objects policies for product-images
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "product-images: members can select own org files" ON storage.objects;
CREATE POLICY "product-images: members can select own org files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'product-images'
    AND split_part(name, '/', 1) = 'org'
    AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    AND public.is_org_member(auth.uid(), split_part(name, '/', 2)::uuid)
  );

DROP POLICY IF EXISTS "product-images: users with produtos.edit can insert own org files" ON storage.objects;
CREATE POLICY "product-images: users with produtos.edit can insert own org files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND split_part(name, '/', 1) = 'org'
    AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    AND split_part(name, '/', 2)::uuid = public.get_current_user_organization_id()
    AND public.current_user_has_permission('produtos', 'edit')
  );

DROP POLICY IF EXISTS "product-images: users with produtos.edit can update own org files" ON storage.objects;
CREATE POLICY "product-images: users with produtos.edit can update own org files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND split_part(name, '/', 1) = 'org'
    AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    AND split_part(name, '/', 2)::uuid = public.get_current_user_organization_id()
    AND public.current_user_has_permission('produtos', 'edit')
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND split_part(name, '/', 1) = 'org'
    AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    AND split_part(name, '/', 2)::uuid = public.get_current_user_organization_id()
    AND public.current_user_has_permission('produtos', 'edit')
  );

DROP POLICY IF EXISTS "product-images: users with produtos.edit can delete own org files" ON storage.objects;
CREATE POLICY "product-images: users with produtos.edit can delete own org files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND split_part(name, '/', 1) = 'org'
    AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    AND split_part(name, '/', 2)::uuid = public.get_current_user_organization_id()
    AND public.current_user_has_permission('produtos', 'edit')
  );

-- ----------------------------------------------------------------
-- product_images table policies aligned with produtos permissions
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "product_images: owners/admins/sellers can insert" ON public.product_images;
DROP POLICY IF EXISTS "product_images: owners/admins/sellers can update" ON public.product_images;
DROP POLICY IF EXISTS "product_images: owners/admins can delete" ON public.product_images;
DROP POLICY IF EXISTS "product_images: users with produtos.view can select" ON public.product_images;
DROP POLICY IF EXISTS "product_images: users with produtos.edit can insert" ON public.product_images;
DROP POLICY IF EXISTS "product_images: users with produtos.edit can update" ON public.product_images;
DROP POLICY IF EXISTS "product_images: users with produtos.edit can delete" ON public.product_images;

CREATE POLICY "product_images: users with produtos.view can select"
  ON public.product_images
  FOR SELECT
  USING (
    public.is_org_member(auth.uid(), organizations_id)
    AND (
      public.current_user_has_permission('produtos', 'view')
      OR public.current_user_has_permission('produtos', 'edit')
      OR public.current_user_has_permission('produtos', 'create')
      OR public.current_user_has_permission('produtos', 'delete')
    )
  );

CREATE POLICY "product_images: users with produtos.edit can insert"
  ON public.product_images
  FOR INSERT
  WITH CHECK (
    public.is_org_member(auth.uid(), organizations_id)
    AND public.current_user_has_permission('produtos', 'edit')
  );

CREATE POLICY "product_images: users with produtos.edit can update"
  ON public.product_images
  FOR UPDATE
  USING (
    public.is_org_member(auth.uid(), organizations_id)
    AND public.current_user_has_permission('produtos', 'edit')
  )
  WITH CHECK (
    public.is_org_member(auth.uid(), organizations_id)
    AND public.current_user_has_permission('produtos', 'edit')
  );

CREATE POLICY "product_images: users with produtos.edit can delete"
  ON public.product_images
  FOR DELETE
  USING (
    public.is_org_member(auth.uid(), organizations_id)
    AND public.current_user_has_permission('produtos', 'edit')
  );

COMMIT;
