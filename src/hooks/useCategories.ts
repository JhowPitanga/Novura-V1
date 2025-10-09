
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

export type Category = Tables<'categories'>;

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar categorias';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createCategory = async (name: string, parent_id?: string | null) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name, parent_id: parent_id || null })
        .select()
        .single();

      if (error) throw error;
      
      fetchCategories(); 
      
      toast({
        title: "Sucesso",
        description: "Categoria criada com sucesso",
      });
      
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar categoria';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateCategory = async (categoryId: string, name: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', categoryId);

      if (error) throw error;
      
      fetchCategories();
      
      toast({
        title: "Sucesso",
        description: "Categoria atualizada com sucesso",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar categoria';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteCategory = async (categoryId: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', categoryId);

      if (error) throw error;
      
      fetchCategories();
      
      toast({
        title: "Sucesso",
        description: "Categoria excluída com sucesso",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir categoria';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return {
    categories,
    loading,
    createCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories,
  };
}
