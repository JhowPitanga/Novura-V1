// Shopee OAuth2 provider adapter (HMAC-SHA256 signed requests).

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
import {
  appendStateToRedirect,
  buildShopeeSandboxAuthUrl,
  normalizeShopeeRedirectUri,
  resolveShopeeOAuthHosts,
  SHOPEE_REFRESH_PATH,
  SHOPEE_TOKEN_PATH,
} from "../shopee-oauth-config.ts";

async function shopeeSign(
  partnerId: string,
  path: string,
  timestamp: number,
  partnerKey: string,
): Promise<string> {
  // Shopee OAuth endpoints sign partner_id + path + timestamp only.
  // Use the full partner key from the console (including shpk prefix when present).
  const baseString = `${partnerId}${path}${timestamp}`;
  const sign = await hmacSha256Hex(String(partnerKey).trim(), baseString);
  return sign.toLowerCase();
}

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
    const hosts = resolveShopeeOAuthHosts(ctx.appConfig);
    const redirectBase = normalizeShopeeRedirectUri(ctx.redirectUri) ?? ctx.redirectUri;

    if (hosts.useSandboxWebAuth) {
      const authorizationUrl = buildShopeeSandboxAuthUrl({
        partnerId: String(creds.clientId).trim(),
        redirectUri: redirectBase,
        state,
      });
      console.log("[shopee-oauth] sandbox_auth_url_built", {
        authHost: hosts.authHost,
        redirectBase,
      });
      return { authorizationUrl, state } satisfies AuthorizationResult;
    }

    const partnerId = String(creds.clientId).trim();
    const partnerKey = String(creds.clientSecret).trim();
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = await shopeeSign(partnerId, hosts.authPath, timestamp, partnerKey);
    const redirectWithState = appendStateToRedirect(redirectBase, state);

    const authUrl = new URL(`${hosts.authHost}${hosts.authPath}`);
    authUrl.searchParams.set("partner_id", partnerId);
    authUrl.searchParams.set("timestamp", String(timestamp));
    authUrl.searchParams.set("sign", sign);
    authUrl.searchParams.set("redirect", redirectWithState);

    console.log("[shopee-oauth] auth_url_built", {
      authHost: hosts.authHost,
      redirectBase,
      redirectWithStatePrefix: redirectWithState.slice(0, 120),
    });

    return {
      authorizationUrl: authUrl.toString(),
      state,
    } satisfies AuthorizationResult;
  },

  async exchangeCode(ctx, code, _codeVerifier, creds, extras) {
    const shopId = extras["shop_id"];
    if (!shopId) throw new Error("missing_shop_id_in_extras");

    const hosts = resolveShopeeOAuthHosts(ctx.appConfig);
    const partnerId = String(creds.clientId).trim();
    const partnerKey = String(creds.clientSecret).trim();
    const shopIdNum = Number(shopId);
    const partnerIdNum = Number(partnerId);
    const timestamp = Math.floor(Date.now() / 1000);

    const bodyData = { code, shop_id: shopIdNum, partner_id: partnerIdNum };
    const bodyJson = JSON.stringify(bodyData);
    const sign = await shopeeSign(partnerId, SHOPEE_TOKEN_PATH, timestamp, partnerKey);

    const tokenUrl = `${hosts.tokenHost}${SHOPEE_TOKEN_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;

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
      extra: {
        shopee_shop_id: String(shopId),
        environment: ctx.appConfig?.environment ?? "production",
      },
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

    // deno-lint-ignore no-explicit-any
    const cfg = (row as any)?.config as Record<string, unknown> | null;
    const hosts = resolveShopeeOAuthHosts(cfg);
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
    const sign = await shopeeSign(partnerId, SHOPEE_REFRESH_PATH, timestamp, partnerKey);

    const refreshUrl = `${hosts.tokenHost}${SHOPEE_REFRESH_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;

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
