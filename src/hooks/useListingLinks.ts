import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchListingLinks,
  upsertListingProductLink,
  removeListingProductLink,
} from "@/services/listingLinks.service";

export const listingLinkKeys = {
  all: (orgId: string) => ["listing-links", orgId] as const,
  byMarketplace: (orgId: string, marketplace: string) =>
    ["listing-links", orgId, marketplace] as const,
};

/** Returns a Map from `${marketplaceItemId}:${variationId}` → productId */
export function useListingLinks(marketplaceName: string) {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<Map<string, string>>({
    queryKey: listingLinkKeys.byMarketplace(organizationId || "", marketplaceName),
    queryFn: () => fetchListingLinks(organizationId!, marketplaceName),
    enabled: !!organizationId && !!marketplaceName,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Invalidate when links change via realtime
  useEffect(() => {
    if (!organizationId) return;
    const channel = (supabase as any)
      .channel(`listing-links-realtime-${organizationId}-${marketplaceName}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "marketplace_item_product_links",
          filter: `organizations_id=eq.${organizationId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: listingLinkKeys.all(organizationId),
          });
        }
      )
      .subscribe();
    return () => {
      try { (supabase as any).removeChannel(channel); } catch {}
    };
  }, [organizationId, marketplaceName, queryClient]);

  return {
    linksMap: query.data ?? new Map<string, string>(),
    isLoading: query.isLoading,
  };
}

export function useUpsertListingLink() {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      marketplaceName: string;
      marketplaceItemId: string;
      variationId?: string;
      productId: string;
    }) =>
      upsertListingProductLink({ orgId: organizationId!, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listingLinkKeys.all(organizationId || ""),
      });
    },
  });
}

export function useRemoveListingLink() {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      marketplaceName: string;
      marketplaceItemId: string;
      variationId?: string;
    }) => removeListingProductLink({ orgId: organizationId!, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listingLinkKeys.all(organizationId || ""),
      });
    },
  });
}
