/**
 * promotions-update
 * Updates campaign metadata (name, dates) on the marketplace and locally.
 * Body: { integrationId, externalId, promotionType, name?, startDate?, endDate? }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter, normalizeMarketplaceKey } from "../_shared/adapters/promotions/factory.ts";
import { upsertCampaign, getIntegrationMeta } from "../_shared/adapters/promotions/db-upsert.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const { integrationId, externalId, promotionType, name, startDate, endDate } = body;
  if (!integrationId || !externalId || !promotionType) {
    return jsonResponse({ error: "integrationId, externalId and promotionType required" }, 400);
  }

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  try {
    const { organizationId, marketplaceName } = await getIntegrationMeta(admin, integrationId);
    const marketplaceKey = normalizeMarketplaceKey(marketplaceName);
    const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);

    const campaign = await adapter.updateCampaign(externalId, promotionType, { name, startDate, endDate });
    await upsertCampaign(admin, organizationId, integrationId, marketplaceKey, campaign);
    return jsonResponse({ ok: true, campaign });
  } catch (e: any) {
    console.error("promotions-update error:", e);
    return jsonResponse({ ok: false, error: e.message ?? String(e) }, 200);
  }
});
