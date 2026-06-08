// SIZE EXCEPTION (§1 ENGINEERING_STANDARDS.md): canonical/legacy/fallback fetch paths cannot be split across files without breaking the unified fallback chain; 4 lines over 150 limit.
import { supabase } from "@/integrations/supabase/client";

export interface FetchListingsResult {
  rows: any[];
  isShopee: boolean;
  isCanonical?: boolean;
}

export interface FetchListingsCanonicalResult {
  rows: any[];
  isCanonical: true;
}

const MARKETPLACE_DISPLAY: Record<string, string> = {
  shopee: "Shopee",
  "mercado livre": "Mercado Livre",
};

/**
 * Resolves a display name to its canonical form.
 * Exported additively for test coverage — NOT re-exported from the barrel.
 */
export function resolveMarketplaceName(displayName: string): string {
  const key = String(displayName).toLowerCase().trim();
  return MARKETPLACE_DISPLAY[key] ?? displayName;
}

/** Reads marketplace_integrations.config.listings_canonical (PRD §8 Fase 3). */
export async function isListingsCanonicalEnabled(
  orgId: string,
  marketplaceName: string,
): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("marketplace_integrations")
    .select("config")
    .eq("organizations_id", orgId)
    .eq("marketplace_name", marketplaceName)
    .maybeSingle();
  if (error) {
    console.warn("[isListingsCanonicalEnabled]", error.message);
    return false;
  }
  const cfg = data?.config;
  if (cfg && typeof cfg === "object") {
    return (cfg as Record<string, unknown>).listings_canonical === true;
  }
  return false;
}

/**
 * Reads listings from the new canonical schema (marketplace_listings + joins).
 */
export async function fetchListingsCanonical(
  orgId: string,
  marketplaceName: string,
): Promise<FetchListingsCanonicalResult> {
  const { data, error } = await (supabase as any)
    .from("marketplace_listings")
    .select(
      `*,
      shipping:marketplace_listing_shipping(*),
      metrics:marketplace_listing_metrics(*),
      quality:marketplace_listing_quality(*),
      fees:marketplace_listing_fees(*),
      variations:marketplace_listing_variations(*),
      pictures:marketplace_listing_pictures(*)`,
    )
    .eq("organizations_id", orgId)
    .eq("marketplace_name", marketplaceName)
    .order("marketplace_updated_at", { ascending: false })
    .limit(400);

  if (error) throw error;
  return { rows: data || [], isCanonical: true };
}

/** Legacy path — marketplace_items_unified / marketplace_items_raw */
async function fetchListingsLegacy(
  orgId: string,
  marketplaceName: string,
  isShopee: boolean,
): Promise<any[]> {
  const { data, error } = isShopee
    ? await (supabase as any)
        .from("marketplace_items_raw")
        .select("*")
        .eq("organizations_id", orgId)
        .eq("marketplace_name", "Shopee")
        .order("updated_at", { ascending: false })
        .limit(400)
    : await (supabase as any)
        .from("marketplace_items_unified")
        .select("*")
        .eq("organizations_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(400);
  if (error) throw error;
  return data || [];
}

export async function fetchListings(
  orgId: string,
  selectedDisplayName: string,
): Promise<FetchListingsResult> {
  const isShopee = String(selectedDisplayName).toLowerCase() === "shopee";
  const marketplaceName = resolveMarketplaceName(selectedDisplayName);
  const flagEnabled = await isListingsCanonicalEnabled(orgId, marketplaceName);

  const tryCanonical = async (): Promise<FetchListingsResult | null> => {
    try {
      const canonical = await fetchListingsCanonical(orgId, marketplaceName);
      if (flagEnabled || canonical.rows.length > 0) {
        return { rows: canonical.rows, isShopee, isCanonical: true };
      }
    } catch (err) {
      console.warn("[fetchListings] canonical read failed", err);
    }
    return null;
  };

  if (flagEnabled) {
    const canonicalResult = await tryCanonical();
    if (canonicalResult) return canonicalResult;
  } else {
    const canonicalResult = await tryCanonical();
    if (canonicalResult && canonicalResult.rows.length > 0) return canonicalResult;
  }

  try {
    const rows = await fetchListingsLegacy(orgId, marketplaceName, isShopee);
    return { rows, isShopee, isCanonical: false };
  } catch {
    const { data, error: fallbackErr } = await (supabase as any)
      .from("marketplace_items")
      .select("*")
      .eq("organizations_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(400);
    if (fallbackErr) throw fallbackErr;
    return { rows: data || [], isShopee, isCanonical: false };
  }
}

export async function deleteListingItem(
  orgId: string,
  marketplaceItemId: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("marketplace_items")
    .delete()
    .eq("organizations_id", orgId)
    .eq("marketplace_item_id", marketplaceItemId);
  if (error) throw error;
}
