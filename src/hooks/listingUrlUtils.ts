import type { MarketplaceNavItem } from "@/types/listings";
import { slugFromMarketplacePath, marketplacePathFromSlug } from "@/utils/listingUtils";

// ─── Query Keys ────────────────────────────────────────────────────────────
// Defined here (not in the useListings barrel) so that useListingItems.ts
// can import them directly without creating a barrel self-cycle.

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

const LISTINGS_PATH_RESERVED = new Set([
  "todos",
  "ativos",
  "inativos",
  "rascunhos",
  "promocoes",
  "criar",
  "edicao",
]);

/** Resolve active marketplace nav path from URL (?marketplace=) or legacy path segment. */
export function resolveMarketplacePathFromUrl(
  pathname: string,
  search: string,
  navItems: MarketplaceNavItem[],
): string {
  if (!navItems.length) return "";

  const fromQuery = new URLSearchParams(search).get("marketplace");
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
