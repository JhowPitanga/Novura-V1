/**
 * promotions-ml-exclusion-list
 * Query or toggle Mercado Livre automatic campaign exclusion list.
 *
 * Body:
 *  { integrationId, target: "seller"|"item", itemId?: string, exclusionStatus?: boolean }
 *
 * - Omit exclusionStatus to perform a read (GET).
 * - Set exclusionStatus=true to exclude, false to re-include.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter } from "../_shared/adapters/promotions/factory.ts";
import { getIntegrationMeta } from "../_shared/adapters/promotions/db-upsert.ts";
import { ProviderUnsupportedError } from "../_shared/domain/promotions/promotion-types.ts";
import type { MlExclusionTarget } from "../_shared/domain/promotions/promotion-types.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const { integrationId, target, itemId, exclusionStatus } = body;
  if (!integrationId || !target) {
    return jsonResponse({ error: "integrationId and target (seller|item) required" }, 400);
  }
  if (!["seller", "item"].includes(target)) {
    return jsonResponse({ error: "target must be 'seller' or 'item'" }, 400);
  }
  if (target === "item" && !itemId && exclusionStatus !== undefined) {
    return jsonResponse({ error: "itemId required for item target" }, 400);
  }

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  try {
    const { marketplaceName } = await getIntegrationMeta(admin, integrationId);
    const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);

    if (!adapter.manageMlExclusionList) {
      throw new ProviderUnsupportedError("manageMlExclusionList", marketplaceName);
    }

    const result = await adapter.manageMlExclusionList(
      target as MlExclusionTarget,
      itemId,
      exclusionStatus,
    );
    return jsonResponse({ ok: true, ...result });
  } catch (e: any) {
    if (e instanceof ProviderUnsupportedError) {
      return jsonResponse({ ok: false, error: e.message }, 422);
    }
    console.error("promotions-ml-exclusion-list error:", e);
    return jsonResponse({ ok: false, error: e.message ?? String(e) }, 200);
  }
});
