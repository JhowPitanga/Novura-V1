/**
 * Resolve Shopee access token for an integration; refresh via HMAC-signed /api/v2/auth/access_token/get if needed.
 * Shared by orders-sync-shopee and any other function that needs a valid Shopee token.
 */

import type { MarketplaceIntegrationsPort } from "../../ports/marketplace-integrations-port.ts";
import type { AppCredentialsPort } from "../../ports/app-credentials-port.ts";
import { getField } from "../infra/object-utils.ts";
import {
  importAesGcmKey,
  aesGcmEncryptToString,
  tryDecryptToken,
  hmacSha256Hex,
} from "../infra/token-utils.ts";

const SHOPEE_MARKETPLACE_NAME = "Shopee";
const REFRESH_PATH = "/api/v2/auth/access_token/get";
/** Shopee Open Platform Brazil — https://openplatform.shopee.com.br */
const SHOPEE_HOST = "https://openplatform.shopee.com.br";

export interface GetShopeeAccessTokenResult {
  accessToken: string;
  shopId: number;
  organizationId: string;
  integrationId: string;
}

async function refreshShopeeToken(
  integrations: MarketplaceIntegrationsPort,
  appCredentials: AppCredentialsPort,
  integrationId: string,
  shopId: number,
  refreshTokenPlain: string,
  encKeyB64: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const appRow = await appCredentials.getByName(SHOPEE_MARKETPLACE_NAME);
  if (!appRow) return null;

  const partnerId = appRow.client_id.trim();
  const partnerKey = appRow.client_secret.trim();
  if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${partnerId}${REFRESH_PATH}${timestamp}`;
  const sign = await hmacSha256Hex(partnerKey, baseString);

  try {
    const url = `${SHOPEE_HOST}${REFRESH_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shop_id: shopId,
        refresh_token: refreshTokenPlain,
        partner_id: Number(partnerId),
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.access_token) return null;

    const newAccess = String(json.access_token);
    const newRefresh = String(json.refresh_token ?? refreshTokenPlain);
    const aesKey = await importAesGcmKey(encKeyB64);
    const accEnc = await aesGcmEncryptToString(aesKey, newAccess);
    const refEnc = await aesGcmEncryptToString(aesKey, newRefresh);
    const expiresAtIso = new Date(
      Date.now() + (Number(json.expire_in) || 14400) * 1000,
    ).toISOString();

    await integrations.updateTokens(integrationId, {
      access_token: accEnc,
      refresh_token: refEnc,
      expires_in: expiresAtIso,
    });

    return { accessToken: newAccess, refreshToken: newRefresh };
  } catch (_) {
    return null;
  }
}

/**
 * Returns a valid Shopee access token for the given integration; refreshes via Shopee API if needed.
 * @throws if integration not found, shop ID missing, or token cannot be obtained
 */
export async function getShopeeAccessToken(
  integrations: MarketplaceIntegrationsPort,
  appCredentials: AppCredentialsPort,
  integrationId: string,
  encKeyB64: string,
): Promise<GetShopeeAccessTokenResult> {
  const row = await integrations.getIntegration(integrationId, {
    marketplaceName: SHOPEE_MARKETPLACE_NAME,
  });

  const aesKey = await importAesGcmKey(encKeyB64);
  let accessToken = await tryDecryptToken(aesKey, String(row.access_token ?? ""));
  let refreshTokenPlain = await tryDecryptToken(aesKey, String(row.refresh_token ?? ""));

  const cfg = (getField(row, "config") as Record<string, unknown> | null) ?? {};
  const shopId =
    typeof cfg?.shopee_shop_id === "number"
      ? cfg.shopee_shop_id
      : Number(getField(row, "shopee_shop_id") ?? row.meli_user_id ?? 0);
  if (!Number.isFinite(shopId) || shopId <= 0) {
    throw new Error("Shop ID not found for integration");
  }

  if (!accessToken && refreshTokenPlain) {
    const refreshed = await refreshShopeeToken(
      integrations,
      appCredentials,
      integrationId,
      Number(shopId),
      refreshTokenPlain,
      encKeyB64,
    );
    if (refreshed) accessToken = refreshed.accessToken;
  }

  if (!accessToken) throw new Error("Failed to obtain Shopee access token");

  return {
    accessToken,
    shopId,
    organizationId: String(row.organizations_id),
    integrationId: String(row.id),
  };
}
