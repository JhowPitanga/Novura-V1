import { supabase } from "@/integrations/supabase/client";
import { getCompanyIdForOrg } from "@/services/supabase-helpers";

export interface ListingLink {
  id: string;
  organizations_id: string;
  marketplace_name: string;
  marketplace_item_id: string;
  variation_id: string;
  product_id: string;
}

/** Fetch all linked listing→product pairs for an org and marketplace */
export async function fetchListingLinks(
  orgId: string,
  marketplaceName: string
): Promise<Map<string, string>> {
  const { data, error } = await (supabase as any)
    .from("marketplace_item_product_links")
    .select("marketplace_item_id, variation_id, product_id")
    .eq("organizations_id", orgId)
    .eq("marketplace_name", marketplaceName);

  if (error) throw new Error(error.message);

  // Map key: `${marketplace_item_id}:${variation_id}`
  const map = new Map<string, string>();
  for (const row of (data || []) as any[]) {
    const key = `${row.marketplace_item_id}:${String(row.variation_id || "")}`;
    map.set(key, row.product_id);
  }
  return map;
}

/** Upsert a permanent link between a marketplace listing and an internal product */
export async function upsertListingProductLink(params: {
  orgId: string;
  marketplaceName: string;
  marketplaceItemId: string;
  variationId?: string;
  productId: string;
}): Promise<void> {
  const { orgId, marketplaceName, marketplaceItemId, variationId = "", productId } = params;
  const companyId = await getCompanyIdForOrg(orgId);
  if (!companyId) {
    throw new Error("Não foi possível resolver company_id para a organização.");
  }

  const { error } = await (supabase as any)
    .from("marketplace_item_product_links")
    .upsert(
      {
        organizations_id: orgId,
        company_id: companyId,
        marketplace_name: marketplaceName,
        marketplace_item_id: marketplaceItemId,
        variation_id: variationId,
        product_id: productId,
        permanent: true,
      },
      {
        onConflict: "organizations_id,marketplace_name,marketplace_item_id,variation_id",
      }
    );

  if (error) throw new Error(error.message);
}

/** Remove an existing link */
export async function removeListingProductLink(params: {
  orgId: string;
  marketplaceName: string;
  marketplaceItemId: string;
  variationId?: string;
}): Promise<void> {
  const { orgId, marketplaceName, marketplaceItemId, variationId = "" } = params;

  const { error } = await (supabase as any)
    .from("marketplace_item_product_links")
    .delete()
    .eq("organizations_id", orgId)
    .eq("marketplace_name", marketplaceName)
    .eq("marketplace_item_id", marketplaceItemId)
    .eq("variation_id", variationId);

  if (error) throw new Error(error.message);
}
