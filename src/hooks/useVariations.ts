import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export type VariationGroup = {
  id: string;
  name: string;
  sku: string;
  description?: string;
  image_urls: string[];
  category_id?: string;
  categories?: {
    id: string;
    name: string;
  };
  variations: any[];
  total_variations: number;
};

export function useVariations() {
  const [variationGroups, setVariationGroups] = useState<VariationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchVariations = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Buscar produtos pai de variações
      const { data: parentProducts, error: parentError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          sku,
          description,
          image_urls,
          category_id,
          categories (
            id,
            name
          )
        `)
        .eq('type', 'VARIACAO_PAI')
        .order('created_at', { ascending: false });

      if (parentError) throw parentError;

      // Para cada produto pai, buscar suas variações
      const variationGroupsWithVariations = await Promise.all(
        (parentProducts || []).map(async (parent) => {
          const { data: variations, error: variationsError } = await supabase
            .from('product_group_members')
            .select(`
              product_id,
              products (
                id,
                name,
                sku,
                cost_price,
                sell_price,
                image_urls,
                color,
                size,
                custom_attributes,
                products_stock (
                  id,
                  storage_id,
                  current,
                  reserved,
                  in_transit,
                  storage (
                    name
                  )
                )
              )
            `)
            .eq('product_group_id', parent.id);

          if (variationsError) {
            console.error('Error fetching variations for parent:', parent.id, variationsError);
            return {
              ...parent,
              variations: [],
              total_variations: 0
            };
          }

          const formattedVariations = (variations || [])
            .map(v => v.products)
            .filter(Boolean)
            .map(variation => ({
              ...variation,
              total_current_stock: Array.isArray(variation.products_stock) 
                ? variation.products_stock.reduce((sum, stock) => sum + (stock.current || 0), 0)
                : (variation.products_stock?.current || 0)
            }));

          return {
            ...parent,
            variations: formattedVariations,
            total_variations: formattedVariations.length
          };
        })
      );

      setVariationGroups(variationGroupsWithVariations);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar variações';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteVariationGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      setVariationGroups(prev => prev.filter(group => group.id !== groupId));
      toast({
        title: "Sucesso",
        description: "Grupo de variações excluído com sucesso",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir grupo de variações';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const duplicateVariationGroup = async (groupId: string) => {
    try {
      const { data, error } = await supabase.rpc('duplicate_product', {
        original_product_id: groupId
      });

      if (error) throw error;

      await fetchVariations();
      
      toast({
        title: "Sucesso",
        description: "Grupo de variações duplicado com sucesso",
      });

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao duplicar grupo de variações';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  useEffect(() => {
    fetchVariations();
  }, [user]);

  return {
    variationGroups,
    loading,
    refetch: fetchVariations,
    deleteVariationGroup,
    duplicateVariationGroup,
  };
}