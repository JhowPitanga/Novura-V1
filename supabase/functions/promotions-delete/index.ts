/**
 * promotions-delete
 * Deletes / ends a campaign on the marketplace and marks it locally as ended.
 * Body: { integrationId, externalId, promotionType }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter, normalizeMarketplaceKey } from "../_shared/adapters/promotions/factory.ts";
import { getIntegrationMeta } from "../_shared/adapters/promotions/db-upsert.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  // force: "auto" (default) | "end" (active → end_discount) | "delete" (upcoming → delete_discount)
  const { integrationId, externalId, promotionType, force } = body;
  if (!integrationId || !externalId || !promotionType) {
    return jsonResponse({ error: "integrationId, externalId and promotionType required" }, 400);
  }

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  try {
    const { marketplaceName } = await getIntegrationMeta(admin, integrationId);
    const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);

    const effectiveForce: "auto" | "end" | "delete" = ["end", "delete"].includes(force) ? force : "auto";

    // Use endCampaign if adapter supports it and force="end", otherwise route through deleteCampaign
    if (effectiveForce === "end" && adapter.endCampaign) {
      await adapter.endCampaign(externalId, promotionType);
    } else {
      // deleteCampaign on ShopeePromotionsAdapter already handles auto/end/delete routing
      await (adapter as any).deleteCampaign(externalId, promotionType, effectiveForce);
    }

    // Mark locally as ended
    await admin
      .from("marketplace_promotions")
      .update({ status: "ended", last_synced_at: new Date().toISOString() })
      .eq("integration_id", integrationId)
      .eq("external_id", externalId);

    return jsonResponse({ ok: true });
  } catch (e: any) {
    console.error("promotions-delete error:", e);
    return jsonResponse({ ok: false, error: e.message ?? String(e) }, 200);
  }
});
