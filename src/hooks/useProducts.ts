// src/hooks/useProducts.ts

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProductSync } from '@/hooks/useProductSync';

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
export const useCreateProduct = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const createProduct = async (productData: any) => {
      setLoading(true);
      setError(null);
      try {
        const { data: authUserData } = await supabase.auth.getUser();
        const authUserId = authUserData?.user?.id;
        if (!authUserId) {
          throw new Error('Sessão inválida ou expirada');
        }
        let payload: Record<string, unknown> = { ...productData, user_id: productData?.user_id ?? authUserId };
        // Never let DB default fill parent_id for root product types (UNICO check + integrity)
        const t = payload.type as string | undefined;
        if (t === 'UNICO' || t === 'VARIACAO_PAI' || t === 'KIT') {
          payload = { ...payload, parent_id: null };
        }
        if (!payload.company_id) {
          try {
            const { data: orgId } = await supabase.rpc('get_current_user_organization_id');
            const organizationId = Array.isArray(orgId) ? orgId?.[0] : orgId;
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
                payload = { ...payload, company_id: companyId };
              }
              // Preenche organizations_id diretamente no product
              payload = { ...payload, organizations_id: organizationId };
            }
          } catch { /* noop */ }
        }
        const { data, error } = await supabase
          .from('products')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        return data;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    };

    return { createProduct, loading, error };
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
