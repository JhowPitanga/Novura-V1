import { supabase } from "@/integrations/supabase/client";
import { normalizeMarketplaceKey } from "@/utils/marketplaceName";

/** Raw row from marketplace_items_unified / marketplace_items_raw */
export type MarketplaceItemRow = Record<string, unknown>;

/**
 * Loads listing rows the same way the Anúncios module does:
 * marketplace_items_unified plus raw marketplace rows as a fallback for channels
 * that are not fully represented by the unified view yet.
 */
export async function fetchMarketplaceItemsForAdLinking(
  organizationId: string,
  limit = 500
): Promise<{ rows: MarketplaceItemRow[]; error: Error | null }> {
  try {
    const columns = "id, marketplace_item_id, title, sku, marketplace_name, pictures, variations, updated_at";
    const [unifiedRes, rawRes] = await Promise.all([
      (supabase as any)
        .from("marketplace_items_unified")
        .select(columns)
        .eq("organizations_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(limit),
      (supabase as any)
        .from("marketplace_items_raw")
        .select(columns)
        .eq("organizations_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(limit),
    ]);

    if (unifiedRes.error && rawRes.error) {
      return {
        rows: [],
        error: new Error(unifiedRes.error.message || rawRes.error.message || "Erro ao carregar anúncios"),
      };
    }

    const unified = !unifiedRes.error && Array.isArray(unifiedRes.data) ? unifiedRes.data : [];
    const raw = !rawRes.error && Array.isArray(rawRes.data) ? rawRes.data : [];

    const seen = new Set<string>();
    const merged: MarketplaceItemRow[] = [];
    for (const r of [...unified, ...raw]) {
      const mid = String((r as any).marketplace_item_id || "");
      const mn = String((r as any).marketplace_name || "");
      const rowId = String((r as any).id || "");
      const marketplaceKey = normalizeMarketplaceKey(mn);
      const key = `${marketplaceKey || mn}::${mid || rowId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r as MarketplaceItemRow);
    }

    merged.sort((a, b) => {
      const ta = new Date(String((a as any).updated_at || 0)).getTime();
      const tb = new Date(String((b as any).updated_at || 0)).getTime();
      return tb - ta;
    });

    return { rows: merged, error: null };
  } catch (e: any) {
    return { rows: [], error: e instanceof Error ? e : new Error(String(e)) };
  }
}
