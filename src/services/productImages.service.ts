// Product images service — upload, register, reorder, cover, delete
import { supabase } from '@/integrations/supabase/client';
import { processImageForUpload, buildImageStoragePath } from '@/utils/imageProcessor';

export interface ProductImage {
  id: string;
  product_id: string;
  organizations_id: string;
  storage_path: string;
  public_url: string;
  width: number;
  height: number;
  size_bytes: number;
  format: string;
  is_cover: boolean;
  position: number;
  checksum: string;
  source_format: string | null;
  source_size_bytes: number | null;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Fetches all active images for a product, ordered by position.
 */
export async function getProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProductImage[];
}

/**
 * Processes a File (canvas WebP pipeline) and uploads to Supabase Storage,
 * then registers the image via RPC and returns the ProductImage record.
 */
export async function uploadProductImage(params: {
  file: File;
  productId: string;
  organizationId: string;
  isCover: boolean;
  position: number;
}): Promise<ProductImage> {
  const { file, productId, organizationId, isCover, position } = params;

  // 1) Process image (crop 1:1, WebP, quality fallback)
  const processed = await processImageForUpload(file);

  // 2) Generate unique storage path
  const imageId = crypto.randomUUID();
  const storagePath = buildImageStoragePath(organizationId, productId, imageId);

  // 3) Upload to Storage
  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(storagePath, processed.blob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // 4) Get public URL
  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // 5) Register via RPC
  const { data, error: rpcError } = await supabase.rpc('register_product_image', {
    p_product_id: productId,
    p_storage_path: storagePath,
    p_public_url: publicUrl,
    p_width: processed.width,
    p_height: processed.height,
    p_size_bytes: processed.blob.size,
    p_checksum: processed.checksum,
    p_is_cover: isCover,
    p_position: position,
    p_source_format: processed.sourceFormat,
    p_source_size_bytes: processed.sourceSizeBytes,
  });

  if (rpcError) throw rpcError;
  return data as ProductImage;
}

/**
 * Uploads multiple images in parallel. Returns results per-file (settled).
 */
export async function uploadProductImages(params: {
  files: File[];
  productId: string;
  organizationId: string;
  startPosition?: number;
  firstIsCover?: boolean;
}): Promise<PromiseSettledResult<ProductImage>[]> {
  const { files, productId, organizationId, startPosition = 0, firstIsCover = false } = params;

  return Promise.allSettled(
    files.map((file, idx) =>
      uploadProductImage({
        file,
        productId,
        organizationId,
        isCover: firstIsCover && idx === 0,
        position: startPosition + idx,
      })
    )
  );
}

/**
 * Reorders images by passing an ordered array of image IDs.
 * The first ID becomes the cover automatically.
 */
export async function reorderProductImages(
  productId: string,
  orderedIds: string[]
): Promise<void> {
  const { error } = await supabase.rpc('reorder_product_images', {
    p_product_id: productId,
    p_ordered_ids: orderedIds,
  });
  if (error) throw error;
}

/**
 * Soft-deletes image metadata and removes physical file from Storage only
 * when there are no active references to the same storage_path.
 */
export async function deleteProductImage(imageId: string, storagePath?: string): Promise<void> {
  const { error } = await supabase.rpc('delete_product_image', {
    p_image_id: imageId,
  });
  if (error) throw error;

  // Best-effort physical cleanup to optimize storage costs.
  // Metadata is already soft-deleted in DB even if this step fails.
  // Keep shared images safe: only delete from storage if no other product
  // still references this storage path.
  if (storagePath) {
    const { count, error: refError } = await supabase
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('storage_path', storagePath)
      .is('deleted_at', null);

    if (refError) {
      console.warn('Falha ao validar referências da imagem no banco:', refError);
      return;
    }

    const hasActiveReferences = (count ?? 0) > 0;
    if (hasActiveReferences) {
      return;
    }

    const { error: storageError } = await supabase.storage
      .from('product-images')
      .remove([storagePath]);
    if (storageError) {
      // Do not fail the whole delete flow for storage cleanup issues.
      console.warn('Falha ao remover arquivo físico da imagem:', storageError);
    }
  }
}
