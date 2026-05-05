// T11 — Hook for duplicating a product via RPC duplicate_product
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DuplicateOptions {
  withImages?: boolean;
  redirectToEdit?: boolean;
}

export function useDuplicateProduct() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      productId,
      withImages = false,
    }: {
      productId: string;
      withImages?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('duplicate_product', {
        p_product_id: productId,
        p_with_images: withImages,
      });
      if (error) throw error;
      return data as string; // Returns new product UUID
    },
    onSuccess: (newProductId, variables, context) => {
      // Invalidate all product list queries
      queryClient.invalidateQueries({ queryKey: ['products-list'] });
      toast({
        title: 'Produto duplicado',
        description: 'Redirecionando para a edição da cópia...',
      });
      navigate(`/produtos/editar/${newProductId}`);
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao duplicar',
        description: err?.message || 'Não foi possível duplicar o produto.',
        variant: 'destructive',
      });
    },
  });

  return {
    duplicate: mutation.mutate,
    duplicateAsync: mutation.mutateAsync,
    isDuplicating: mutation.isPending,
  };
}
