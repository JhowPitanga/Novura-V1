/**
 * useMutation wrappers for saving and duplicating a product.
 * Replaces inline supabase calls in EditProduct.tsx handleSalvar and the duplicate onClick.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveProduct, duplicateProduct, editKeys } from '@/services/productEdit.service';
import type { TransformedProduct } from '@/services/productEdit.service';

export function useProductSave(id: string | undefined) {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: ({ produto }: { produto: TransformedProduct }) => saveProduct(id!, produto),
    onSuccess: () => {
      if (id) queryClient.invalidateQueries({ queryKey: editKeys.product(id) });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateProduct(id!),
  });

  return {
    saveAsync: saveMutation.mutateAsync,
    duplicateAsync: duplicateMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
    saveError: saveMutation.error,
    duplicateError: duplicateMutation.error,
  };
}
