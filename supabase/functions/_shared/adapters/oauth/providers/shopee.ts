// Shopee OAuth2 provider adapter (HMAC-SHA256 signed requests).
// Encapsulates the logic previously spread across:
//   shopee-start-auth/index.ts
//   shopee-callback/index.ts
//   shopee-refresh/index.ts

import type {
  AuthorizationResult,
  NormalizedTokenSet,
  OAuthContext,
  OAuthProviderAdapter,
  ProviderCreds,
} from "../../../domain/oauth/oauth-provider.types.ts";
import type { IntegrationRow } from "../../../domain/integration-types.ts";
import { aesGcmDecryptFromString, hmacSha256Hex, importAesGcmKey } from "../../infra/token-utils.ts";
import { createSignedState } from "../state-utils.ts";

const SHOPEE_AUTH_HOST = "https://partner.shopeemobile.com";
const SHOPEE_AUTH_PATH = "/api/v2/shop/auth_partner";
const SHOPEE_TOKEN_HOST = "https://openplatform.shopee.com.br";
const SHOPEE_TOKEN_PATH = "/api/v2/auth/token/get";
const SHOPEE_REFRESH_PATH = "/api/v2/auth/access_token";

// -------------------------------------------------------------------------
// HMAC signing helper
// -------------------------------------------------------------------------

async function shopeeSign(
  partnerId: string,
  path: string,
  timestamp: number,
  partnerKey: string,
  body?: string,
): Promise<string> {
  // Shopee V2 base string: partner_id + path + timestamp [+ body for POST]
  const baseString = body !== undefined
    ? `${partnerId}${path}${timestamp}${body}`
    : `${partnerId}${path}${timestamp}`;
  return hmacSha256Hex(partnerKey, baseString);
}

// -------------------------------------------------------------------------
// Adapter implementation
// -------------------------------------------------------------------------

