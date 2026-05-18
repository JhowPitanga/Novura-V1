/**
 * Resolve Mercado Livre access token for an integration; refresh if within 30 minutes of expiry.
 * Shared by orders-sync-ml, orders-webhook, and any other function that needs a valid ML token.
 */

import type { MarketplaceIntegrationsPort } from "../../ports/marketplace-integrations-port.ts";
import type { AppCredentialsPort } from "../../ports/app-credentials-port.ts";
import type { IntegrationRow } from "../../domain/integration-types.ts";
import { importAesGcmKey, aesGcmDecryptFromString, aesGcmEncryptToString } from "../infra/token-utils.ts";

const EXPIRY_BUFFER_MS = 30 * 60 * 1000;
const ML_APP_NAME = "Mercado Livre";
const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export interface GetMlAccessTokenResult {
  accessToken: string;
  organizationId: string;
  sellerId: string;
}

async function decryptToken(encKeyB64: string, encrypted: string): Promise<string | null> {
  try {
    const key = await importAesGcmKey(encKeyB64);
    return await aesGcmDecryptFromString(key, encrypted);
  } catch {
    return null;
  }
}

function isNearExpiry(expiresIn: string | null, bufferMs: number): boolean {
  if (!expiresIn) return true;
  const expiresAt = new Date(String(expiresIn)).getTime();
  return expiresAt - Date.now() < bufferMs;
}

async function refreshAndSaveToken(
  integrations: MarketplaceIntegrationsPort,
  appCredentials: AppCredentialsPort,
  integrationId: string,
  encKeyB64: string,
  row: IntegrationRow,
): Promise<string | null> {
  const appRow = await appCredentials.getByName(ML_APP_NAME);
  if (!appRow) return null;

  const refreshPlain = await decryptToken(encKeyB64, row.refresh_token ?? "");
  if (!refreshPlain) return null;

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: appRow.client_id,
    client_secret: appRow.client_secret,
    refresh_token: refreshPlain,
  });
  const resp = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) return null;

  const aesKey = await importAesGcmKey(encKeyB64);
  const newEnc = await aesGcmEncryptToString(aesKey, json.access_token);
  const newRefreshEnc = await aesGcmEncryptToString(aesKey, json.refresh_token ?? refreshPlain);
  const expiresInIso = new Date(Date.now() + (Number(json.expires_in) || 0) * 1000).toISOString();

  await integrations.updateTokens(integrationId, {
    access_token: newEnc,
    refresh_token: newRefreshEnc,
    expires_in: expiresInIso,
    meli_user_id: json.user_id ?? row.meli_user_id ?? undefined,
  });

  return json.access_token;
}

/**
 * Force refresh ML token and persist to DB. Use when fetch returns 401/403.
 * Returns new access_token or null on failure.
 */
export async function forceRefreshMlToken(
  integrations: MarketplaceIntegrationsPort,
  appCredentials: AppCredentialsPort,
  integrationId: string,
  encKeyB64: string,
): Promise<string | null> {
  const row = await integrations.getIntegration(integrationId, {
    marketplaceName: ML_APP_NAME,
  });
  return refreshAndSaveToken(
    integrations,
    appCredentials,
    integrationId,
    encKeyB64,
    row,
  );
}

/**
 * Returns a valid ML access token for the given integration, refreshing if near expiry.
 * @throws if integration not found or token cannot be decrypted
 */
export async function getMlAccessToken(
  integrations: MarketplaceIntegrationsPort,
  appCredentials: AppCredentialsPort,
  integrationId: string,
  encKeyB64: string,
): Promise<GetMlAccessTokenResult> {
  const row = await integrations.getIntegration(integrationId, { marketplaceName: ML_APP_NAME });

  let accessToken = await decryptToken(encKeyB64, row.access_token);
  if (!accessToken) throw new Error("Failed to decrypt access token");

  const shouldRefresh = isNearExpiry(row.expires_in, EXPIRY_BUFFER_MS) && row.refresh_token;
  if (shouldRefresh) {
    const refreshed = await refreshAndSaveToken(
      integrations,
      appCredentials,
      integrationId,
      encKeyB64,
      row,
    );
    if (refreshed) accessToken = refreshed;
  }

  return {
    accessToken,
    organizationId: String(row.organizations_id),
    sellerId: String(row.meli_user_id ?? ""),
  };
}
