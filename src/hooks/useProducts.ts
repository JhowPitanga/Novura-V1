// src/hooks/useProducts.ts

/**
 * §1 SIZE EXCEPTION: ~210 LOC (limit 150).
 * Justified: file contains two legacy hooks (useProducts for fetching and useCreateProduct
 * for creating) sharing the same module boundary. useCreateProduct was gutted to a TanStack
 * adapter in this refactor pass (P-0). Migrating useProducts() data-fetch to a service
 * layer is deferred to a follow-up pass. Pre-existing violation (was 252 LOC at BASE).
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProductSync } from '@/hooks/useProductSync';
import { useCreateProductMutation } from '@/hooks/products/useCreateProductMutation';

// Hook para buscar todos os produtos de um usuário
export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, organizationId } = useAuth();
  const { lastUpdate } = useProductSync();

  useEffect(() => {
    const fetchProducts = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        let query = supabase
          .from('products')
          .select(`
            *,
            product_images (
              public_url,
              is_cover,
              position,
              created_at,
              deleted_at
            ),
            categories (
              id,
              name
            ),
            products_stock (
              current,
              reserved,
              in_transit,
              storage (
                id,
                name
              )
            )
          `)
          .in('type', ['UNICO', 'VARIACAO_ITEM', 'KIT', 'ITEM'])
          .order('name', { ascending: true });

        if (organizationId) {
          const { data: companiesForOrg } = await supabase
            .from('companies')
            .select('id')
            .eq('organization_id', organizationId)
            .order('is_active', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1);
          const companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
          if (companyId) {
            query = query.eq('company_id', companyId);
          } else {
            query = query.eq('user_id', user.id);
          }
        } else {
          query = query.eq('user_id', user.id);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        const normalized = (data ?? []).map((product: any) => {
          const normalizedImageUrls = Array.isArray(product.image_urls)
            ? product.image_urls.filter((url: string) => typeof url === 'string' && /^https?:\/\//i.test(url))
            : [];

          const productImages = Array.isArray(product.product_images)
            ? product.product_images
                .filter((img: any) => !img?.deleted_at && typeof img?.public_url === 'string')
                .sort((a: any, b: any) => {
                  if ((a?.is_cover ? 1 : 0) !== (b?.is_cover ? 1 : 0)) {
                    return (b?.is_cover ? 1 : 0) - (a?.is_cover ? 1 : 0);
                  }
                  if ((a?.position ?? 0) !== (b?.position ?? 0)) {
                    return (a?.position ?? 0) - (b?.position ?? 0);
                  }
                  return String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? ''));
                })
            : [];

          const coverFromProductImages = productImages[0]?.public_url;
          const mergedImages = Array.from(
            new Set([
              ...(coverFromProductImages ? [coverFromProductImages] : []),
              ...normalizedImageUrls,
            ])
          );

          return {
            ...product,
            image_urls: mergedImages,
          };
        });

        setProducts(normalized);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [user, lastUpdate]);

  return { products, loading, error };
}

// Hook para criar um novo produto
// Thin TanStack Query adapter — preserves legacy { createProduct, loading, error } shape.
export const useCreateProduct = () => {
  const mutation = useCreateProductMutation();

  const createProduct = async (productData: any) => {
    return mutation.mutateAsync(productData);
  };

  return {
    createProduct,
    loading: mutation.isPending,
    error: mutation.error ? (mutation.error as any).message ?? String(mutation.error) : null,
  };
};


// Hook para buscar produtos que podem ser vinculados
// Este resolve o erro 'useBindableProducts'
export function useBindableProducts(enabled: boolean = true) {
    const [bindableProducts, setBindableProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { user, organizationId } = useAuth();

    useEffect(() => {
        const fetchBindableProducts = async () => {
            if (!user || !enabled) {
                setLoading(false);
                return;
            }
            try {
                // Listar produtos acessíveis via RLS/permissões, com campos necessários para exibição
                let query = supabase
                    .from('products')
                    .select(`
                      id,
                      name,
                      sku,
                      image_urls,
                      barcode,
                      products_stock (
                        current,
                        reserved
                      )
                    `)
                    .in('type', ['UNICO', 'VARIACAO_ITEM', 'KIT', 'ITEM'])
                    .order('name', { ascending: true });

                if (organizationId) {
                    query = (query as any).eq('organizations_id', organizationId);
                }

                const { data, error } = await query;

                if (error) {
                    throw error;
                }
                // Mapear para incluir estoque disponível agregado e normalizar barcode como string
                const mapped = (data ?? []).map((p: any) => {
                    const stocks = p?.products_stock
                        ? (Array.isArray(p.products_stock) ? p.products_stock : [p.products_stock])
                        : [];
                    const totalCurrent = stocks.reduce((sum: number, s: any) => sum + (s?.current || 0), 0);
                    const totalReserved = stocks.reduce((sum: number, s: any) => sum + (s?.reserved || 0), 0);
                    const available = totalCurrent - totalReserved;
                    return {
                        id: p.id,
                        name: p.name,
                        sku: p.sku,
                        image_urls: p.image_urls,
                        barcode: p.barcode ? String(p.barcode) : undefined,
                        available_stock: available,
                    };
                });
                setBindableProducts(mapped);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchBindableProducts();
    }, [user, enabled]);

    return { bindableProducts, loading, error };
}
