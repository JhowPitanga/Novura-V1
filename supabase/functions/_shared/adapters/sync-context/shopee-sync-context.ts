/**
 * Resolve sync context for Shopee order sync: token + app credentials (partner_id, partner_key).
 * Shared by orders-sync-shopee and any other Edge Function that needs Shopee sync context.
 */

import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { MarketplaceIntegrationsPort } from "../../ports/marketplace-integrations-port.ts";
import type { AppCredentialsPort } from "../../ports/app-credentials-port.ts";
import { createAdminClient } from "../infra/supabase-client.ts";
import { jsonResponse } from "../infra/http-utils.ts";
import { getShopeeAccessToken } from "../tokens/shopee-token.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../integrations/app-credentials-adapter.ts";

const SHOPEE_APP_NAME = "Shopee";

export interface SyncShopeeInput {
  organization_id?: string;
  integration_id: string;
  time_from?: number;
  time_to?: number;
}

export interface ShopeeSyncContext {
  admin: SupabaseClient;
  orgId: string;
  integrationId: string;
  encKeyB64: string;
  accessToken: string;
  shopId: number;
  partnerId: string;
  partnerKey: string;
  /** Ports for onRefresh: getShopeeAccessToken(integrationsPort, appCredentialsPort, integrationId, encKeyB64) */
  integrationsPort: MarketplaceIntegrationsPort;
  appCredentialsPort: AppCredentialsPort;
}

export type ResolveShopeeSyncContextResult = { err: Response } | { ctx: ShopeeSyncContext };

/**
 * Validates input, loads token via getShopeeAccessToken, loads app credentials (partner_id, partner_key).
 */
export async function resolveShopeeSyncContext(
  body: SyncShopeeInput | null | undefined,
): Promise<ResolveShopeeSyncContextResult> {
  const integrationId = body?.integration_id;
  if (!integrationId) return { err: jsonResponse({ error: "integration_id required" }, 400) };
  const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!encKey) return { err: jsonResponse({ error: "TOKENS_ENCRYPTION_KEY not set" }, 500) };

  const admin = createAdminClient();
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  const tokenResult = await getShopeeAccessToken(
    integrations,
    appCredentials,
    integrationId,
    encKey,
  );
  const orgId = body?.organization_id ?? tokenResult.organizationId;

  const appRow = await appCredentials.getByName(SHOPEE_APP_NAME);
  if (!appRow) {
    return { err: jsonResponse({ error: "Shopee app credentials not found" }, 500) };
  }
  const partnerId = appRow.client_id.trim();
  const partnerKey = appRow.client_secret.trim();
  if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) {
    return { err: jsonResponse({ error: "Invalid Shopee partner_id or partner_key" }, 500) };
  }

  return {
    ctx: {
      admin,
      orgId,
      integrationId,
      encKeyB64: encKey,
      accessToken: tokenResult.accessToken,
      shopId: tokenResult.shopId,
      partnerId,
      partnerKey,
      integrationsPort: integrations,
      appCredentialsPort: appCredentials,
    },
  };
}
