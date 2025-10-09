import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export type KitProduct = {
  id: string;
  name: string;
  sku: string;
  description?: string;
  cost_price: number;
  sell_price?: number;
  image_urls: string[];
  category_id?: string;
  categories?: {
    id: string;
    name: string;
  };
  kit_items: Array<{
    id: string;
    quantity: number;
    product: {
      id: string;
      name: string;
      sku: string;
      current_stock: number;
    };
  }>;
  available_kits: number;
};

export function useKits() {
  const [kits, setKits] = useState<KitProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchKits = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Buscar produtos do tipo kit
      const { data: kitProducts, error: kitError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          sku,
          description,
          cost_price,
          sell_price,
          image_urls,
          category_id,
          categories (
            id,
            name
          )
        `)
        .eq('type', 'ITEM')
        .order('created_at', { ascending: false });

      if (kitError) throw kitError;

      // Para cada kit, buscar seus itens e calcular estoque disponível
      const kitsWithItems = await Promise.all(
        (kitProducts || []).map(async (kit) => {
          const { data: kitData, error: kitDataError } = await supabase
            .from('product_kits')
            .select(`
              id,
              product_kit_items (
                id,
                quantity,
                product_id,
                products (
                  id,
                  name,
                  sku,
                  products_stock (
                    current
                  )
                )
              )
            `)
            .eq('product_id', kit.id)
            .single();

          if (kitDataError) {
            console.error('Error fetching kit data for:', kit.id, kitDataError);
            return {
              ...kit,
              kit_items: [],
              available_kits: 0
            };
          }

          const kitItems = (kitData?.product_kit_items || []).map(item => ({
            id: item.id,
            quantity: item.quantity,
            product: {
              id: item.products.id,
              name: item.products.name,
              sku: item.products.sku,
              current_stock: Array.isArray(item.products.products_stock) 
                ? item.products.products_stock.reduce((sum, stock) => sum + (stock.current || 0), 0)
                : (item.products.products_stock?.current || 0)
            }
          }));

          // Calcular quantos kits podem ser feitos baseado no item com menor estoque
          let availableKits = Number.MAX_SAFE_INTEGER;
          for (const item of kitItems) {
            const possibleKits = Math.floor(item.product.current_stock / item.quantity);
            if (possibleKits < availableKits) {
              availableKits = possibleKits;
            }
          }

          // Se não há itens, não há kits disponíveis
          if (kitItems.length === 0) {
            availableKits = 0;
          }

          return {
            ...kit,
            kit_items: kitItems,
            available_kits: availableKits === Number.MAX_SAFE_INTEGER ? 0 : availableKits
          };
        })
      );

      setKits(kitsWithItems);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar kits';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteKit = async (kitId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', kitId);

      if (error) throw error;

      setKits(prev => prev.filter(kit => kit.id !== kitId));
      toast({
        title: "Sucesso",
        description: "Kit excluído com sucesso",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir kit';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const duplicateKit = async (kitId: string) => {
    try {
      const { data, error } = await supabase.rpc('duplicate_product', {
        original_product_id: kitId
      });

      if (error) throw error;

      await fetchKits();
      
      toast({
        title: "Sucesso",
        description: "Kit duplicado com sucesso",
      });

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao duplicar kit';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  useEffect(() => {
    fetchKits();
  }, [user]);

  return {
    kits,
    loading,
    refetch: fetchKits,
    deleteKit,
    duplicateKit,
  };
}