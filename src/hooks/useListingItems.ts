import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchListings, fetchFulfillmentStockForListings, fetchStockDistributionForListings } from "@/services/listings.service";
import { createListingsChannel, removeListingsChannel } from "@/services/listings/realtime.service";
import { fetchListingLinks } from "@/services/listingLinks.service";
import { parseListingRow } from "@/utils/listingUtils";
import type { ListingItem, ShippingCaps } from "@/types/listings";
import { marketplaceSlugForPath, listingKeys, type ListingsItemsQueryData } from "./listingUrlUtils";
export { listingKeys, type ListingsItemsQueryData } from "./listingUrlUtils";

const EMPTY_PARSE_CTX = {
  metricsByItemId: {} as Record<string, { quality_level?: string | null; performance_data?: any }>,
  listingTypeByItemId: {} as Record<string, string | null>,
  shippingTypesByItemId: {} as Record<string, string[]>,
  listingPricesByItemId: {} as Record<string, any>,
};

interface UseListingItemsOptions {
  orgId: string | null | undefined;
  selectedDisplayName: string;
  selectedPath: string;
  shippingCaps: ShippingCaps | null;
}

export function useListingItems({
  orgId,
  selectedDisplayName,
  selectedPath,
  shippingCaps,
}: UseListingItemsOptions) {
  const queryClient = useQueryClient();
  const marketplaceSlug = marketplaceSlugForPath(selectedPath);

  const query = useQuery({
    queryKey: listingKeys.items(orgId || "", marketplaceSlug),
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

  // Real-time: canonical listings + legacy metrics (I4 resolved — supabase via service)
  useEffect(() => {
    if (!orgId) return;
    const channel = createListingsChannel(orgId, {
      onListingsChange: () => {
        queryClient.invalidateQueries({ queryKey: listingKeys.items(orgId, marketplaceSlug) });
      },
      onMetricsChange: () => {
        queryClient.invalidateQueries({ queryKey: listingKeys.items(orgId, marketplaceSlug) });
      },
      onQualityChange: () => {
        queryClient.invalidateQueries({ queryKey: listingKeys.items(orgId, marketplaceSlug) });
      },
      onItemsChange: (payload: any) => {
        if (isCanonicalSource) return;
        patchRawItems((prev: any[]) => {
          const evt = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const n = payload.new as any;
          const o = payload.old as any;
          if (evt === "INSERT" && n) {
            const exists = prev.some((r) => r.id === n.id);
            return exists ? prev.map((r) => (r.id === n.id ? n : r)) : [n, ...prev];
          }
          if (evt === "UPDATE" && n) return prev.map((r) => (r.id === n.id ? n : r));
          if (evt === "DELETE" && o) return prev.filter((r) => r.id !== o.id);
          return prev;
        });
      },
    });
    return () => {
      removeListingsChannel(channel);
    };
  }, [orgId, isCanonicalSource, marketplaceSlug, queryClient, patchRawItems]);

  const parseCtx = useMemo(
    () => ({ ...EMPTY_PARSE_CTX, shippingCaps }),
    [shippingCaps],
  );

  const parsedItems: ListingItem[] = useMemo(
    () => rawItems.map((row) => parseListingRow(row, parseCtx)),
    [rawItems, parseCtx],
  );

  const fullItemIds = useMemo(
    () =>
      parsedItems
        .filter((ad) => ad.shippingTags.some((t) => String(t).toLowerCase() === "full"))
        .map((ad) => ad.marketplaceId)
        .filter(Boolean),
    [parsedItems],
  );

  const marketplaceNameForLinks = selectedDisplayName || "";

  const linksQuery = useQuery({
    queryKey: ["listing-links", orgId, marketplaceNameForLinks],
    queryFn: () => fetchListingLinks(orgId!, marketplaceNameForLinks),
    enabled: !!orgId && !!marketplaceNameForLinks,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const allItemIds = useMemo(
    () => parsedItems.map((ad) => ad.marketplaceId).filter(Boolean),
    [parsedItems],
  );
  const isShopeeSelected = String(selectedDisplayName || "").toLowerCase() === "shopee";

  const fulfillmentStockQuery = useQuery({
    queryKey: ["fulfillment-stock-listings", orgId, fullItemIds],
    queryFn: () => fetchFulfillmentStockForListings(orgId!, fullItemIds),
    enabled: !!orgId && fullItemIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const stockDistributionQuery = useQuery({
    queryKey: ["stock-distribution", orgId, allItemIds],
    queryFn: () => fetchStockDistributionForListings(orgId!, allItemIds),
    enabled: !!orgId && allItemIds.length > 0 && !isShopeeSelected,
    staleTime: 5 * 60 * 1000,
  });

  const listingTypeByItemId = useMemo(() => {
    const m: Record<string, string | null> = {};
    rawItems.forEach((r: any) => {
      const id = String(r?.marketplace_item_id || r?.id || "");
      if (id) m[id] = r?.listing_type_id ? String(r.listing_type_id) : null;
    });
    return m;
  }, [rawItems]);

  const enrichedItems: ListingItem[] = useMemo(() => {
    const fsMap = fulfillmentStockQuery.data;
    const linksMap = linksQuery.data;
    const distMap = stockDistributionQuery.data;
    return parsedItems.map((ad) => {
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
