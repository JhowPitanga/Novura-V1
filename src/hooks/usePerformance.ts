import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { getOrdersMetrics } from "@/hooks/useOrdersMetrics";
import { getListingsRanking } from "@/hooks/useListingsRanking";
import { fetchConnectedMarketplaces, fetchProductPerformance } from "@/services/performance.service";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";

export const performanceKeys = {
    connectedMarketplaces: (orgId: string) =>
        ['performance', 'connected-marketplaces', orgId] as const,
    ordersMetrics: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'orders-metrics', from, to, marketplace, orgId] as const,
    listingsRanking: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'listings-ranking', from, to, marketplace, orgId] as const,
    productPerformance: (orgId: string | null | undefined) =>
        ['performance', 'product-performance', orgId] as const,
};

export function useConnectedMarketplaces(orgId: string | null | undefined) {
    return useQuery({
        queryKey: performanceKeys.connectedMarketplaces(orgId || ''),
        queryFn: () => fetchConnectedMarketplaces(orgId!),
        enabled: !!orgId,
        staleTime: 10 * 60 * 1000,
    });
}

export function useOrdersMetrics(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined
) {
    return useQuery({
        queryKey: performanceKeys.ordersMetrics(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            orgId
        ),
        queryFn: () => getOrdersMetrics(dateRange, marketplace, orgId),
        staleTime: 2 * 60 * 1000,
    });
}

export function useListingsRanking(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined
) {
    return useQuery({
        queryKey: performanceKeys.listingsRanking(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            orgId
        ),
        queryFn: () => getListingsRanking(dateRange, marketplace, orgId),
        enabled: !!orgId,
        staleTime: 2 * 60 * 1000,
    });
}

export function useProductPerformance(orgId: string | null | undefined) {
    return useQuery({
        queryKey: performanceKeys.productPerformance(orgId),
        queryFn: () => {
            const now = new Date();
            const defaultFrom = new Date(now);
            defaultFrom.setDate(defaultFrom.getDate() - 6);
            const fromISO = new Date(calendarStartOfDaySPEpochMs(defaultFrom)).toISOString();
            const toISO = new Date(calendarEndOfDaySPEpochMs(now)).toISOString();
            return fetchProductPerformance(orgId, fromISO, toISO);
        },
        enabled: !!orgId,
        staleTime: 5 * 60 * 1000,
    });
}
