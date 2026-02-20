import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { inventoryKeys } from "@/services/query-keys";
import {
  fetchProductsWithDetailedStock,
  type FormattedProductStockData,
} from "@/services/inventory.service";

export type { FormattedProductStockData };

// Re-export for backward compatibility
export { fetchProductsWithDetailedStock };

export function useStockData() {
  const { user, organizationId } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: inventoryKeys.stock({ userId: user?.id, organizationId }),
    queryFn: () =>
      fetchProductsWithDetailedStock(user?.id, organizationId || undefined),
    enabled: !!user,
  });

  // Real-time subscription — invalidate cache on stock/product changes
  useEffect(() => {
    const channel = supabase
      .channel("products-stock-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products_stock" },
        () => {
          queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    stockData: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
