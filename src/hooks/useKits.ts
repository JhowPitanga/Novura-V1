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
  const { user, organizationId } = useAuth();

  const fetchKits = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let companyId: string | null = null;
      if (organizationId) {
        const { data: companiesForOrg } = await supabase
          .from('companies')
          .select('id')
          .eq('organization_id', organizationId)
          .order('is_active', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1);
        companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
      }

      let kitQuery = supabase
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
      kitQuery = companyId ? kitQuery.eq('company_id', companyId) : kitQuery.eq('user_id', user.id);
      const { data: kitProducts, error: kitError } = await kitQuery;

      if (kitError) throw kitError;

      const kitsWithItems = await Promise.all(
        (kitProducts || []).map(async (kit) => {
          let kitItemsQuery = supabase
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
          const { data: kitData, error: kitDataError } = companyId
            ? await (kitItemsQuery as any).eq('product_kit_items.products.company_id', companyId)
            : await (kitItemsQuery as any).eq('product_kit_items.products.user_id', user.id);

          let kitItems: any[] = [];
          if (!kitDataError && kitData) {
            kitItems = (kitData?.product_kit_items || []).map((item: any) => ({
              id: item.id,
              quantity: item.quantity,
              product: {
                id: item.products.id,
                name: item.products.name,
                sku: item.products.sku,
                current_stock: Array.isArray(item.products.products_stock) 
                  ? item.products.products_stock.reduce((sum: number, stock: any) => sum + (stock.current || 0), 0)
                  : (item.products.products_stock?.current || 0)
              }
            }));
          } else {
            let fallbackQuery = supabase
              .from('product_kit_items')
              .select(`
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
              `)
              .eq('kit_id', kit.id);
            const { data: fallbackItems } = companyId
              ? await (fallbackQuery as any).eq('products.company_id', companyId)
              : await (fallbackQuery as any).eq('products.user_id', user.id);
            kitItems = (fallbackItems || []).map((item: any) => ({
              id: item.id,
              quantity: item.quantity,
              product: {
                id: item.products.id,
                name: item.products.name,
                sku: item.products.sku,
                current_stock: Array.isArray(item.products.products_stock) 
                  ? item.products.products_stock.reduce((sum: number, stock: any) => sum + (stock.current || 0), 0)
                  : (item.products.products_stock?.current || 0)
              }
            }));
          }

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
  }, [user, organizationId]);

  return {
    kits,
    loading,
    refetch: fetchKits,
    deleteKit,
    duplicateKit,
  };
}
