import { supabase } from "@/integrations/supabase/client";

export interface StockDistributionEntry {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  /** marketplace shipping_type: "fulfillment", "flex", "correios", etc. */
  shipping_type?: string;
}

/**
 * Enriches a list of ListingItems with fulfillment stock quantities.
 * Only items with "full" in their shippingTags get enriched.
 * Returns a Map from marketplaceItemId → { qty, warehouseName }.
 */
export async function fetchFulfillmentStockForListings(
  orgId: string,
  marketplaceItemIds: string[],
): Promise<Map<string, { qty: number; warehouseName: string }>> {
  const result = new Map<string, { qty: number; warehouseName: string }>();
  if (marketplaceItemIds.length === 0) return result;

  const { data, error } = await (supabase as any)
    .from("fulfillment_stock")
    .select("marketplace_item_id, quantity, storage:storage_id ( name )")
    .eq("organization_id", orgId)
    .in("marketplace_item_id", marketplaceItemIds);

  if (error || !data) return result;

  for (const row of data as any[]) {
    const itemId = String(row.marketplace_item_id || "");
    const qty = Number(row.quantity || 0);
    const warehouseName = String(row.storage?.name || "Fulfillment");
    if (!itemId) continue;
    if (result.has(itemId)) {
      result.get(itemId)!.qty += qty;
    } else {
      result.set(itemId, { qty, warehouseName });
    }
  }

  return result;
}

/** Fetch stock distribution per warehouse for a set of marketplace item IDs (ML via marketplace_stock_distribution) */
export async function fetchStockDistributionForListings(
  orgId: string,
  marketplaceItemIds: string[],
): Promise<Map<string, StockDistributionEntry[]>> {
  const result = new Map<string, StockDistributionEntry[]>();
  if (marketplaceItemIds.length === 0) return result;

  const { data, error } = await (supabase as any)
    .from("marketplace_stock_distribution")
    .select("marketplace_item_id, warehouse_id, warehouse_name, quantity, shipping_type")
    .eq("organizations_id", orgId)
    .in("marketplace_item_id", marketplaceItemIds)
    .gt("quantity", 0);

  if (error || !data) return result;

  for (const row of data as any[]) {
    const itemId = String(row.marketplace_item_id || "");
    if (!itemId) continue;
    const entry: StockDistributionEntry = {
      warehouse_id: String(row.warehouse_id || ""),
      warehouse_name: String(row.warehouse_name || "Galpão"),
      quantity: Number(row.quantity || 0),
      shipping_type: row.shipping_type || undefined,
    };
    if (result.has(itemId)) {
      result.get(itemId)!.push(entry);
    } else {
      result.set(itemId, [entry]);
    }
  }

  return result;
}
