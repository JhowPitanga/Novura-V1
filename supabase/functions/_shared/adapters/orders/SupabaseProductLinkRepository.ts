import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { IProductLinkRepository, OrderItemLink } from "../../domain/orders/ports/IProductLinkRepository.ts";

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
    return { organizationId: data.organizations_id as string, sku: data.sku as string, productId: data.product_id as string };
  }

  async listLinks(organizationId: string, skus: ReadonlyArray<string>): Promise<ReadonlyArray<OrderItemLink>> {
    if (skus.length === 0) return [];
    const { data, error } = await this.supabase
      .from("marketplace_item_product_links")
      .select("organizations_id, sku, product_id")
      .eq("organizations_id", organizationId)
      .in("sku", [...skus]);
    if (error) throw new Error(`SupabaseProductLinkRepository.listLinks failed: ${error.message}`);
    return (data as ReadonlyArray<LinkRow> | null ?? []).map((row) => ({
      organizationId: row.organizations_id,
      sku: row.sku,
      productId: row.product_id,
    }));
  }
}
