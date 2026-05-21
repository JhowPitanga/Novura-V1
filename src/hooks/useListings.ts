import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    fetchConnectedMarketplaces,
    fetchMarketplaceStores,
    fetchListings,
    fetchDrafts,
    deleteListingItem,
    deleteDraft,
    deleteDrafts,
    createDraftFromListing,
    syncAllListings,
    syncSelectedListings,
    syncSingleListing,
    updateItemStatus,
    updateShopeeStock,
    fetchFulfillmentStockForListings,
    fetchStockDistributionForListings,
    type StockDistributionEntry,
} from "@/services/listings.service";
import { fetchListingLinks } from "@/services/listingLinks.service";
import {
    parseListingRow,
    slugFromMarketplacePath,
    marketplacePathFromSlug,
} from "@/utils/listingUtils";
import type { MarketplaceNavItem } from "@/types/listings";
import type {
    ListingAppliedFilters,
    ListingItem,
    ListingLinkFilter,
    ListingLogisticFilter,
    ListingStatusFilter,
    ListingStockFilter,
    ShippingCaps,
    SortKey,
    SortDir,
} from "@/types/listings";

// ─── Query Keys ────────────────────────────────────────────────────────────

export const listingKeys = {
    marketplaces: (orgId: string) => ['listings', 'marketplaces', orgId] as const,
    stores: (orgId: string, marketplace: string) => ['listings', 'stores', orgId, marketplace] as const,
    items: (orgId: string, marketplaceSlug: string) => ['listings', 'items', orgId, marketplaceSlug] as const,
    drafts: (orgId: string) => ['listings', 'drafts', orgId] as const,
};

export interface ListingsItemsQueryData {
    rows: any[];
    isCanonical: boolean;
}

const LISTINGS_PATH_RESERVED = new Set([
    'todos', 'ativos', 'inativos', 'rascunhos', 'promocoes', 'criar', 'edicao',
]);

/** Resolve active marketplace nav path from URL (?marketplace=) or legacy path segment. */
export function resolveMarketplacePathFromUrl(
    pathname: string,
    search: string,
    navItems: MarketplaceNavItem[],
): string {
    if (!navItems.length) return '';

    const fromQuery = new URLSearchParams(search).get('marketplace');
    if (fromQuery) {
        const path = marketplacePathFromSlug(fromQuery);
        const match = navItems.find((n) => n.path === path);
        if (match) return match.path;
    }

    const segMatch = pathname.match(/^\/anuncios\/([^/]+)/);
    const seg = segMatch?.[1];
    if (seg && !LISTINGS_PATH_RESERVED.has(seg)) {
        const path = marketplacePathFromSlug(seg);
        const match = navItems.find((n) => n.path === path);
        if (match) return match.path;
    }

    return navItems[0].path;
}

export function marketplaceSlugForPath(path: string): string {
    return slugFromMarketplacePath(path);
}

// ─── Connected Marketplaces ────────────────────────────────────────────────

