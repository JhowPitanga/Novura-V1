/**
 * Resolve sync context for ML order sync: token + date range defaults.
 * Shared by orders-sync-ml and any other Edge Function that needs ML sync context.
 */

import type { SupabaseClient } from "../infra/supabase-client.ts";
import { createAdminClient } from "../infra/supabase-client.ts";
import { jsonResponse } from "../infra/http-utils.ts";
import { getMlAccessToken } from "../tokens/ml-token.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../integrations/app-credentials-adapter.ts";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export interface SyncMLInput {
  organization_id?: string;
  integration_id: string;
  date_from?: string;
  date_to?: string;
}

export interface MLSyncContext {
  admin: SupabaseClient;
  accessToken: string;
  sellerId: string;
  orgId: string;
  integrationId: string;
  dateFrom: string;
  dateTo: string;
  nowIso: string;
}

export type ResolveMLSyncContextResult = { err: Response } | { ctx: MLSyncContext };

/**
 * Validates input, loads token via getMlAccessToken, sets date range (default last 90 days).
 * Returns { err } on validation/load failure or { ctx } on success.
 */
export async function resolveMLSyncContext(
  body: SyncMLInput | null | undefined,
): Promise<ResolveMLSyncContextResult> {
  const integrationId = body?.integration_id;
  if (!integrationId) return { err: jsonResponse({ error: "integration_id required" }, 400) };
  const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!encKey) return { err: jsonResponse({ error: "TOKENS_ENCRYPTION_KEY not set" }, 500) };

  const admin = createAdminClient();
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  const { accessToken, organizationId: resolvedOrgId, sellerId } = await getMlAccessToken(
    integrations,
    appCredentials,
    integrationId,
    encKey,
  );
  if (!sellerId) return { err: jsonResponse({ error: "Seller ID not found for integration" }, 400) };

  const nowIso = new Date().toISOString();
  const dateTo = body?.date_to ?? nowIso;
  const dateFrom = body?.date_from ?? new Date(Date.now() - NINETY_DAYS_MS).toISOString();

  return {
    ctx: {
      admin,
      accessToken,
      sellerId,
      orgId: body?.organization_id ?? resolvedOrgId,
      integrationId,
      dateFrom,
      dateTo,
      nowIso,
    },
  };
}
