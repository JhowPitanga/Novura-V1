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
  const { user } = useAuth();
  const { lastUpdate } = useProductSync();

  useEffect(() => {
    const fetchProducts = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
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
          .eq('user_id', user.id)
          .in('type', ['UNICO', 'VARIACAO_ITEM', 'ITEM'])
          .order('name', { ascending: true });

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
        const { data, error } = await supabase
          .from('products')
          .insert([productData])
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
export function useBindableProducts() {
    const [bindableProducts, setBindableProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        const fetchBindableProducts = async () => {
            if (!user) {
                setLoading(false);
                return;
            }
            try {
                // Listar produtos cadastrados do usuário, com campos necessários para exibição
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, sku, image_urls')
                    .eq('user_id', user.id)
                    .in('type', ['UNICO', 'VARIACAO_ITEM', 'ITEM'])
                    .order('name', { ascending: true });

                if (error) {
                    throw error;
                }
                setBindableProducts(data ?? []);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchBindableProducts();
    }, [user]);

    return { bindableProducts, loading, error };
}
