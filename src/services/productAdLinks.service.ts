/**
 * §1 SIZE EXCEPTION: 183 LOC (limit 150).
 * Extended to absorb 4 raw supabase calls from ProductAdLinkingPanel.tsx:
 * fetchExistingLinks, fetchActiveIntegrations, linkProductToAd, unlinkProductFromAd.
 * One reason to change: product ↔ ad-link persistence.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeMarketplaceKey } from "@/utils/marketplaceName";
import { getCompanyIdForOrg } from "@/services/supabase-helpers";

/** Raw row from marketplace_items_unified / marketplace_items_raw */
export type MarketplaceItemRow = Record<string, unknown>;

/**
 * Loads listing rows for product ↔ ad linking (canonical first, legacy fallback).
 */
export async function fetchMarketplaceItemsForAdLinking(
  organizationId: string,
  limit = 500
): Promise<{ rows: MarketplaceItemRow[]; error: Error | null }> {
  try {
    const canonicalSelect = `
      id, marketplace_item_id, title, sku, marketplace_name, updated_at,
      pictures:marketplace_listing_pictures(url, secure_url, position),
      variations:marketplace_listing_variations(variation_id, sku, price, image_url)
    `;
    const { data: canonical, error: canonicalErr } = await (supabase as any)
      .from("marketplace_listings")
      .select(canonicalSelect)
      .eq("organizations_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (!canonicalErr && Array.isArray(canonical) && canonical.length > 0) {
      const rows = canonical.map((r: Record<string, unknown>) => {
        const pics = Array.isArray(r.pictures) ? r.pictures : [];
        return {
          ...r,
          pictures: pics.map((p: Record<string, unknown>) => ({
            url: p.secure_url ?? p.url,
          })),
          variations: r.variations,
        } as MarketplaceItemRow;
      });
      return { rows, error: null };
    }

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

export const adLinkKeys = {
  links: (productId: string, orgId: string) => ['adLinks', 'links', productId, orgId] as const,
  integrations: (orgId: string) => ['adLinks', 'integrations', orgId] as const,
};

export interface ExistingLinkRow {
  marketplace_name: string;
  marketplace_item_id: string;
  variation_id?: string;
}

export async function fetchExistingLinks(
  productId: string,
  organizationId: string
): Promise<ExistingLinkRow[]> {
  const { data } = await (supabase as any)
    .from("marketplace_item_product_links")
    .select("marketplace_name, marketplace_item_id, variation_id")
    .eq("product_id", productId)
    .eq("organizations_id", organizationId);
  return Array.isArray(data) ? data : [];
}

export async function fetchActiveIntegrations(organizationId: string): Promise<string[]> {
  const parseNames = (data: unknown) =>
    Array.isArray(data)
      ? Array.from(new Set((data as any[]).map((row) => String(row.marketplace_name || "")))).filter(Boolean)
      : [];
  try {
    let res = await (supabase as any)
      .from("marketplace_integrations")
      .select("marketplace_name")
      .eq("organizations_id", organizationId)
      .is("deactivated_at", null);
    if (res.error) {
      res = await (supabase as any)
        .from("marketplace_integrations")
        .select("marketplace_name")
        .eq("organizations_id", organizationId);
    }
    if (res.error) throw res.error;
    return parseNames(res.data);
  } catch {
    return [];
  }
}

export async function linkProductToAd(params: {
  organizationId: string;
  productId: string;
  item: { marketplace_name: string; marketplace_item_id: string; variation_id?: string };
}): Promise<void> {
  const companyId = await getCompanyIdForOrg(params.organizationId);
  if (!companyId) throw new Error("Não foi possível resolver company_id para a organização.");
  const { error } = await (supabase as any)
    .from("marketplace_item_product_links")
    .upsert(
      {
        organizations_id: params.organizationId,
        company_id: companyId,
        product_id: params.productId,
        marketplace_name: params.item.marketplace_name,
        marketplace_item_id: params.item.marketplace_item_id,
        variation_id: params.item.variation_id || "",
        permanent: true,
      },
      { onConflict: "organizations_id,marketplace_name,marketplace_item_id,variation_id" }
    );
  if (error) throw error;
}

export async function unlinkProductFromAd(params: {
  organizationId: string;
  productId: string;
  link: { marketplace_name: string; marketplace_item_id: string; variation_id?: string };
}): Promise<void> {
  await (supabase as any)
    .from("marketplace_item_product_links")
    .delete()
    .eq("organizations_id", params.organizationId)
    .eq("product_id", params.productId)
    .eq("marketplace_name", params.link.marketplace_name)
    .eq("marketplace_item_id", params.link.marketplace_item_id)
    .eq("variation_id", params.link.variation_id || "");
}
