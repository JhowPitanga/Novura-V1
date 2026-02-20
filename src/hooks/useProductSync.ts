import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { inventoryKeys } from "@/services/query-keys";
import { productKeys } from "@/services/query-keys";

export function useProductSync() {
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const queryClient = useQueryClient();

  const triggerSync = () => {
    setLastUpdate(Date.now());
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    queryClient.invalidateQueries({ queryKey: productKeys.all });
  };

  useEffect(() => {
    const channel = supabase
      .channel("products-stock-sync-legacy")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products_stock" },
        () => triggerSync()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => triggerSync()
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
