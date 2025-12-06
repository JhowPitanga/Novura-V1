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
          .in('type', ['UNICO', 'VARIACAO_ITEM', 'ITEM'])
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

        setProducts(data);
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
        let payload = { ...productData, user_id: productData?.user_id ?? authUserId };
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
        return null;
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
                    .in('type', ['UNICO', 'VARIACAO_ITEM', 'ITEM'])
                    .order('name', { ascending: true });

                if (organizationId) {
                    try {
                        query = (query as any).eq('organizations_id', organizationId);
                    } catch (_) {
                        try {
                            const { data: orgRes } = await supabase.rpc('get_current_user_organization_id');
                            const orgId = Array.isArray(orgRes) ? orgRes?.[0] : orgRes;
                            if (orgId) {
                                query = (query as any).eq('organizations_id', orgId as any);
                            }
                        } catch { }
                    }
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
