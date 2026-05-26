import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { marketplaceListingsDataTable } from "@/utils/marketplaceUtils";

/** Canonical columns + embedded joins for variations and pictures. */
const LISTING_PICKER_COLUMNS =
  "id, marketplace_item_id, title, sku, status, price, available_quantity, " +
  "variations:marketplace_listing_variations(variation_id, sku, price, available_quantity, attributes), " +
  "pictures:marketplace_listing_pictures(url, secure_url, position, external_picture_id)";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export interface MarketplaceListing {
  id: number;
  marketplace_item_id: string;
  title: string | null;
  sku: string | null;
  status: string | null;
  price: number | null;
  available_quantity: number | null;
  pictures: any;
  variations: any;
}

interface UseMarketplaceListingsOptions {
  orgId: string | null;
  marketplaceName: string;
  search?: string;
  onlyActive?: boolean;
  excludeItemIds?: string[];
}

function mapListingRow(r: Record<string, unknown>): MarketplaceListing {
  const aq = r.available_quantity;
  return {
    id: Number(r.id),
    marketplace_item_id: String(r.marketplace_item_id ?? ""),
    title: (r.title as string) ?? null,
    sku: (r.sku as string) ?? null,
    status: (r.status as string) ?? null,
    price: r.price != null ? Number(r.price) : null,
    available_quantity: aq != null && aq !== "" ? Number(aq) : null,
    pictures: r.pictures,
    variations: r.variations,
  };
}

async function fetchMarketplaceListings(
  orgId: string,
  marketplaceName: string,
  search: string,
  onlyActive: boolean,
): Promise<MarketplaceListing[]> {
  let q = (supabase as any)
    .from(marketplaceListingsDataTable(marketplaceName))
    .select(LISTING_PICKER_COLUMNS)
    .eq("organizations_id", orgId)
    .eq("marketplace_name", marketplaceName)
    .order("title", { ascending: true })
    .limit(200);

  if (onlyActive) {
    q = q.eq("status", "active");
  }

  if (search.trim()) {
    const t = search.trim();
    q = q.or(`title.ilike.%${t}%,sku.ilike.%${t}%,marketplace_item_id.ilike.%${t}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => mapListingRow(r));
}

export function useMarketplaceListings({
  orgId,
  marketplaceName,
  search = "",
  onlyActive = false,
  excludeItemIds = [],
}: UseMarketplaceListingsOptions) {
  const debouncedSearch = useDebounce(search, 300);

  const query = useQuery({
    queryKey: ["marketplace-listings", orgId, marketplaceName, debouncedSearch, onlyActive],
    queryFn: () => fetchMarketplaceListings(orgId!, marketplaceName, debouncedSearch, onlyActive),
    enabled: !!orgId && !!marketplaceName,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const excluded = new Set(excludeItemIds);
  const filtered = excludeItemIds.length > 0
    ? (query.data ?? []).filter(l => !excluded.has(l.marketplace_item_id))
    : (query.data ?? []);

  return { ...query, data: filtered };
}
