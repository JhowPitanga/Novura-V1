// Template for a new marketplace OAuth provider adapter.
// Copy this file to providers/<key>.ts and implement all methods.
// Then register the adapter in registry.ts.

import type {
  AuthorizationResult,
  NormalizedTokenSet,
  OAuthContext,
  OAuthProviderAdapter,
  ProviderCreds,
} from "../../../domain/oauth/oauth-provider.types.ts";
import type { IntegrationRow } from "../../../domain/integration-types.ts";
import { aesGcmDecryptFromString, importAesGcmKey } from "../../infra/token-utils.ts";
import { createSignedState } from "../state-utils.ts";

// Replace 'my_marketplace' with the marketplace_providers.key value (snake_case).
const PROVIDER_KEY = "my_marketplace";

const AUTH_URL = "https://partner.example.com/oauth/authorize";
const TOKEN_URL = "https://partner.example.com/oauth/token";

export const myMarketplaceAdapter: OAuthProviderAdapter = {
  key: PROVIDER_KEY,

  async parseCallbackRequest(req: Request) {
    const url = new URL(req.url);
    // deno-lint-ignore no-explicit-any
    let body: any = null;
    if (req.method !== "GET") {
      try { body = await req.json(); } catch { body = null; }
    }

    const code = req.method === "GET" ? url.searchParams.get("code") : body?.code;
    const state = req.method === "GET" ? url.searchParams.get("state") : body?.state;
    const error = req.method === "GET" ? url.searchParams.get("error") : body?.error;

    if (error) throw new Error(`marketplace_error:${error}`);
    if (!code || !state) throw new Error("missing_code_or_state");

    // Add any marketplace-specific extras (e.g. shop_id for Shopee)
    const extras: Record<string, string> = {};

    return { code, state, extras };
  },

  async buildAuthorizationUrl(ctx: OAuthContext, creds: ProviderCreds) {
    const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
    const state = await createSignedState(ctx, encKey);

    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", creds.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    if (ctx.redirectUri) url.searchParams.set("redirect_uri", ctx.redirectUri);

    const result: AuthorizationResult = {
      authorizationUrl: url.toString(),
      state,
      // codeVerifier: if using PKCE, generate here and include
    };
    return result;
  },

  async exchangeCode(_ctx, code, _codeVerifier, creds, _extras) {
    const form = new URLSearchParams();
    form.append("grant_type", "authorization_code");
    form.append("client_id", creds.clientId);
    form.append("client_secret", creds.clientSecret);
    form.append("code", code);

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const json = await resp.json();
    if (!resp.ok) throw new Error(json?.error ?? "token_exchange_failed");

    return {
      accessToken: String(json.access_token),
      refreshToken: json.refresh_token ? String(json.refresh_token) : null,
      expiresInSeconds: Number(json.expires_in) || 3600,
      // Replace with the actual seller/shop identifier returned by the marketplace
      externalAccountId: String(json.seller_id ?? json.account_id ?? ""),
      extra: {},
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

    const form = new URLSearchParams();
    form.append("grant_type", "refresh_token");
    form.append("client_id", creds.clientId);
    form.append("client_secret", creds.clientSecret);
    form.append("refresh_token", refreshPlain);

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const json = await resp.json();
    if (!resp.ok) throw new Error(json?.error ?? "refresh_failed");

    return {
      accessToken: String(json.access_token),
      refreshToken: json.refresh_token ? String(json.refresh_token) : refreshPlain,
      expiresInSeconds: Number(json.expires_in) || 3600,
      externalAccountId: row.external_account_id ?? "",
      extra: {},
    } satisfies NormalizedTokenSet;
  },

  buildPostMessagePayload(result, integrationId) {
    return {
      providerKey: PROVIDER_KEY,
      integrationId,
      externalAccountId: result.externalAccountId,
      ok: true,
    };
  },
};
