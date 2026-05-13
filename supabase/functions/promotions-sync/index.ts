/**
 * promotions-sync
 * Syncs all campaigns (and their items) for a given integration from the marketplace API.
 * Body: { integrationId: string }
 * Used by: UI "Sincronizar agora" button and promotions-cron-sync.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter } from "../_shared/adapters/promotions/factory.ts";
import { normalizeMarketplaceKey } from "../_shared/adapters/promotions/factory.ts";
import { upsertCampaign, upsertCampaignItems, getIntegrationMeta } from "../_shared/adapters/promotions/db-upsert.ts";

const SYNC_STATUSES = ["active", "scheduled", "candidate", "pending"];

function createRequestId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function logInfo(requestId: string, event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    scope: "promotions-sync",
    level: "info",
    requestId,
    event,
    ...data,
  }));
}

function logWarn(requestId: string, event: string, data: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({
    scope: "promotions-sync",
    level: "warn",
    requestId,
    event,
    ...data,
  }));
}

function logError(requestId: string, event: string, error: unknown, data: Record<string, unknown> = {}): void {
  const err = error as any;
  console.error(JSON.stringify({
    scope: "promotions-sync",
    level: "error",
    requestId,
    event,
    message: err?.message ?? String(error),
    name: err?.name ?? null,
    code: err?.code ?? null,
    marketplaceCode: err?.marketplaceCode ?? null,
    retriable: err?.retriable ?? null,
    stack: err?.stack ?? null,
    ...data,
  }));
}

serve(async (req) => {
  const requestId = createRequestId();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) {
    logError(requestId, "missing_env", new Error("Missing TOKENS_ENCRYPTION_KEY"));
    return jsonResponse({ ok: false, requestId, error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    logWarn(requestId, "invalid_or_empty_json_body", { message: (e as any)?.message ?? String(e) });
  }

  const integrationId: string | undefined = body?.integrationId;
  logInfo(requestId, "request_received", {
    method: req.method,
    hasIntegrationId: Boolean(integrationId),
    integrationId: integrationId ?? null,
    debug: body?.debug === true,
  });

  if (!integrationId) {
    logWarn(requestId, "missing_integration_id");
    return jsonResponse({ ok: false, requestId, error: "integrationId required" }, 400);
  }

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  try {
    logInfo(requestId, "integration_meta_lookup_started", { integrationId });
    const { organizationId, marketplaceName } = await getIntegrationMeta(admin, integrationId);
    const marketplaceKey = normalizeMarketplaceKey(marketplaceName);
    logInfo(requestId, "integration_meta_resolved", {
      integrationId,
      organizationId,
      marketplaceName,
      marketplaceKey,
    });

    const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);
    logInfo(requestId, "adapter_resolved", {
      adapter: adapter.constructor?.name ?? "unknown",
      marketplaceKey,
    });

    logInfo(requestId, "adapter_list_campaigns_started", { marketplaceKey });
    const campaigns = await adapter.listCampaigns({});
    logInfo(requestId, "adapter_list_campaigns_finished", {
      totalCampaigns: campaigns.length,
      byType: campaigns.reduce((acc: Record<string, number>, campaign) => {
        acc[campaign.promotionType] = (acc[campaign.promotionType] ?? 0) + 1;
        return acc;
      }, {}),
      byStatus: campaigns.reduce((acc: Record<string, number>, campaign) => {
        acc[campaign.status] = (acc[campaign.status] ?? 0) + 1;
        return acc;
      }, {}),
      sample: campaigns.slice(0, 5).map((campaign) => ({
        externalId: campaign.externalId,
        type: campaign.promotionType,
        source: campaign.source,
        status: campaign.status,
        name: campaign.name,
        startDate: campaign.startDate,
        finishDate: campaign.finishDate,
      })),
    });

    if (campaigns.length === 0) {
      logWarn(requestId, "adapter_returned_zero_campaigns", {
        integrationId,
        organizationId,
        marketplaceName,
        marketplaceKey,
        hint: "Check marketplace adapter logs for swallowed provider errors or unsupported statuses.",
      });
    }

    let totalItems = 0;
    let upsertedCampaigns = 0;
    let failedCampaigns = 0;
    let failedItems = 0;

    for (const campaign of campaigns) {
      logInfo(requestId, "campaign_upsert_started", {
        externalId: campaign.externalId,
        type: campaign.promotionType,
        status: campaign.status,
        source: campaign.source,
      });

      let promotionId: string;
      try {
        promotionId = await upsertCampaign(admin, organizationId, integrationId, marketplaceKey, campaign);
        upsertedCampaigns++;
        logInfo(requestId, "campaign_upsert_finished", {
          promotionId,
          externalId: campaign.externalId,
          type: campaign.promotionType,
          status: campaign.status,
        });
      } catch (e) {
        failedCampaigns++;
        logError(requestId, "campaign_upsert_failed", e, {
          externalId: campaign.externalId,
          type: campaign.promotionType,
          status: campaign.status,
          rawKeys: Object.keys(campaign.raw ?? {}),
        });
        continue;
      }

      // Only fetch items for non-ended campaigns
      if (SYNC_STATUSES.includes(campaign.status)) {
        try {
          // For ML campaigns, prefer the native ml_kind (raw.type) over the universal mapping
          const mlKind = campaign.mlKind ?? (campaign.raw?.type as string | undefined);
          logInfo(requestId, "campaign_items_fetch_started", {
            promotionId,
            externalId: campaign.externalId,
            type: campaign.promotionType,
            mlKind: mlKind ?? null,
            status: campaign.status,
          });
          const items = await adapter.getCampaignItems(campaign.externalId, campaign.promotionType, mlKind);
          logInfo(requestId, "campaign_items_fetch_finished", {
            promotionId,
            externalId: campaign.externalId,
            itemCount: items.length,
            sample: items.slice(0, 5).map((item) => ({
              marketplaceItemId: item.marketplaceItemId,
              variationId: item.variationId,
              status: item.status,
              dealPrice: item.dealPrice,
              promotionStock: item.promotionStock,
            })),
          });

          await upsertCampaignItems(admin, promotionId, items);
          totalItems += items.length;
          logInfo(requestId, "campaign_items_upsert_finished", {
            promotionId,
            externalId: campaign.externalId,
            itemCount: items.length,
          });
        } catch (e) {
          failedItems++;
          logError(requestId, "campaign_items_sync_failed", e, {
            promotionId,
            externalId: campaign.externalId,
            type: campaign.promotionType,
            status: campaign.status,
          });
        }
      } else {
        logInfo(requestId, "campaign_items_skipped_by_status", {
          promotionId,
          externalId: campaign.externalId,
          status: campaign.status,
        });
      }
    }

    const { count: localCount, error: countError } = await admin
      .from("marketplace_promotions")
      .select("id", { count: "exact", head: true })
      .eq("organizations_id", organizationId)
      .eq("marketplace_key", marketplaceKey);

    if (countError) {
      logError(requestId, "local_count_failed", countError, { organizationId, marketplaceKey });
    } else {
      logInfo(requestId, "local_count_after_sync", {
        organizationId,
        marketplaceKey,
        localCount,
      });
    }

    const summary = {
      ok: true,
      requestId,
      campaigns: campaigns.length,
      upsertedCampaigns,
      failedCampaigns,
      items: totalItems,
      failedItems,
      localCount: localCount ?? null,
      elapsedMs: Date.now() - startedAt,
    };

    logInfo(requestId, "sync_finished", summary);
    return jsonResponse(summary);
  } catch (e: any) {
    logError(requestId, "sync_failed", e, {
      integrationId,
      elapsedMs: Date.now() - startedAt,
    });
    return jsonResponse({ ok: false, requestId, error: e.message ?? String(e) }, 200);
  }
});
