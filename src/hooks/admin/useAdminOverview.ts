import { useQuery } from "@tanstack/react-query";
import { getOverviewMetrics } from "@/services/admin-control.service";

export function useAdminOverviewMetrics() {
  return useQuery({
    queryKey: ["admin", "overview-metrics"],
    queryFn: getOverviewMetrics,
    staleTime: 60 * 1000,
    retry: 2,
  });
}
