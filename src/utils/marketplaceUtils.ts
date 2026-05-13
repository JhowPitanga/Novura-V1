const MARKETPLACE_KEY_MAP: Record<string, string> = {
  "mercado livre": "mercado_livre",
  "mercadolivre": "mercado_livre",
  "mercado_livre": "mercado_livre",
  "shopee": "shopee",
};

export function normalizeMarketplaceKey(displayName: string): string {
  const key = String(displayName).toLowerCase().trim();
  return MARKETPLACE_KEY_MAP[key] ?? key.replace(/\s+/g, "_");
}

export function isShopeeMarketplace(displayName: string): boolean {
  return normalizeMarketplaceKey(displayName) === "shopee";
}

export function isMercadoLivreMarketplace(displayName: string): boolean {
  return normalizeMarketplaceKey(displayName) === "mercado_livre";
}

/**
 * PostgREST source for synced listing rows (matches `fetchListings` in listings.service).
 * Prefer over `marketplace_items`, which may not be exposed on the API (404).
 */
export function marketplaceListingsDataTable(
  displayName: string,
): "marketplace_items_raw" | "marketplace_items_unified" {
  return isShopeeMarketplace(displayName) ? "marketplace_items_raw" : "marketplace_items_unified";
}

/** DB `marketplace_name` / integration display name from stored `marketplace_key`. */
export function displayNameFromMarketplaceKey(marketplaceKey: string): string {
  const k = String(marketplaceKey || "").toLowerCase().trim();
  if (k === "mercado_livre" || k === "mercadolivre") return "Mercado Livre";
  if (k === "shopee") return "Shopee";
  return String(marketplaceKey || "").replace(/_/g, " ");
}
