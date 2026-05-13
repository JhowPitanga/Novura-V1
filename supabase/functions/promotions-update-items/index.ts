/**
 * promotions-update-items
 * Updates price / purchase limit for items already in a promotion.
 * Body: { integrationId, externalId, promotionType, items: UpdateItemInput[] }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter } from "../_shared/adapters/promotions/factory.ts";
import { getIntegrationMeta } from "../_shared/adapters/promotions/db-upsert.ts";
import type { UpdateItemInput } from "../_shared/domain/promotions/promotion-types.ts";

/** Resolve discountPercent → dealPrice for update items (same logic as add-items). */
async function resolveUpdatePrices(
  admin: any,
  organizationId: string,
  marketplaceName: string,
  items: any[],
): Promise<UpdateItemInput[]> {
  const needLookup = items.filter(i => i.dealPrice == null && i.discountPercent != null);
  const priceMap = new Map<string, number>();

  if (needLookup.length > 0) {
    const ids = needLookup.map(i => i.marketplaceItemId);
    const { data: rows } = await admin
      .from("marketplace_items")
      .select("marketplace_item_id, price")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", marketplaceName)
      .in("marketplace_item_id", ids);
    for (const row of rows ?? []) {
      if (row.price != null) priceMap.set(String(row.marketplace_item_id), Number(row.price));
    }
  }

  return items.map(i => {
    let dealPrice: number | undefined = i.dealPrice != null ? Number(i.dealPrice) : undefined;
    if (dealPrice == null && i.discountPercent != null) {
      const original = priceMap.get(String(i.marketplaceItemId));
      if (original != null) {
        dealPrice = Math.round(original * (1 - Number(i.discountPercent) / 100) * 100) / 100;
      }
    }
    return { ...i, dealPrice } as UpdateItemInput;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const { integrationId, externalId, promotionType, items, mlKind } = body;
  if (!integrationId || !externalId || !promotionType || !Array.isArray(items) || items.length === 0) {
    return jsonResponse({ error: "integrationId, externalId, promotionType and items[] required" }, 400);
  }

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  try {
    const { organizationId, marketplaceName } = await getIntegrationMeta(admin, integrationId);
    const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);

    // Inject mlKind into each item so the ML adapter can enforce no-update-in-place rules
    const itemsWithKind = mlKind
      ? items.map((i: any) => ({ ...i, mlKind: i.mlKind ?? mlKind }))
      : items;

    const resolvedItems = await resolveUpdatePrices(admin, organizationId, marketplaceName, itemsWithKind);
    const result = await adapter.updateItems(externalId, promotionType, resolvedItems);

    // Reflect updated prices in local DB for successful items
    const { data: promoRow } = await admin
      .from("marketplace_promotions")
      .select("id")
      .eq("integration_id", integrationId)
      .eq("external_id", externalId)
      .single();

    if (promoRow?.id) {
      for (const item of resolvedItems) {
        if (!result.successful.includes(item.marketplaceItemId)) continue;
        const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
        if (item.dealPrice != null) patch.deal_price = item.dealPrice;
        if (item.topDealPrice != null) patch.top_deal_price = item.topDealPrice;
        if (item.purchaseLimit != null) patch.purchase_limit = item.purchaseLimit;
        await admin
          .from("marketplace_promotion_items")
          .update(patch)
          .eq("promotion_id", promoRow.id)
          .eq("marketplace_item_id", item.marketplaceItemId);
      }
    }

    return jsonResponse({ ok: true, ...result });
  } catch (e: any) {
    console.error("promotions-update-items error:", e);
    return jsonResponse({ ok: false, error: e.message ?? String(e) }, 200);
  }
});
