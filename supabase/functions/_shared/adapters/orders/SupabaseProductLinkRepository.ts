import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  IProductLinkRepository,
  OrderItemLink,
  OrderItemLinkQuery,
  ProductLinkResult,
} from "../../domain/orders/ports/IProductLinkRepository.ts";

type LinkRow = { readonly organizations_id: string; readonly sku: string; readonly product_id: string };

export class SupabaseProductLinkRepository implements IProductLinkRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findLink(organizationId: string, sku: string): Promise<OrderItemLink | null> {
    const { data, error } = await this.supabase
      .from("marketplace_item_product_links")
      .select("organizations_id, sku, product_id")
      .eq("organizations_id", organizationId)
      .eq("sku", sku)
      .maybeSingle();
    if (error) throw new Error(`SupabaseProductLinkRepository.findLink failed: ${error.message}`);
    if (!data) return null;
    return {
      organizationId: data.organizations_id as string,
      sku: data.sku as string,
      productId: data.product_id as string,
      marketplace: "any",
      marketplaceItemId: null,
      variationId: null,
    };
  }

  async listLinks(organizationId: string, skus: ReadonlyArray<string>): Promise<ReadonlyArray<OrderItemLink>> {
    if (skus.length === 0) return [];
    const { data, error } = await this.supabase
      .from("marketplace_item_product_links")
      .select("organizations_id, sku, product_id")
      .eq("organizations_id", organizationId)
      .in("sku", [...skus]);
    if (error) throw new Error(`SupabaseProductLinkRepository.listLinks failed: ${error.message}`);
    return ((data as ReadonlyArray<LinkRow> | null) ?? []).map((row) => ({
      organizationId: row.organizations_id,
      sku: row.sku,
      productId: row.product_id,
      marketplace: "any" as const,
      marketplaceItemId: null,
      variationId: null,
    }));
  }

  async checkLinks(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<ReadonlyArray<ProductLinkResult>> {
    const itemsNeedingLookup = params.items.filter((item) => !item.sellerSku);
    if (itemsNeedingLookup.length === 0) {
      return params.items.map((item) => ({
        marketplaceItemId: item.marketplaceItemId,
        variationId: item.variationId,
        productId: "sku_resolved",
        source: "sku" as const,
      }));
    }
    const { data, error } = await this.supabase
      .from("marketplace_item_product_links")
      .select("marketplace_item_id, variation_id, product_id")
      .eq("organizations_id", params.organizationId)
      .eq("marketplace_name", params.marketplace)
      .in("marketplace_item_id", itemsNeedingLookup.map((i) => i.marketplaceItemId));
    if (error) throw new Error(`SupabaseProductLinkRepository.checkLinks failed: ${error.message}`);
    const linkMap = new Map<string, string>(
      (data ?? []).map((row: { marketplace_item_id: string; variation_id: string; product_id: string }) =>
        [`${row.marketplace_item_id}:${row.variation_id}`, row.product_id]
      ),
    );
    return params.items.map((item) => {
      if (item.sellerSku) {
        return { marketplaceItemId: item.marketplaceItemId, variationId: item.variationId, productId: "sku_resolved", source: "sku" as const };
      }
      const key = `${item.marketplaceItemId}:${item.variationId}`;
      const productId = linkMap.get(key) ?? null;
      return { marketplaceItemId: item.marketplaceItemId, variationId: item.variationId, productId, source: productId ? "permanent" as const : null };
    });
  }

  async upsertPermanentLink(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceItemId: string;
    readonly variationId: string;
    readonly productId: string;
  }): Promise<void> {
    const { error } = await this.supabase.from("marketplace_item_product_links").upsert(
      {
        organizations_id: params.organizationId,
        marketplace_name: params.marketplace,
        marketplace_item_id: params.marketplaceItemId,
        variation_id: params.variationId,
        product_id: params.productId,
      },
      { onConflict: "organizations_id,marketplace_name,marketplace_item_id,variation_id" },
    );
    if (error) throw new Error(`SupabaseProductLinkRepository.upsertPermanentLink failed: ${error.message}`);
  }

  async countUnlinkedItems(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly orderId: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<number> {
    const results = await this.checkLinks({
      organizationId: params.organizationId,
      marketplace: params.marketplace,
      items: params.items,
    });
    return results.filter((r) => r.productId === null).length;
  }
}
