import type {
  ListingAppliedFilters,
  ListingItem,
  ListingLinkFilter,
  ListingLogisticFilter,
  ListingStatusFilter,
  ListingStockFilter,
  SortDir,
  SortKey,
} from "@/types/listings";

// ─── Private predicates ────────────────────────────────────────────────────

function matchesLogisticFilter(ad: ListingItem, filter: ListingLogisticFilter): boolean {
  if (filter === "all") return true;
  const tags = (ad.shippingTags || []).map((t) => String(t).toLowerCase());
  return tags.includes(filter);
}

function matchesLinkFilter(ad: ListingItem, filter: ListingLinkFilter): boolean {
  if (filter === "all") return true;
  const linked = Boolean(ad.linkedProductId);
  return filter === "linked" ? linked : !linked;
}

function isActiveListing(ad: ListingItem): boolean {
  const s = String(ad.status || "").toLowerCase();
  return s === "active" || s === "normal";
}

function isInactiveListing(ad: ListingItem): boolean {
  const s = (ad.status || "").toLowerCase();
  return s === "paused" || s === "inactive" || s === "unlist" || s === "closed";
}

function matchesStatusFilter(ad: ListingItem, filter: ListingStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return isActiveListing(ad);
  return isInactiveListing(ad);
}

function matchesStockFilter(ad: ListingItem, filter: ListingStockFilter): boolean {
  if (filter === "all") return true;
  return Number(ad.stock ?? 0) <= 0;
}

function matchesStoreFilter(ad: ListingItem, selectedIntegrationIds: Set<string>): boolean {
  if (selectedIntegrationIds.size === 0) return true;
  const id = ad.integrationId ? String(ad.integrationId) : "";
  return id !== "" && selectedIntegrationIds.has(id);
}

// ─── Public exports ────────────────────────────────────────────────────────

/** Status + marketplace scope (excludes search and chip filters). */
export function filterListingsByScope(
  items: ListingItem[],
  activeStatus: string,
  selectedDisplayName: string | null,
): ListingItem[] {
  return items
    .filter((ad) => {
      if (activeStatus === "ativos") {
        const s = String(ad.status || "").toLowerCase();
        return s === "active" || s === "normal";
      }
      if (activeStatus === "inativos") {
        const s = (ad.status || "").toLowerCase();
        return s === "paused" || s === "inactive" || s === "unlist" || s === "closed";
      }
      return true;
    })
    .filter((ad) => {
      if (!selectedDisplayName) return true;
      // PRE-EXISTING: case-sensitivity inconsistency — uses toLowerCase on both sides
      return (ad.marketplace || "").toLowerCase() === selectedDisplayName.toLowerCase();
    });
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
): Record<Exclude<ListingLogisticFilter, "all">, number> {
  const keys = ["full", "flex", "envios", "correios", "xpress", "retire"] as const;
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
): Record<Exclude<ListingLinkFilter, "all">, number> {
  return {
    linked: items.filter((ad) => matchesLinkFilter(ad, "linked")).length,
    unlinked: items.filter((ad) => matchesLinkFilter(ad, "unlinked")).length,
  };
}

export function countListingsByStatus(
  items: ListingItem[],
): Record<Exclude<ListingStatusFilter, "all">, number> {
  return {
    active: items.filter((ad) => matchesStatusFilter(ad, "active")).length,
    inactive: items.filter((ad) => matchesStatusFilter(ad, "inactive")).length,
  };
}

export function countListingsByStock(
  items: ListingItem[],
): Record<Exclude<ListingStockFilter, "all">, number> {
  return {
    out_of_stock: items.filter((ad) => matchesStockFilter(ad, "out_of_stock")).length,
  };
}

export function sortListings(
  items: ListingItem[],
  sortKey: SortKey,
  sortDir: SortDir,
): ListingItem[] {
  const dir = sortDir === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    if (sortKey === "title") {
      const cmp = String(a.title || "").localeCompare(String(b.title || ""), "pt-BR", {
        sensitivity: "base",
      });
      return cmp * dir;
    }
    const av = Number(a?.[sortKey] ?? 0);
    const bv = Number(b?.[sortKey] ?? 0);
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
}
