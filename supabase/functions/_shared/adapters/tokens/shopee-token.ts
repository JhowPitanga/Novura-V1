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

function logShopeeToken(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    scope: "shopee-token",
    marketplace: "shopee",
    event,
    ...data,
  }));
}

function logShopeeTokenWarn(event: string, data: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({
    scope: "shopee-token",
    marketplace: "shopee",
    level: "warn",
    event,
    ...data,
  }));
}

function logShopeeTokenError(event: string, error: unknown, data: Record<string, unknown> = {}): void {
  const err = error as any;
  console.error(JSON.stringify({
    scope: "shopee-token",
    marketplace: "shopee",
    level: "error",
    event,
    message: err?.message ?? String(error),
    name: err?.name ?? null,
    code: err?.code ?? null,
    details: err?.details ?? null,
    ...data,
  }));
}

async function tokenFingerprint(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function expiryDiagnostics(row: { expires_in?: string | null; expires_at?: string | null }): Record<string, unknown> {
  const now = Date.now();
  const candidates = [row.expires_in, row.expires_at]
    .filter((value) => value != null && String(value).trim() !== "")
    .map((value) => String(value).trim());
  const parsed = candidates
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .find((entry) => Number.isFinite(entry.timestamp));

  return {
    expiresIn: row.expires_in ?? null,
    expiresAt: row.expires_at ?? null,
    parsedExpiry: parsed ? new Date(parsed.timestamp).toISOString() : null,
    expiresInMs: parsed ? parsed.timestamp - now : null,
  };
}

function accessTokenExpired(row: { expires_in?: string | null; expires_at?: string | null }): boolean {
  const diagnostics = expiryDiagnostics(row);
  const expiresInMs = diagnostics.expiresInMs;
  return typeof expiresInMs === "number" && expiresInMs <= 0;
}

/** Shopee refresh stores next expiry as ISO in `expires_in`; some rows use `expires_at`. */
function shopeeAccessTokenExpiresSoon(
  row: { expires_in?: string | null; expires_at?: string | null },
  skewMs: number,
): boolean {
  const now = Date.now();
  for (const raw of [row.expires_in, row.expires_at]) {
    if (raw == null || String(raw).trim() === "") continue;
    const s = String(raw).trim();
    const iso = Date.parse(s);
    if (Number.isFinite(iso) && iso <= now + skewMs) return true;
  }
  return false;
}

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
  if (!appRow) {
    logShopeeTokenWarn("refresh_missing_app_credentials", { integrationId, shopId });
    return null;
  }

  const partnerId = appRow.client_id.trim();
  const partnerKey = appRow.client_secret.trim();
  if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) {
    logShopeeTokenWarn("refresh_invalid_app_credentials", {
      integrationId,
      shopId,
      hasPartnerId: Boolean(partnerId),
      hasPartnerKey: Boolean(partnerKey),
      partnerIdIsNumeric: /^\d+$/.test(partnerId),
    });
    return null;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const bodyJson = JSON.stringify({
    shop_id: shopId,
    partner_id: Number(partnerId),
    refresh_token: refreshTokenPlain,
  });
  const baseString = `${partnerId}${REFRESH_PATH}${timestamp}`;
  const sign = await hmacSha256Hex(partnerKey, baseString);

  try {
    const url = `${SHOPEE_HOST}${REFRESH_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
    const startedAt = Date.now();
    logShopeeToken("refresh_request_started", {
      integrationId,
      shopId,
      partnerId,
      refreshTokenFingerprint: await tokenFingerprint(refreshTokenPlain),
      refreshTokenLength: refreshTokenPlain.length,
    });
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bodyJson,
    });
    const json = await resp.json().catch(() => ({}));
    logShopeeToken("refresh_response_received", {
      integrationId,
      shopId,
      partnerId,
      status: resp.status,
      ok: resp.ok,
      elapsedMs: Date.now() - startedAt,
      shopeeError: json?.error ?? null,
      shopeeMessage: json?.message ?? null,
      shopeeRequestId: json?.request_id ?? null,
      hasAccessToken: Boolean(json?.access_token),
      hasRefreshToken: Boolean(json?.refresh_token),
      expireIn: json?.expire_in ?? null,
      responseKeys: Object.keys(json ?? {}),
    });
    if (!resp.ok || !json?.access_token) {
      logShopeeTokenWarn("refresh_response_rejected", {
        integrationId,
        shopId,
        partnerId,
        status: resp.status,
        shopeeError: json?.error ?? null,
        shopeeMessage: json?.message ?? null,
        shopeeRequestId: json?.request_id ?? null,
        hasAccessToken: Boolean(json?.access_token),
      });
      return null;
    }

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

    logShopeeToken("refresh_tokens_persisted", {
      integrationId,
      shopId,
      partnerId,
      accessTokenFingerprint: await tokenFingerprint(newAccess),
      refreshTokenFingerprint: await tokenFingerprint(newRefresh),
      accessTokenLength: newAccess.length,
      refreshTokenLength: newRefresh.length,
      expiresAtIso,
      refreshTokenChanged: newRefresh !== refreshTokenPlain,
    });

    return { accessToken: newAccess, refreshToken: newRefresh };
  } catch (e) {
    logShopeeTokenError("refresh_failed", e, {
      integrationId,
      shopId,
      partnerId,
    });
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
  options?: { forceRefresh?: boolean },
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
    logShopeeTokenWarn("resolution_invalid_shop_id", {
      integrationId,
      rawMeliUserId: row.meli_user_id ?? null,
      configShopId: cfg?.shopee_shop_id ?? null,
    });
    throw new Error("Shop ID not found for integration");
  }

  const shouldForceRefresh = options?.forceRefresh === true;
  const expiresSoon = shopeeAccessTokenExpiresSoon(row, 120_000);
  const expired = accessTokenExpired(row);

  logShopeeToken("resolution_loaded", {
    integrationId,
    shopId: Number(shopId),
    organizationId: row.organizations_id ?? null,
    shouldForceRefresh,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshTokenPlain),
    accessTokenFingerprint: await tokenFingerprint(accessToken),
    refreshTokenFingerprint: await tokenFingerprint(refreshTokenPlain),
    accessTokenLength: accessToken?.length ?? 0,
    refreshTokenLength: refreshTokenPlain?.length ?? 0,
    expiresSoon,
    expired,
    ...expiryDiagnostics(row),
  });

  // Proactive refresh: Shopee access tokens are short-lived (~4h). DB may still hold a non-empty but expired token.
  if (
    !shouldForceRefresh &&
    accessToken &&
    refreshTokenPlain &&
    expiresSoon
  ) {
    logShopeeToken("proactive_refresh_started", {
      integrationId,
      shopId: Number(shopId),
      accessTokenFingerprint: await tokenFingerprint(accessToken),
    });
    const refreshed = await refreshShopeeToken(
      integrations,
      appCredentials,
      integrationId,
      Number(shopId),
      refreshTokenPlain,
      encKeyB64,
    );
    if (refreshed) {
      accessToken = refreshed.accessToken;
      refreshTokenPlain = refreshed.refreshToken;
      logShopeeToken("proactive_refresh_succeeded", {
        integrationId,
        shopId: Number(shopId),
        accessTokenFingerprint: await tokenFingerprint(accessToken),
      });
    } else {
      logShopeeTokenWarn("proactive_refresh_returned_null", {
        integrationId,
        shopId: Number(shopId),
        expired,
      });
      if (expired) {
        throw new Error("Failed to refresh expired Shopee access token");
      }
    }
  }

  if (shouldForceRefresh && refreshTokenPlain) {
    logShopeeToken("forced_refresh_started", {
      integrationId,
      shopId: Number(shopId),
      currentAccessTokenFingerprint: await tokenFingerprint(accessToken),
    });
    const refreshed = await refreshShopeeToken(
      integrations,
      appCredentials,
      integrationId,
      Number(shopId),
      refreshTokenPlain,
      encKeyB64,
    );
    if (refreshed) {
      accessToken = refreshed.accessToken;
      refreshTokenPlain = refreshed.refreshToken;
      logShopeeToken("forced_refresh_succeeded", {
        integrationId,
        shopId: Number(shopId),
        accessTokenFingerprint: await tokenFingerprint(accessToken),
        refreshTokenFingerprint: await tokenFingerprint(refreshTokenPlain),
      });
    } else {
      logShopeeTokenError("forced_refresh_failed", new Error("Failed to refresh Shopee access token"), {
        integrationId,
        shopId: Number(shopId),
      });
      throw new Error("Failed to refresh Shopee access token");
    }
  }

  if (!accessToken && refreshTokenPlain) {
    logShopeeToken("missing_access_refresh_started", {
      integrationId,
      shopId: Number(shopId),
    });
    const refreshed = await refreshShopeeToken(
      integrations,
      appCredentials,
      integrationId,
      Number(shopId),
      refreshTokenPlain,
      encKeyB64,
    );
    if (refreshed) {
      accessToken = refreshed.accessToken;
      logShopeeToken("missing_access_refresh_succeeded", {
        integrationId,
        shopId: Number(shopId),
        accessTokenFingerprint: await tokenFingerprint(accessToken),
      });
    }
  }

  if (!accessToken) {
    logShopeeTokenError("resolution_failed_no_access_token", new Error("Failed to obtain Shopee access token"), {
      integrationId,
      shopId: Number(shopId),
      hasRefreshToken: Boolean(refreshTokenPlain),
    });
    throw new Error("Failed to obtain Shopee access token");
  }

  logShopeeToken("resolution_finished", {
    integrationId,
    shopId: Number(shopId),
    accessTokenFingerprint: await tokenFingerprint(accessToken),
    accessTokenLength: accessToken.length,
  });

  return {
    accessToken,
    shopId,
    organizationId: String(row.organizations_id),
    integrationId: String(row.id),
  };
}
