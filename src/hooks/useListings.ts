import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchConnectedMarketplaces,
  fetchMarketplaceStores,
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
} from "@/services/listings.service";

// ─── Query Keys ────────────────────────────────────────────────────────────

export const listingKeys = {
  marketplaces: (orgId: string) => ["listings", "marketplaces", orgId] as const,
  stores: (orgId: string, marketplace: string) =>
    ["listings", "stores", orgId, marketplace] as const,
  items: (orgId: string, marketplaceSlug: string) =>
    ["listings", "items", orgId, marketplaceSlug] as const,
  drafts: (orgId: string) => ["listings", "drafts", orgId] as const,
};

export interface ListingsItemsQueryData {
  rows: any[];
  isCanonical: boolean;
}

// ─── Re-exports from extracted sub-modules ─────────────────────────────────

export {
  filterListingsByScope,
  filterListings,
  countListingsByLogistic,
  countListingsByLink,
  countListingsByStatus,
  countListingsByStock,
  sortListings,
} from "./listingFilters";

export {
  resolveMarketplacePathFromUrl,
  marketplaceSlugForPath,
} from "./listingUrlUtils";

export { useListingItems } from "./useListingItems";

// ─── Connected Marketplaces ────────────────────────────────────────────────

export function useConnectedMarketplaces(orgId: string | null | undefined) {
  return useQuery({
    queryKey: listingKeys.marketplaces(orgId || ""),
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
    queryKey: listingKeys.stores(orgId || "", marketplaceDisplayName),
    queryFn: () => fetchMarketplaceStores(orgId!, marketplaceDisplayName),
    enabled: !!orgId && !!marketplaceDisplayName,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ─── Drafts ────────────────────────────────────────────────────────────────

export function useListingDrafts(orgId: string | null | undefined, activeStatus: string) {
  return useQuery({
    queryKey: listingKeys.drafts(orgId || ""),
    queryFn: () => fetchDrafts(orgId!),
    enabled: !!orgId && activeStatus === "rascunhos",
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export function useListingMutations(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  const deleteItem = useMutation({
    mutationFn: ({ marketplaceItemId }: { marketplaceItemId: string }) =>
      deleteListingItem(orgId!, marketplaceItemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["listings", "items"] }),
  });

  const deleteDraftMut = useMutation({
    mutationFn: ({ draftId }: { draftId: string }) => deleteDraft(orgId!, draftId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listingKeys.drafts(orgId || "") }),
  });

  const deleteDraftsMut = useMutation({
    mutationFn: ({ draftIds }: { draftIds: string[] }) => deleteDrafts(orgId!, draftIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listingKeys.drafts(orgId || "") }),
  });

  const createDraftMut = useMutation({
    mutationFn: ({
      itemRow,
      listingTypeId,
    }: {
      itemRow: any;
      listingTypeId: string | null;
    }) => createDraftFromListing(orgId!, itemRow, listingTypeId),
  });

  const syncAll = useMutation({
    mutationFn: ({ marketplaceDisplay }: { marketplaceDisplay: string }) =>
      syncAllListings(orgId!, marketplaceDisplay),
  });

  const syncSelected = useMutation({
    mutationFn: ({
      marketplaceDisplay,
      itemIds,
    }: {
      marketplaceDisplay: string;
      itemIds: string[];
    }) => syncSelectedListings(orgId!, marketplaceDisplay, itemIds),
  });

  const toggleStatus = useMutation({
    mutationFn: ({
      itemId,
      targetStatus,
    }: {
      itemId: string;
      targetStatus: "active" | "paused";
    }) => updateItemStatus(orgId!, itemId, targetStatus),
  });

  const updateStock = useMutation({
    mutationFn: ({
      itemId,
      updates,
    }: {
      itemId: string;
      updates: Array<{ model_id: number; seller_stock: number }>;
    }) => updateShopeeStock(orgId!, itemId, updates),
  });

  const syncSingle = useMutation({
    mutationFn: ({
      marketplaceItemId,
      scope,
    }: {
      marketplaceItemId: string;
      scope?: "full" | "metrics" | "fees" | "quality";
    }) => syncSingleListing(orgId!, marketplaceItemId, scope || "full"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["listings", "items"] }),
  });

  return {
    deleteItem,
    deleteDraftMut,
    deleteDraftsMut,
    createDraftMut,
    syncAll,
    syncSelected,
    syncSingle,
    toggleStatus,
    updateStock,
  };
}
