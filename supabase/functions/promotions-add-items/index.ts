/**
 * promotions-add-items
 * Adds marketplace listings to an existing promotion.
 *
 * Body: {
 *   integrationId: string,
 *   externalId: string,
 *   promotionType: "STANDARD_DISCOUNT" | "FLASH_SALE",
 *   items: Array<{
 *     marketplaceItemId: string,
 *     variationId?: string,
 *     dealPrice?: number,        // absolute promotional price (takes priority)
 *     discountPercent?: number,  // 0–99; resolved to dealPrice via marketplace_items.price
 *     topDealPrice?: number,
 *     promotionStock?: number,
 *     purchaseLimit?: number,
 *   }>
 * }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter, normalizeMarketplaceKey } from "../_shared/adapters/promotions/factory.ts";
import { getIntegrationMeta, upsertCampaignItems } from "../_shared/adapters/promotions/db-upsert.ts";
import type { UniversalCampaignItem, AddItemInput } from "../_shared/domain/promotions/promotion-types.ts";

/** Resolve discountPercent → dealPrice using listing price (same tables as client listings). */
async function resolveItemPrices(
  admin: any,
  organizationId: string,
  marketplaceName: string,
  items: any[],
): Promise<AddItemInput[]> {
  const needLookup = items.filter(i => i.dealPrice == null && i.discountPercent != null);
  const priceMap = new Map<string, number>();

  if (needLookup.length > 0) {
    const ids = needLookup.map(i => i.marketplaceItemId);
    const isShopee = String(marketplaceName).toLowerCase() === "shopee";
    const legacyTable = isShopee ? "marketplace_items_raw" : "marketplace_items_unified";

    let rows: { marketplace_item_id: string; price: number | null }[] | null = null;
    const canonical = await admin
      .from("marketplace_listings")
      .select("marketplace_item_id, price")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", marketplaceName)
      .in("marketplace_item_id", ids);
    if (!canonical.error && Array.isArray(canonical.data) && canonical.data.length) {
      rows = canonical.data as { marketplace_item_id: string; price: number | null }[];
    }
    if (!rows?.length) {
      const primary = await admin
        .from(legacyTable)
        .select("marketplace_item_id, price")
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", marketplaceName)
        .in("marketplace_item_id", ids);
      if (!primary.error && Array.isArray(primary.data)) {
        rows = primary.data as { marketplace_item_id: string; price: number | null }[];
      }
    }
    if (!rows?.length) {
      const leg = await admin
        .from("marketplace_items")
        .select("marketplace_item_id, price")
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", marketplaceName)
        .in("marketplace_item_id", ids);
      if (!leg.error && Array.isArray(leg.data)) rows = leg.data;
    }
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
    return { ...i, dealPrice } as AddItemInput;
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

    // Inject mlKind into each item so the ML adapter can route the correct promotion_type
    const itemsWithKind = mlKind
      ? items.map((i: any) => ({ ...i, mlKind: i.mlKind ?? mlKind }))
      : items;

    const resolvedItems = await resolveItemPrices(admin, organizationId, marketplaceName, itemsWithKind);
    const result = await adapter.addItems(externalId, promotionType, resolvedItems);

    // Upsert successful items into local DB
    const { data: promoRow } = await admin
      .from("marketplace_promotions")
      .select("id")
      .eq("integration_id", integrationId)
      .eq("external_id", externalId)
      .single();

    if (promoRow?.id && result.successful.length > 0) {
      const successfulItems = resolvedItems.filter(i => result.successful.includes(i.marketplaceItemId));
      const universalItems: UniversalCampaignItem[] = successfulItems.map(i => ({
        marketplaceItemId: i.marketplaceItemId,
        variationId: i.variationId ?? null,
        status: "pending",
        originalPrice: null,
        dealPrice: i.dealPrice ?? null,
        topDealPrice: i.topDealPrice ?? null,
        minDiscountedPrice: null,
        maxDiscountedPrice: null,
        suggestedDiscountedPrice: null,
        promotionStock: i.promotionStock ?? null,
        purchaseLimit: i.purchaseLimit ?? null,
        raw: {},
      }));
      await upsertCampaignItems(admin, promoRow.id, universalItems);
    }

    return jsonResponse({ ok: true, ...result });
  } catch (e: any) {
    console.error("promotions-add-items error:", e);
    return jsonResponse({ ok: false, error: e.message ?? String(e) }, 200);
  }
});
