/**
 * Helpers for persisting universal campaign data into marketplace_promotions
 * and marketplace_promotion_items tables. Used by all promotions-* edge functions.
 */

import type { UniversalCampaign, UniversalCampaignItem } from "../../domain/promotions/promotion-types.ts";

type AdminClient = any; // typed via Supabase admin client at call sites

function logDb(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    scope: "promotions-db-upsert",
    event,
    ...data,
  }));
}

function logDbError(event: string, error: unknown, data: Record<string, unknown> = {}): void {
  const err = error as any;
  console.error(JSON.stringify({
    scope: "promotions-db-upsert",
    level: "error",
    event,
    message: err?.message ?? String(error),
    code: err?.code ?? null,
    details: err?.details ?? null,
    hint: err?.hint ?? null,
    ...data,
  }));
}

export async function upsertCampaign(
  admin: AdminClient,
  organizationId: string,
  integrationId: string,
  marketplaceKey: string,
  campaign: UniversalCampaign,
): Promise<string> {
  const row: Record<string, unknown> = {
    organizations_id: organizationId,
    integration_id: integrationId,
    marketplace_key: marketplaceKey,
    external_id: campaign.externalId,
    promotion_type: campaign.promotionType,
    source: campaign.source,
    status: campaign.status,
    name: campaign.name,
    start_date: campaign.startDate,
    finish_date: campaign.finishDate,
    deadline_date: campaign.deadlineDate,
    discount_percent: campaign.discountPercent,
    meli_percent: campaign.meliPercent,
    seller_percent: campaign.sellerPercent,
    raw: campaign.raw,
    last_synced_at: new Date().toISOString(),
  };

  // Persist native ML promotion type when available (ml_kind column added in 20260512 migration)
  if (campaign.mlKind) {
    row.ml_kind = campaign.mlKind;
  }

  logDb("campaign_upsert_request", {
    organizationId,
    integrationId,
    marketplaceKey,
    externalId: campaign.externalId,
    promotionType: campaign.promotionType,
    status: campaign.status,
  });

  const { data, error } = await admin
    .from("marketplace_promotions")
    .upsert(row, { onConflict: "organizations_id,marketplace_key,external_id" })
    .select("id")
    .single();

  if (error) {
    logDbError("campaign_upsert_error", error, {
      organizationId,
      integrationId,
      marketplaceKey,
      externalId: campaign.externalId,
    });
    throw new Error(`Failed to upsert campaign ${campaign.externalId}: ${error.message}`);
  }

  logDb("campaign_upsert_success", {
    id: data.id,
    externalId: campaign.externalId,
    marketplaceKey,
  });

  return data.id as string;
}

export async function upsertCampaignItems(
  admin: AdminClient,
  promotionId: string,
  items: UniversalCampaignItem[],
): Promise<void> {
  if (items.length === 0) {
    logDb("items_upsert_skipped_empty", { promotionId });
    return;
  }

  const rows = items.map(item => ({
    promotion_id: promotionId,
    marketplace_item_id: item.marketplaceItemId,
    variation_id: item.variationId ?? null,
    status: item.status,
    original_price: item.originalPrice,
    deal_price: item.dealPrice,
    top_deal_price: item.topDealPrice,
    min_discounted_price: item.minDiscountedPrice,
    max_discounted_price: item.maxDiscountedPrice,
    suggested_discounted_price: item.suggestedDiscountedPrice,
    promotion_stock: item.promotionStock,
    purchase_limit: item.purchaseLimit,
    raw: item.raw,
    last_synced_at: new Date().toISOString(),
  }));

  // Batch in groups of 100 to avoid payload limits
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    logDb("items_upsert_batch_request", {
      promotionId,
      batchStart: i,
      batchSize: batch.length,
      sample: batch.slice(0, 5).map((item) => ({
        marketplaceItemId: item.marketplace_item_id,
        variationId: item.variation_id,
        status: item.status,
        dealPrice: item.deal_price,
      })),
    });

    const { error } = await admin
      .from("marketplace_promotion_items")
      .upsert(batch, {
        onConflict: "promotion_id,marketplace_item_id,variation_id",
        ignoreDuplicates: false,
      });

    if (error) {
      logDbError("items_upsert_batch_error", error, {
        promotionId,
        batchStart: i,
        batchSize: batch.length,
      });
      throw new Error(`Failed to upsert promotion items: ${error.message}`);
    }

    logDb("items_upsert_batch_success", {
      promotionId,
      batchStart: i,
      batchSize: batch.length,
    });
  }
}

export async function getIntegrationMeta(
  admin: AdminClient,
  integrationId: string,
): Promise<{ organizationId: string; marketplaceName: string }> {
  logDb("integration_meta_request", { integrationId });
  const { data, error } = await admin
    .from("marketplace_integrations")
    .select("organizations_id, marketplace_name")
    .eq("id", integrationId)
    .single();

  if (error || !data) {
    logDbError("integration_meta_error", error ?? new Error("Integration not found"), { integrationId });
    throw new Error(error?.message ?? "Integration not found");
  }

  logDb("integration_meta_success", {
    integrationId,
    organizationId: data.organizations_id,
    marketplaceName: data.marketplace_name,
  });

  return { organizationId: data.organizations_id, marketplaceName: data.marketplace_name };
}