export const shopeeAdapter: OAuthProviderAdapter = {
  key: "shopee",

  async parseCallbackRequest(req: Request) {
    const url = new URL(req.url);
    const method = req.method;
    // deno-lint-ignore no-explicit-any
    let body: any = null;
    if (method !== "GET") {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    const code = method === "GET"
      ? url.searchParams.get("code")
      : body?.code ?? null;
    const shopId = method === "GET"
      ? url.searchParams.get("shop_id")
      : body?.shop_id ?? null;
    const state = method === "GET"
      ? url.searchParams.get("state")
      : body?.state ?? null;
    const errorParam = method === "GET"
      ? url.searchParams.get("error")
      : body?.error ?? null;

    if (errorParam) throw new Error(`marketplace_error:${errorParam}`);
    if (!code || !shopId) throw new Error("missing_code_or_shop_id");
    if (!state) throw new Error("missing_state");

    return {
      code,
      state,
      extras: { shop_id: shopId },
    };
  },

  async buildAuthorizationUrl(ctx: OAuthContext, creds: ProviderCreds) {
    const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
    const state = await createSignedState(ctx, encKey);

    const partnerId = String(creds.clientId).trim();
    const partnerKey = String(creds.clientSecret).trim();
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = await shopeeSign(partnerId, SHOPEE_AUTH_PATH, timestamp, partnerKey);

    // Embed state in the redirect_uri so Shopee forwards it back
    let redirectWithState = ctx.redirectUri;
    try {
      const r = new URL(ctx.redirectUri);
      r.searchParams.set("state", state);
      redirectWithState = r.toString();
    } catch {
      // Keep original if URL parse fails
    }

    const authUrl = new URL(`${SHOPEE_AUTH_HOST}${SHOPEE_AUTH_PATH}`);
    authUrl.searchParams.set("partner_id", partnerId);
    authUrl.searchParams.set("timestamp", String(timestamp));
    authUrl.searchParams.set("sign", sign);
    authUrl.searchParams.set("redirect", redirectWithState);

    const result: AuthorizationResult = {
      authorizationUrl: authUrl.toString(),
      state,
      // No PKCE for Shopee
    };
    return result;
  },

  async exchangeCode(_ctx, code, _codeVerifier, creds, extras) {
    const shopId = extras["shop_id"];
    if (!shopId) throw new Error("missing_shop_id_in_extras");

    const partnerId = String(creds.clientId).trim();
    const partnerKey = String(creds.clientSecret).trim();
    const shopIdNum = Number(shopId);
    const partnerIdNum = Number(partnerId);
    const timestamp = Math.floor(Date.now() / 1000);

    const bodyData = { code, shop_id: shopIdNum, partner_id: partnerIdNum };
    const bodyJson = JSON.stringify(bodyData);
    const sign = await shopeeSign(partnerId, SHOPEE_TOKEN_PATH, timestamp, partnerKey, bodyJson);

    const tokenUrl = `${SHOPEE_TOKEN_HOST}${SHOPEE_TOKEN_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;

    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bodyJson,
    });

    const json = await resp.json();
    if (!resp.ok || json?.error) {
      throw new Error(String(json?.message ?? json?.error ?? "shopee_token_exchange_failed"));
    }

    const accessToken = String(json.access_token ?? "").trim();
    const refreshToken = String(json.refresh_token ?? "").trim();
    const ttl = Number(json.expire_in ?? json.expires_in ?? 14400);

    return {
      accessToken,
      refreshToken: refreshToken || null,
      expiresInSeconds: Number.isFinite(ttl) ? ttl : 14400,
      externalAccountId: String(shopId),
      extra: { shopee_shop_id: String(shopId) },
    } satisfies NormalizedTokenSet;
  },

  async refreshTokens(row: IntegrationRow, creds: ProviderCreds) {
    const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
    if (!row.refresh_token) throw new Error("missing_refresh_token");

    let refreshPlain = String(row.refresh_token);
    if (refreshPlain.startsWith("enc:gcm:")) {
      const aesKey = await importAesGcmKey(encKey);
      refreshPlain = await aesGcmDecryptFromString(aesKey, refreshPlain);
    }

    // Resolve shop_id from config or meli_user_id (Shopee reuses same column)
    // deno-lint-ignore no-explicit-any
    const cfg = (row as any)?.config as Record<string, unknown> | null;
    const shopId = String(
      cfg?.shopee_shop_id ?? cfg?.shop_id ?? (row as any)?.meli_user_id ?? "",
    );
    if (!shopId) throw new Error("missing_shop_id");

    const partnerId = String(creds.clientId).trim();
    const partnerKey = String(creds.clientSecret).trim();
    const shopIdNum = Number(shopId);
    const partnerIdNum = Number(partnerId);
    const timestamp = Math.floor(Date.now() / 1000);

    const bodyData = { shop_id: shopIdNum, partner_id: partnerIdNum, refresh_token: refreshPlain };
    const bodyJson = JSON.stringify(bodyData);
    const sign = await shopeeSign(partnerId, SHOPEE_REFRESH_PATH, timestamp, partnerKey, bodyJson);

    const refreshUrl = `${SHOPEE_TOKEN_HOST}${SHOPEE_REFRESH_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;

    const resp = await fetch(refreshUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bodyJson,
    });

    const json = await resp.json();
    if (!resp.ok || !json?.access_token) {
      throw new Error(String(json?.message ?? json?.error ?? "shopee_refresh_failed"));
    }

    const newRefresh = String(json.refresh_token ?? refreshPlain);
    const ttl = Number(json.expire_in ?? 14400);

    return {
      accessToken: String(json.access_token),
      refreshToken: newRefresh,
      expiresInSeconds: Number.isFinite(ttl) ? ttl : 14400,
      externalAccountId: String(shopId),
      extra: { shopee_shop_id: String(shopId) },
    } satisfies NormalizedTokenSet;
  },

  buildPostMessagePayload(result, integrationId) {
    return {
      providerKey: "shopee",
      integrationId,
      externalAccountId: result.externalAccountId,
      ok: true,
    };
  },
};