export function useConnectedMarketplaces(orgId: string | null | undefined) {
    return useQuery({
        queryKey: listingKeys.marketplaces(orgId || ''),
        queryFn: () => fetchConnectedMarketplaces(orgId!),
        enabled: !!orgId,
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

export function useMarketplaceStores(
    orgId: string | null | undefined,
    marketplaceDisplayName: string,
) {
    return useQuery({
        queryKey: listingKeys.stores(orgId || '', marketplaceDisplayName),
        queryFn: () => fetchMarketplaceStores(orgId!, marketplaceDisplayName),
        enabled: !!orgId && !!marketplaceDisplayName,
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

// ─── Listing Items ─────────────────────────────────────────────────────────

interface UseListingItemsOptions {
    orgId: string | null | undefined;
    selectedDisplayName: string;
    selectedPath: string;
    shippingCaps: ShippingCaps | null;
}

const EMPTY_PARSE_CTX = {
    metricsByItemId: {} as Record<string, { quality_level?: string | null; performance_data?: any }>,
    listingTypeByItemId: {} as Record<string, string | null>,
    shippingTypesByItemId: {} as Record<string, string[]>,
    listingPricesByItemId: {} as Record<string, any>,
};

export function useListingItems({ orgId, selectedDisplayName, selectedPath, shippingCaps }: UseListingItemsOptions) {
    const queryClient = useQueryClient();
    const marketplaceSlug = marketplaceSlugForPath(selectedPath);

    const query = useQuery({
        queryKey: listingKeys.items(orgId || '', marketplaceSlug),
        queryFn: async (): Promise<ListingsItemsQueryData> => {
            const result = await fetchListings(orgId!, selectedDisplayName);
            return { rows: result.rows, isCanonical: !!result.isCanonical };
        },
        enabled: !!orgId && !!marketplaceSlug && !!selectedDisplayName,
        staleTime: 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });

    const rawItems = query.data?.rows ?? [];
    const isCanonicalSource = query.data?.isCanonical ?? false;

    const patchRawItems = useCallback(
        (updater: (prev: any[]) => any[]) => {
            if (!orgId || !marketplaceSlug) return;
            queryClient.setQueryData<ListingsItemsQueryData>(
                listingKeys.items(orgId, marketplaceSlug),
                (old) => {
                    const prev = old?.rows ?? [];
                    return {
                        rows: updater(prev),
                        isCanonical: old?.isCanonical ?? isCanonicalSource,
                    };
                },
            );
        },
        [orgId, marketplaceSlug, queryClient, isCanonicalSource],
    );

    // Real-time: canonical listings + legacy metrics
    useEffect(() => {
        if (!orgId) return;
        const channel = (supabase as any)
            .channel(`marketplace_listings_${orgId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_listings',
                filter: `organizations_id=eq.${orgId}`,
            }, () => {
                queryClient.invalidateQueries({ queryKey: listingKeys.items(orgId, marketplaceSlug) });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_listing_metrics',
                filter: `organizations_id=eq.${orgId}`,
            }, () => {
                queryClient.invalidateQueries({ queryKey: listingKeys.items(orgId, marketplaceSlug) });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_listing_quality',
                filter: `organizations_id=eq.${orgId}`,
            }, () => {
                queryClient.invalidateQueries({ queryKey: listingKeys.items(orgId, marketplaceSlug) });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_items',
                filter: `organizations_id=eq.${orgId}`,
            }, (payload: any) => {
                if (isCanonicalSource) return;
                patchRawItems((prev: any[]) => {
                    const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
                    const n = payload.new as any;
                    const o = payload.old as any;
                    if (evt === 'INSERT' && n) {
                        const exists = prev.some(r => r.id === n.id);
                        return exists ? prev.map(r => r.id === n.id ? n : r) : [n, ...prev];
                    }
                    if (evt === 'UPDATE' && n) return prev.map(r => r.id === n.id ? n : r);
                    if (evt === 'DELETE' && o) return prev.filter(r => r.id !== o.id);
                    return prev;
                });
            })
            .subscribe();
        return () => { try { (supabase as any).removeChannel(channel); } catch {} };
    }, [orgId, isCanonicalSource, marketplaceSlug, queryClient, patchRawItems]);

    const parseCtx = useMemo(
        () => ({ ...EMPTY_PARSE_CTX, shippingCaps }),
        [shippingCaps],
    );

    const parsedItems: ListingItem[] = useMemo(
        () => rawItems.map(row => parseListingRow(row, parseCtx)),
        [rawItems, parseCtx],
    );

    const fullItemIds = useMemo(
        () => parsedItems
            .filter(ad => ad.shippingTags.some(t => String(t).toLowerCase() === "full"))
            .map(ad => ad.marketplaceId)
            .filter(Boolean),
        [parsedItems]
    );

    const marketplaceNameForLinks = selectedDisplayName || '';

    const linksQuery = useQuery({
        queryKey: ['listing-links', orgId, marketplaceNameForLinks],
        queryFn: () => fetchListingLinks(orgId!, marketplaceNameForLinks),
        enabled: !!orgId && !!marketplaceNameForLinks,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });

    const allItemIds = useMemo(
        () => parsedItems.map(ad => ad.marketplaceId).filter(Boolean),
        [parsedItems]
    );
    const isShopeeSelected = String(selectedDisplayName || '').toLowerCase() === 'shopee';

    const fulfillmentStockQuery = useQuery({
        queryKey: ['fulfillment-stock-listings', orgId, fullItemIds],
        queryFn: () => fetchFulfillmentStockForListings(orgId!, fullItemIds),
        enabled: !!orgId && fullItemIds.length > 0,
        staleTime: 5 * 60 * 1000,
    });

    const stockDistributionQuery = useQuery({
        queryKey: ['stock-distribution', orgId, allItemIds],
        queryFn: () => fetchStockDistributionForListings(orgId!, allItemIds),
        enabled: !!orgId && allItemIds.length > 0 && !isShopeeSelected,
        staleTime: 5 * 60 * 1000,
    });

    const listingTypeByItemId = useMemo(() => {
        const m: Record<string, string | null> = {};
        rawItems.forEach((r: any) => {
            const id = String(r?.marketplace_item_id || r?.id || '');
            if (id) m[id] = r?.listing_type_id ? String(r.listing_type_id) : null;
        });
        return m;
    }, [rawItems]);

    const enrichedItems: ListingItem[] = useMemo(() => {
        const fsMap = fulfillmentStockQuery.data;
        const linksMap = linksQuery.data;
        const distMap = stockDistributionQuery.data;
        return parsedItems.map(ad => {
            const fs = fsMap?.get(ad.marketplaceId);
            const linkKey = `${ad.marketplaceId}:`;
            const linkedProductId = linksMap?.get(linkKey) ?? null;
            const linkedVariationMap: Record<string, string> = {};
            if (linksMap) {
                for (const [k, v] of linksMap.entries()) {
                    const [itemId, variationId] = String(k).split(":");
                    if (itemId === ad.marketplaceId && variationId) {
                        linkedVariationMap[variationId] = v;
                    }
                }
            }
            const stockDistribution = distMap?.get(ad.marketplaceId) ?? undefined;
            return {
                ...ad,
                fulfillmentQty: fs ? fs.qty : (ad.fulfillmentQty ?? null),
                fulfillmentWarehouseName: fs ? fs.warehouseName : (ad.fulfillmentWarehouseName ?? null),
                linkedProductId,
                linkedVariationMap,
                stockDistribution,
            };
        });
    }, [parsedItems, fulfillmentStockQuery.data, linksQuery.data, stockDistributionQuery.data]);

    const isLoading = query.isPending || (query.isFetching && query.data === undefined);

    return {
        parsedItems: enrichedItems,
        rawItems,
        patchRawItems,
        listingTypeByItemId,
        isCanonicalSource,
        isLoading,
        isFetching: query.isFetching,
        refetch: query.refetch,
    };
}

// ─── Drafts ────────────────────────────────────────────────────────────────

export function useListingDrafts(orgId: string | null | undefined, activeStatus: string) {
    return useQuery({
        queryKey: listingKeys.drafts(orgId || ''),
        queryFn: () => fetchDrafts(orgId!),
        enabled: !!orgId && activeStatus === 'rascunhos',
        staleTime: 2 * 60 * 1000,
    });
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export function useListingMutations(orgId: string | null | undefined) {
    const queryClient = useQueryClient();

    const deleteItem = useMutation({
        mutationFn: ({ marketplaceItemId }: { marketplaceItemId: string }) =>
            deleteListingItem(orgId!, marketplaceItemId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listings', 'items'] }),
    });

    const deleteDraftMut = useMutation({
        mutationFn: ({ draftId }: { draftId: string }) => deleteDraft(orgId!, draftId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: listingKeys.drafts(orgId || '') }),
    });

    const deleteDraftsMut = useMutation({
        mutationFn: ({ draftIds }: { draftIds: string[] }) => deleteDrafts(orgId!, draftIds),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: listingKeys.drafts(orgId || '') }),
    });

    const createDraftMut = useMutation({
        mutationFn: ({ itemRow, listingTypeId }: { itemRow: any; listingTypeId: string | null }) =>
            createDraftFromListing(orgId!, itemRow, listingTypeId),
    });

    const syncAll = useMutation({
        mutationFn: ({ marketplaceDisplay }: { marketplaceDisplay: string }) =>
            syncAllListings(orgId!, marketplaceDisplay),
    });

    const syncSelected = useMutation({
        mutationFn: ({ marketplaceDisplay, itemIds }: { marketplaceDisplay: string; itemIds: string[] }) =>
            syncSelectedListings(orgId!, marketplaceDisplay, itemIds),
    });

    const toggleStatus = useMutation({
        mutationFn: ({ itemId, targetStatus }: { itemId: string; targetStatus: 'active' | 'paused' }) =>
            updateItemStatus(orgId!, itemId, targetStatus),
    });

    const updateStock = useMutation({
        mutationFn: ({ itemId, updates }: { itemId: string; updates: Array<{ model_id: number; seller_stock: number }> }) =>
            updateShopeeStock(orgId!, itemId, updates),
    });

    const syncSingle = useMutation({
        mutationFn: ({ marketplaceItemId, scope }: { marketplaceItemId: string; scope?: 'full' | 'metrics' | 'fees' | 'quality' }) =>
            syncSingleListing(orgId!, marketplaceItemId, scope || 'full'),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listings', 'items'] }),
    });

    return { deleteItem, deleteDraftMut, deleteDraftsMut, createDraftMut, syncAll, syncSelected, syncSingle, toggleStatus, updateStock };
}

// ─── Sorting / Filtering helpers ────────────────────────────────────────────

function matchesLogisticFilter(ad: ListingItem, filter: ListingLogisticFilter): boolean {
    if (filter === 'all') return true;
    const tags = (ad.shippingTags || []).map((t) => String(t).toLowerCase());
    return tags.includes(filter);
}

function matchesLinkFilter(ad: ListingItem, filter: ListingLinkFilter): boolean {
    if (filter === 'all') return true;
    const linked = Boolean(ad.linkedProductId);
    return filter === 'linked' ? linked : !linked;
}

function isActiveListing(ad: ListingItem): boolean {
    const s = String(ad.status || '').toLowerCase();
    return s === 'active' || s === 'normal';
}

function isInactiveListing(ad: ListingItem): boolean {
    const s = (ad.status || '').toLowerCase();
    return s === 'paused' || s === 'inactive' || s === 'unlist' || s === 'closed';
}

function matchesStatusFilter(ad: ListingItem, filter: ListingStatusFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'active') return isActiveListing(ad);
    return isInactiveListing(ad);
}

function matchesStockFilter(ad: ListingItem, filter: ListingStockFilter): boolean {
    if (filter === 'all') return true;
    return Number(ad.stock ?? 0) <= 0;
}

/** Status + marketplace scope (excludes search and chip filters). */
export function filterListingsByScope(
    items: ListingItem[],
    activeStatus: string,
    selectedDisplayName: string | null,
): ListingItem[] {
    return items
        .filter((ad) => {
            if (activeStatus === 'ativos') {
                const s = String(ad.status || '').toLowerCase();
                return s === 'active' || s === 'normal';
            }
            if (activeStatus === 'inativos') {
                const s = (ad.status || '').toLowerCase();
                return s === 'paused' || s === 'inactive' || s === 'unlist' || s === 'closed';
            }
            return true;
        })
        .filter((ad) => {
            if (!selectedDisplayName) return true;
            return (ad.marketplace || '').toLowerCase() === selectedDisplayName.toLowerCase();
        });
}

function matchesStoreFilter(ad: ListingItem, selectedIntegrationIds: Set<string>): boolean {
    if (selectedIntegrationIds.size === 0) return true;
    const id = ad.integrationId ? String(ad.integrationId) : "";
    return id !== "" && selectedIntegrationIds.has(id);
}

export function filterListings(
    items: ListingItem[],
    activeStatus: string,
    _isShopee: boolean,
    selectedDisplayName: string | null,
    searchTerm: string,
    filters: ListingAppliedFilters,
    selectedIntegrationIds: Set<string> = new Set(),
): ListingItem[] {
    return filterListingsByScope(items, activeStatus, selectedDisplayName)
        .filter((ad) => matchesStoreFilter(ad, selectedIntegrationIds))
        .filter((ad) => matchesLogisticFilter(ad, filters.logistic))
        .filter((ad) => matchesLinkFilter(ad, filters.link))
        .filter((ad) => matchesStatusFilter(ad, filters.status))
        .filter((ad) => matchesStockFilter(ad, filters.stock))
        .filter((ad) => {
            const term = searchTerm.trim().toLowerCase();
            if (!term) return true;
            return (
                ad.title.toLowerCase().includes(term) ||
                ad.sku.toLowerCase().includes(term) ||
                ad.marketplaceId.toLowerCase().includes(term)
            );
        });
}

export function countListingsByLogistic(
    items: ListingItem[],
): Record<Exclude<ListingLogisticFilter, 'all'>, number> {
    const keys = ['full', 'flex', 'envios', 'correios', 'xpress', 'retire'] as const;
    return keys.reduce(
        (acc, key) => {
            acc[key] = items.filter((ad) => matchesLogisticFilter(ad, key)).length;
            return acc;
        },
        { full: 0, flex: 0, envios: 0, correios: 0, xpress: 0, retire: 0 },
    );
}

export function countListingsByLink(
    items: ListingItem[],
): Record<Exclude<ListingLinkFilter, 'all'>, number> {
    return {
        linked: items.filter((ad) => matchesLinkFilter(ad, 'linked')).length,
        unlinked: items.filter((ad) => matchesLinkFilter(ad, 'unlinked')).length,
    };
}

export function countListingsByStatus(
    items: ListingItem[],
): Record<Exclude<ListingStatusFilter, 'all'>, number> {
    return {
        active: items.filter((ad) => matchesStatusFilter(ad, 'active')).length,
        inactive: items.filter((ad) => matchesStatusFilter(ad, 'inactive')).length,
    };
}

export function countListingsByStock(
    items: ListingItem[],
): Record<Exclude<ListingStockFilter, 'all'>, number> {
    return {
        out_of_stock: items.filter((ad) => matchesStockFilter(ad, 'out_of_stock')).length,
    };
}

export function sortListings(items: ListingItem[], sortKey: SortKey, sortDir: SortDir): ListingItem[] {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
        if (sortKey === 'title') {
            const cmp = String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR', {
                sensitivity: 'base',
            });
            return cmp * dir;
        }
        const av = Number(a?.[sortKey] ?? 0);
        const bv = Number(b?.[sortKey] ?? 0);
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
    });
}
