// Mercado Livre OAuth2 provider adapter (PKCE + S256).
// Encapsulates the logic previously spread across:
//   mercado-livre-start-auth/index.ts
//   mercado-livre-callback/index.ts
//   mercado-livre-refresh/index.ts

import type {
  AuthorizationResult,
  NormalizedTokenSet,
  OAuthContext,
  OAuthProviderAdapter,
  ProviderCreds,
} from "../../../domain/oauth/oauth-provider.types.ts";
import type { IntegrationRow } from "../../../domain/integration-types.ts";
import { aesGcmDecryptFromString } from "../../infra/token-utils.ts";
import { importAesGcmKey } from "../../infra/token-utils.ts";
import { createSignedState } from "../state-utils.ts";

const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";

// -------------------------------------------------------------------------
// PKCE helpers
// -------------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  // @ts-ignore — Deno supports spread of Uint8Array
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256B64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateCodeVerifier(length = 64): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const rnd = new Uint8Array(length);
  crypto.getRandomValues(rnd);
  return Array.from(rnd, (b) => chars[b % chars.length]).join("");
}

// -------------------------------------------------------------------------
// Adapter implementation
// -------------------------------------------------------------------------

export const mercadoLivreAdapter: OAuthProviderAdapter = {
  key: "mercado_livre",

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
    const state = method === "GET"
      ? url.searchParams.get("state")
      : body?.state ?? null;
    const errorParam = method === "GET"
      ? url.searchParams.get("error")
      : body?.error ?? null;

    if (errorParam) throw new Error(`marketplace_error:${errorParam}`);
    if (!code || !state) throw new Error("missing_code_or_state");

    const extras: Record<string, string> = {};
    const pkceVerifier = method === "GET"
      ? url.searchParams.get("code_verifier")
      : body?.code_verifier ?? null;
    if (pkceVerifier) extras["code_verifier"] = pkceVerifier;

    return { code, state, extras };
  },

  async buildAuthorizationUrl(ctx: OAuthContext, creds: ProviderCreds) {
    const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
    const state = await createSignedState(ctx, encKey);

    const codeVerifier = generateCodeVerifier(64);
    const codeChallenge = await sha256B64Url(codeVerifier);

    const base = new URL(ML_AUTH_URL);
    base.searchParams.set("client_id", creds.clientId);
    base.searchParams.set("response_type", "code");
    base.searchParams.set("state", state);
    base.searchParams.set("code_challenge", codeChallenge);
    base.searchParams.set("code_challenge_method", "S256");
    if (ctx.redirectUri) base.searchParams.set("redirect_uri", ctx.redirectUri);

    const result: AuthorizationResult = {
      authorizationUrl: base.toString(),
      state,
      codeVerifier,
    };
    return result;
  },

  async exchangeCode(ctx, code, codeVerifier, creds) {
    const form = new URLSearchParams();
    form.append("grant_type", "authorization_code");
    form.append("client_id", creds.clientId);
    form.append("client_secret", creds.clientSecret);
    form.append("code", code);
    if (ctx.redirectUri) form.append("redirect_uri", ctx.redirectUri);
    if (codeVerifier) form.append("code_verifier", codeVerifier);

    const resp = await fetch(ML_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const json = await resp.json();
    if (!resp.ok) {
      throw new Error(
        json?.error_description ?? json?.error ?? "ml_token_exchange_failed",
      );
    }

    return {
      accessToken: String(json.access_token),
      refreshToken: json.refresh_token ? String(json.refresh_token) : null,
      expiresInSeconds: Number(json.expires_in) || 21600,
      externalAccountId: String(json.user_id),
      extra: { meli_user_id: json.user_id },
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

    const resp = await fetch(ML_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const json = await resp.json();
    if (!resp.ok) {
      throw new Error(
        json?.error_description ?? json?.error ?? "ml_refresh_failed",
      );
    }

    return {
      accessToken: String(json.access_token),
      refreshToken: json.refresh_token ? String(json.refresh_token) : refreshPlain,
      expiresInSeconds: Number(json.expires_in) || 21600,
      externalAccountId: String(json.user_id ?? row.meli_user_id ?? ""),
      extra: { meli_user_id: json.user_id },
    } satisfies NormalizedTokenSet;
  },

  buildPostMessagePayload(result, integrationId) {
    return {
      providerKey: "mercado_livre",
      integrationId,
      externalAccountId: result.externalAccountId,
      ok: true,
    };
  },
};
