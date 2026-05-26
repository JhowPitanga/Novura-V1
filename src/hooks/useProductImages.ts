// React Query hook for product images management
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProductImages,
  uploadProductImage,
  reorderProductImages,
  deleteProductImage,
  type ProductImage,
} from '@/services/productImages.service';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function useProductImages(productId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['product-images', productId];

  const query = useQuery({
    queryKey,
    queryFn: () => getProductImages(productId!),
    enabled: !!productId,
    staleTime: STALE_TIME,
  });

  const uploadMutation = useMutation({
    mutationFn: (params: {
      file: File;
      isCover: boolean;
      position: number;
      organizationId: string;
    }) =>
      uploadProductImage({
        file: params.file,
        productId: productId!,
        organizationId: params.organizationId,
        isCover: params.isCover,
        position: params.position,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderProductImages(productId!, orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (params: { imageId: string; storagePath?: string }) =>
      deleteProductImage(params.imageId, params.storagePath),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    images: (query.data ?? []) as ProductImage[],
    isLoading: query.isLoading,
    isError: query.isError,
    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    reorder: reorderMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isRemoving: deleteMutation.isPending,
  };
}
