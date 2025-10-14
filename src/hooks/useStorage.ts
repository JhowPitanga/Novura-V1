import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client'; // Caminho para seu cliente Supabase
import { Tables } from '@/integrations/supabase/types'; // Importa tipos de tabela do Supabase
import { useToast } from '@/hooks/use-toast'; // Importa seu hook de toast
import { useAuth } from '@/hooks/useAuth'; // Importa seu hook de autenticação (se necessário)

// Define o tipo para Storage, baseado na sua tabela 'storage'
export type Storage = Tables<'storage'>;

export function useStorage() {
  const [storageLocations, setStorageLocations] = useState<Storage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, organizationId } = useAuth(); // Assume que você tem um hook useAuth

  const fetchStorage = async () => {
    // Verifica se o usuário está logado antes de buscar, se o RLS exigir
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let query = supabase
        .from('storage')
        .select('*')
        .eq('active', true)
        .order('name');

      if (organizationId) {
        query = query.eq('organizations_id', organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setStorageLocations(data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar locais de armazenamento';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorage();
  }, [user]); // Adiciona 'user' como dependência para re-fetch quando o estado de autenticação mudar

  return {
    storageLocations,
    loading,
    refetch: fetchStorage,
  };
}