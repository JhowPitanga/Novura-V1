import { useQuery } from "@tanstack/react-query";
import { listGlobalOrders, ordersStatusSummary, type ListOrdersParams } from "@/services/admin-control.service";

export const adminOrderKeys = {
  list: (params: ListOrdersParams) => ["admin", "orders", "list", params] as const,
  summary: (orgId?: string) => ["admin", "orders", "summary", orgId ?? "all"] as const,
};

export function useAdminOrders(params: ListOrdersParams = {}) {
  return useQuery({
    queryKey: adminOrderKeys.list(params),
    queryFn: () => listGlobalOrders(params),
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useAdminOrdersSummary(organizationId?: string) {
  return useQuery({
    queryKey: adminOrderKeys.summary(organizationId),
    queryFn: () => ordersStatusSummary(organizationId),
    staleTime: 60 * 1000,
    retry: 2,
  });
}
