import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { getOrdersMetrics } from "@/hooks/useOrdersMetrics";
import { getListingsRanking } from "@/hooks/useListingsRanking";
import {
    fetchConnectedMarketplaces,
    fetchProductPerformance,
    fetchSalesByState,
    fetchAbcProducts,
    fetchAbcListings,
    fetchProductSalesBreakdown,
    fetchListingsSold,
    fetchFinancialOverview,
    type AbcCriterion,
} from "@/services/performance.service";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";

export const performanceKeys = {
    connectedMarketplaces: (orgId: string) =>
        ['performance', 'connected-marketplaces', orgId] as const,
    ordersMetrics: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'orders-metrics', from, to, marketplace, orgId] as const,
    listingsRanking: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'listings-ranking', from, to, marketplace, orgId] as const,
    productPerformance: (from: string, to: string, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'product-performance', from, to, marketplace, orgId] as const,
    salesByState: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'sales-by-state', from, to, marketplace, orgId] as const,
    abcProducts: (from: string | undefined, to: string | undefined, marketplace: string, criterion: AbcCriterion, orgId: string | null | undefined) =>
        ['performance', 'abc-products', from, to, marketplace, criterion, orgId] as const,
    abcListings: (from: string | undefined, to: string | undefined, marketplace: string, criterion: AbcCriterion, orgId: string | null | undefined) =>
        ['performance', 'abc-listings', from, to, marketplace, criterion, orgId] as const,
    productBreakdown: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'product-breakdown', from, to, marketplace, orgId] as const,
    listingsSold: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'listings-sold', from, to, marketplace, orgId] as const,
    financialOverview: (from: string | undefined, to: string | undefined, marketplace: string, orgId: string | null | undefined) =>
        ['performance', 'financial-overview', from, to, marketplace, orgId] as const,
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

export function useProductPerformance(
    orgId: string | null | undefined,
    dateRange?: DateRange | undefined,
    marketplace?: string,
) {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 6);
    const from = dateRange?.from ?? defaultFrom;
    const to = dateRange?.to ?? now;
    const fromISO = new Date(calendarStartOfDaySPEpochMs(from)).toISOString();
    const toISO = new Date(calendarEndOfDaySPEpochMs(to)).toISOString();
    const mktDisplay = marketplace ?? 'todos';

    return useQuery({
        queryKey: performanceKeys.productPerformance(fromISO, toISO, mktDisplay, orgId),
        queryFn: () => fetchProductPerformance(orgId, fromISO, toISO, mktDisplay),
        enabled: !!orgId,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSalesByState(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined,
) {
    return useQuery({
        queryKey: performanceKeys.salesByState(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            orgId,
        ),
        queryFn: () => fetchSalesByState(orgId!, dateRange, marketplace),
        enabled: !!orgId && !!dateRange?.from,
        staleTime: 2 * 60 * 1000,
    });
}

export function useAbcProducts(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined,
    criterion: AbcCriterion = 'valor',
) {
    return useQuery({
        queryKey: performanceKeys.abcProducts(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            criterion,
            orgId,
        ),
        queryFn: () => fetchAbcProducts(orgId!, dateRange, marketplace, criterion),
        enabled: !!orgId && !!dateRange?.from,
        staleTime: 5 * 60 * 1000,
    });
}

export function useAbcListings(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined,
    criterion: AbcCriterion = 'valor',
) {
    return useQuery({
        queryKey: performanceKeys.abcListings(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            criterion,
            orgId,
        ),
        queryFn: () => fetchAbcListings(orgId!, dateRange, marketplace, criterion),
        enabled: !!orgId && !!dateRange?.from,
        staleTime: 5 * 60 * 1000,
    });
}

export function useProductSalesBreakdown(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined,
) {
    return useQuery({
        queryKey: performanceKeys.productBreakdown(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            orgId,
        ),
        queryFn: () => fetchProductSalesBreakdown(orgId!, dateRange, marketplace),
        enabled: !!orgId && !!dateRange?.from,
        staleTime: 5 * 60 * 1000,
    });
}

export function useListingsSold(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined,
) {
    return useQuery({
        queryKey: performanceKeys.listingsSold(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            orgId,
        ),
        queryFn: () => fetchListingsSold(orgId!, dateRange, marketplace),
        enabled: !!orgId && !!dateRange?.from,
        staleTime: 2 * 60 * 1000,
    });
}

export function useFinancialOverview(
    dateRange: DateRange | undefined,
    marketplace: string,
    orgId: string | null | undefined,
) {
    return useQuery({
        queryKey: performanceKeys.financialOverview(
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString(),
            marketplace,
            orgId,
        ),
        queryFn: () => fetchFinancialOverview(orgId!, dateRange, marketplace),
        enabled: !!orgId && !!dateRange?.from,
        staleTime: 2 * 60 * 1000,
    });
}
