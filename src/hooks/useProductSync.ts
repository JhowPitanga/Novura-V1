import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';


// Hook para sincronizar dados entre produtos e estoque
export function useProductSync() {
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // Função para forçar atualização de todos os componentes
  const triggerSync = () => {
    setLastUpdate(Date.now());
  };

  // Setup realtime listeners for products_stock updates
  useEffect(() => {
    const channel = supabase
      .channel('products-stock-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products_stock'
        },
        () => {
          // Trigger sync when stock changes
          triggerSync();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        () => {
          // Trigger sync when products change
          triggerSync();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    lastUpdate,
    triggerSync,
  };
}