import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    fetchConnectedMarketplaces,
    fetchListings,
    fetchDrafts,
    deleteListingItem,
    deleteDraft,
    deleteDrafts,
    createDraftFromListing,
    syncAllListings,
    syncSelectedListings,
    updateItemStatus,
    updateShopeeStock,
} from "@/services/listings.service";
import { parseListingRow } from "@/utils/listingUtils";
import type { ListingItem, ShippingCaps, SortKey, SortDir } from "@/types/listings";

// ─── Query Keys ────────────────────────────────────────────────────────────

export const listingKeys = {
    marketplaces: (orgId: string) => ['listings', 'marketplaces', orgId] as const,
    items: (orgId: string, path: string) => ['listings', 'items', orgId, path] as const,
    drafts: (orgId: string) => ['listings', 'drafts', orgId] as const,
};

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

// ─── Listing Items ─────────────────────────────────────────────────────────

interface UseListingItemsOptions {
    orgId: string | null | undefined;
    selectedDisplayName: string;
    selectedPath: string;
    shippingCaps: ShippingCaps | null;
}

export function useListingItems({ orgId, selectedDisplayName, selectedPath, shippingCaps }: UseListingItemsOptions) {
    // Raw items state — also receives real-time updates
    const [rawItems, setRawItems] = useState<any[]>([]);
    const [metricsByItemId, setMetricsByItemId] = useState<Record<string, { quality_level?: string | null; performance_data?: any }>>({});
    const [listingTypeByItemId, setListingTypeByItemId] = useState<Record<string, string | null>>({});
    const [shippingTypesByItemId, setShippingTypesByItemId] = useState<Record<string, string[]>>({});
    const [listingPricesByItemId, setListingPricesByItemId] = useState<Record<string, any>>({});

    const query = useQuery({
        queryKey: listingKeys.items(orgId || '', selectedPath),
        queryFn: async () => {
            const result = await fetchListings(orgId!, selectedDisplayName);
            // Build derived maps from the rows
            const lmap: Record<string, string | null> = {};
            const pmap: Record<string, any> = {};
            const smap: Record<string, string[]> = {};
            const mmap: Record<string, { quality_level?: string | null; performance_data?: any }> = {};

            result.rows.forEach((r: any) => {
                const id = String(r?.marketplace_item_id || r?.id || '');
                if (!id) return;
                if (result.isShopee) {
                    lmap[id] = null;
                    if (Array.isArray(r?.shipping_types)) {
                        smap[id] = (r.shipping_types as any[])
                            .filter((t: any) => t?.enabled === true)
                            .map((t: any) => {
                                const name = String(t?.logistic_name || '').toLowerCase();
                                if (name.includes('retire')) return 'Retire';
                                if (name.includes('padrão') || name.includes('padrao')) return 'Padrão';
                                return t?.logistic_name || '';
                            })
                            .filter(Boolean);
                    }
                    mmap[id] = {
                        quality_level: r?.performance_data?.quality_level ?? null,
                        performance_data: r?.performance_data ?? null,
                    };
                } else {
                    lmap[id] = r?.listing_type_id ? String(r.listing_type_id) : null;
                    if (r?.listing_prices) pmap[id] = r.listing_prices;
                    if (Array.isArray(r?.shipping_tags) && r.shipping_tags.length) {
                        smap[id] = r.shipping_tags.map((t: any) => String(t || '').toLowerCase());
                    }
                    mmap[id] = { quality_level: r?.quality_level ?? null, performance_data: r?.performance_data ?? null };
                }
            });

            setListingTypeByItemId(lmap);
            setListingPricesByItemId(pmap);
            setShippingTypesByItemId(smap);
            setMetricsByItemId(mmap);
            setRawItems(result.rows);
            return result.rows;
        },
        enabled: !!orgId && !!selectedPath,
        staleTime: 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });

    // Real-time subscription — updates rawItems directly
    useEffect(() => {
        if (!orgId) return;
        const channel = (supabase as any)
            .channel(`marketplace_items_all_${orgId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_items',
                filter: `organizations_id=eq.${orgId}`,
            }, (payload: any) => {
                setRawItems((prev: any[]) => {
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
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_metrics',
                filter: `organizations_id=eq.${orgId}`,
            }, (payload: any) => {
                const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
                const n = payload.new as any;
                const o = payload.old as any;
                const id = String(n?.marketplace_item_id || n?.item_id || o?.marketplace_item_id || o?.item_id || '');
                if (!id) return;
                setMetricsByItemId(prev => {
                    const next = { ...prev };
                    if (evt === 'DELETE') {
                        delete next[id];
                    } else {
                        next[id] = {
                            quality_level: n?.quality_level ?? next[id]?.quality_level ?? null,
                            performance_data: n?.performance_data ?? next[id]?.performance_data ?? null,
                        };
                    }
                    return next;
                });
            })
            .subscribe();
        return () => { try { (supabase as any).removeChannel(channel); } catch {} };
    }, [orgId]);

    // Parse raw items into display-ready ListingItems
    const parsedItems: ListingItem[] = useMemo(() => rawItems.map(row =>
        parseListingRow(row, { metricsByItemId, listingTypeByItemId, shippingTypesByItemId, listingPricesByItemId, shippingCaps })
    ), [rawItems, metricsByItemId, listingTypeByItemId, shippingTypesByItemId, listingPricesByItemId, shippingCaps]);

    return {
        parsedItems,
        rawItems,
        setRawItems,
        listingTypeByItemId,
        isLoading: query.isLoading,
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

    return { deleteItem, deleteDraftMut, deleteDraftsMut, createDraftMut, syncAll, syncSelected, toggleStatus, updateStock };
}

// ─── Sorting / Filtering helpers ────────────────────────────────────────────

export function filterListings(
    items: ListingItem[],
    activeStatus: string,
    isShopee: boolean,
    selectedDisplayName: string | null,
    searchTerm: string,
): ListingItem[] {
    return items
        .filter(ad => {
            if (activeStatus === "ativos") {
                const s = String(ad.status || '').toLowerCase();
                return isShopee ? s === "normal" : s === "active";
            }
            if (!isShopee && activeStatus === "inativos") {
                const s = (ad.status || '').toLowerCase();
                return s === "paused" || s === "inactive";
            }
            return true;
        })
        .filter(ad => {
            if (!selectedDisplayName) return true;
            return (ad.marketplace || '').toLowerCase() === selectedDisplayName.toLowerCase();
        })
        .filter(ad => {
            const term = searchTerm.toLowerCase();
            return (
                ad.title.toLowerCase().includes(term) ||
                ad.sku.toLowerCase().includes(term) ||
                ad.marketplaceId.toLowerCase().includes(term)
            );
        });
}

export function sortListings(items: ListingItem[], sortKey: SortKey, sortDir: SortDir): ListingItem[] {
    return [...items].sort((a, b) => {
        const dir = sortDir === 'desc' ? -1 : 1;
        const av = Number(a?.[sortKey] ?? 0);
        const bv = Number(b?.[sortKey] ?? 0);
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
    });
}
