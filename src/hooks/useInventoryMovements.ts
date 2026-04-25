import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchInventoryMovements,
  type MovementsFilters,
  type MovementsPage,
} from "@/services/movements.service";

export const movementKeys = {
  all: ["inventory-movements"] as const,
  list: (orgId: string, filters: MovementsFilters, page: number) =>
    ["inventory-movements", "list", orgId, filters, page] as const,
};

export function useInventoryMovements(filters: MovementsFilters = {}, page = 0) {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<MovementsPage>({
    queryKey: movementKeys.list(organizationId || "", filters, page),
    queryFn: () => fetchInventoryMovements(organizationId!, filters, page),
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Invalidate when new transactions arrive via realtime
  useEffect(() => {
    if (!organizationId) return;
    const channel = (supabase as any)
      .channel(`inventory-movements-realtime-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_transactions",
          filter: `organizations_id=eq.${organizationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: movementKeys.all });
        }
      )
      .subscribe();

    return () => {
      try { (supabase as any).removeChannel(channel); } catch {}
    };
  }, [organizationId, queryClient]);

  return {
    movements: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    summary: query.data?.summary ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
}
