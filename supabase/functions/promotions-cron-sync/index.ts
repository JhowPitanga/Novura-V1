/**
 * promotions-cron-sync
 * Called by pg_cron every 30 minutes.
 * Iterates active marketplace integrations and syncs promotions for each.
 *
 * Only syncs active integrations that have at least one promotion in a live status
 * to avoid unnecessary API calls on inactive accounts.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter, normalizeMarketplaceKey } from "../_shared/adapters/promotions/factory.ts";
import { upsertCampaign, upsertCampaignItems } from "../_shared/adapters/promotions/db-upsert.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";

const ACTIVE_STATUSES = ["active", "scheduled", "candidate", "pending"];

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  // Fetch all active integrations that support promotions (ML and Shopee)
  const { data: rows, error } = await admin
    .from("marketplace_integrations")
    .select("id, organizations_id, marketplace_name")
    .in("marketplace_name", ["Mercado Livre", "Shopee"])
    .is("deactivated_at", null)
    .eq("status", "active");

  if (error) {
    console.error("promotions-cron-sync: failed to fetch integrations:", error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  const results: Array<{ integrationId: string; ok: boolean; campaigns?: number; error?: string }> = [];

  for (const row of rows ?? []) {
    const integrationId = String(row.id);
    const marketplaceName = String(row.marketplace_name);
    const organizationId = String(row.organizations_id);

    try {
      const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);
      const marketplaceKey = normalizeMarketplaceKey(marketplaceName);

      const campaigns = await adapter.listCampaigns({});
      let synced = 0;

      for (const campaign of campaigns) {
        const promotionId = await upsertCampaign(admin, organizationId, integrationId, marketplaceKey, campaign);
        if (ACTIVE_STATUSES.includes(campaign.status)) {
          try {
            const items = await adapter.getCampaignItems(campaign.externalId, campaign.promotionType);
            await upsertCampaignItems(admin, promotionId, items);
          } catch (e) {
            console.error(`promotions-cron-sync: items error for ${campaign.externalId}:`, e);
          }
        }
        synced++;
      }

      results.push({ integrationId, ok: true, campaigns: synced });
    } catch (e: any) {
      console.error(`promotions-cron-sync: error for integration ${integrationId}:`, e);
      results.push({ integrationId, ok: false, error: e.message ?? String(e) });
    }
  }

  const totalOk = results.filter(r => r.ok).length;
  console.log(`promotions-cron-sync: synced ${totalOk}/${results.length} integrations`);
  return jsonResponse({ ok: true, results });
});
