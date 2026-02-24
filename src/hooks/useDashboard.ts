import { useQuery } from "@tanstack/react-query";
import { fetchExpiringCerts, fetchOrderStatusCounts } from "@/services/dashboard.service";

export const dashboardKeys = {
    expiringCerts: (orgId: string) => ['dashboard', 'expiring-certs', orgId] as const,
    orderStatusCounts: (orgId: string) => ['dashboard', 'order-status-counts', orgId] as const,
};

export function useExpiringCerts(orgId: string | null | undefined) {
    return useQuery({
        queryKey: dashboardKeys.expiringCerts(orgId || ''),
        queryFn: () => fetchExpiringCerts(orgId!),
        enabled: !!orgId,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

export function useOrderStatusCounts(orgId: string | null | undefined) {
    return useQuery({
        queryKey: dashboardKeys.orderStatusCounts(orgId || ''),
        queryFn: () => fetchOrderStatusCounts(orgId!),
        enabled: !!orgId,
        staleTime: 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });
}
