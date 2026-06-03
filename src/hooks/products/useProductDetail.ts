/**
 * TanStack Query wrapper for loading a product for the edit page.
 * Replaces the [id]-triggered useState+useEffect fetch anti-pattern in EditProduct.tsx.
 */

import { useQuery } from '@tanstack/react-query';
import { loadProduct, editKeys } from '@/services/productEdit.service';

export function useProductDetail(id: string | undefined) {
  return useQuery({
    queryKey: editKeys.product(id ?? ''),
    queryFn: () => loadProduct(id!),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
