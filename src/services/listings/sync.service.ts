import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers a full synchronisation for a single listing item via the
 * listings-sync-one edge function. Returns the canonical listing id.
 */
export async function syncSingleListing(
  orgId: string,
  marketplaceItemId: string,
  scope: "full" | "metrics" | "fees" | "quality" = "full",
): Promise<{ listingId: string }> {
  const { data, error } = await (supabase as any).functions.invoke("listings-sync-one", {
    body: { organizationId: orgId, marketplaceItemId, scope },
  });
  if (error) throw error;
  return { listingId: String(data?.listingId ?? "") };
}

export async function syncAllListings(
  orgId: string,
  marketplaceDisplay: string,
): Promise<number> {
  const isShopee = String(marketplaceDisplay).toLowerCase() === "shopee";
  const clientRid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  if (isShopee) {
    const { data: result, error } = await (supabase as any).functions.invoke("shopee-sync-items", {
      body: { organizationId: orgId, page_size: 100, item_status: ["NORMAL"] },
    });
    if (error) throw error;
    return Array.isArray(result?.results)
      ? result.results.reduce((acc: number, r: any) => acc + Number(r?.updated || 0), 0)
      : 0;
  } else {
    const { data: orchestration, error } = await (supabase as any).functions.invoke(
      "mercado-livre-orchestrate-sync",
      { body: { organizationId: orgId, clientRid } },
    );
    if (error) throw error;
    return Number(orchestration?.sync?.synced ?? 0);
  }
}

export async function syncSelectedListings(
  orgId: string,
  marketplaceDisplay: string,
  itemIds: string[],
): Promise<void> {
  const isShopee = String(marketplaceDisplay).toLowerCase() === "shopee";
  const clientRid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  if (isShopee) {
    const { error } = await (supabase as any).functions.invoke("shopee-sync-items", {
      body: { organizationId: orgId, item_id_list: itemIds },
    });
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).functions.invoke("mercado-livre-orchestrate-sync", {
      body: { organizationId: orgId, clientRid, onlySelectedIds: itemIds },
    });
    if (error) throw error;
  }
}

export async function updateItemStatus(
  orgId: string,
  itemId: string,
  targetStatus: "active" | "paused",
): Promise<void> {
  const { error } = await (supabase as any).functions.invoke("mercado-livre-update-item-status", {
    body: { organizationId: orgId, itemId, targetStatus },
  });
  if (error) throw error;
}

export async function updateShopeeStock(
  orgId: string,
  itemId: string,
  updates: Array<{ model_id: number; seller_stock: number }>,
): Promise<any> {
  const { data, error } = await (supabase as any).functions.invoke("shopee-update-stock", {
    body: { organizationId: orgId, item_id: Number(itemId), updates },
  });
  if (error) throw error;
  return data;
}
