/**
 * promotions-remove-item
 * Removes one item (and optionally its variation) from a promotion.
 * Body: { integrationId, externalId, promotionType, marketplaceItemId, variationId? }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter } from "../_shared/adapters/promotions/factory.ts";
import { getIntegrationMeta } from "../_shared/adapters/promotions/db-upsert.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const { integrationId, externalId, promotionType, marketplaceItemId, variationId, mlKind } = body;
  if (!integrationId || !externalId || !promotionType || !marketplaceItemId) {
    return jsonResponse({ error: "integrationId, externalId, promotionType and marketplaceItemId required" }, 400);
  }

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  try {
    const { marketplaceName } = await getIntegrationMeta(admin, integrationId);
    const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);

    await adapter.removeItem(externalId, promotionType, marketplaceItemId, variationId, mlKind);

    // Remove locally
    const { data: promoRow } = await admin
      .from("marketplace_promotions")
      .select("id")
      .eq("integration_id", integrationId)
      .eq("external_id", externalId)
      .single();

    if (promoRow?.id) {
      let q = admin
        .from("marketplace_promotion_items")
        .delete()
        .eq("promotion_id", promoRow.id)
        .eq("marketplace_item_id", marketplaceItemId);
      if (variationId) q = q.eq("variation_id", variationId);
      await q;
    }

    return jsonResponse({ ok: true });
  } catch (e: any) {
    console.error("promotions-remove-item error:", e);
    return jsonResponse({ ok: false, error: e.message ?? String(e) }, 200);
  }
});
