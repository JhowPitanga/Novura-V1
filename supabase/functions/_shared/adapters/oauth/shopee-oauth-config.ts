import type { SupabaseClient } from "../infra/supabase-client.ts";

export const SHOPEE_AUTH_HOST_PROD =
  (Deno.env.get("SHOPEE_AUTH_HOST") || "https://openplatform.shopee.com.br").replace(/\/+$/, "");
export const SHOPEE_TOKEN_HOST_PROD =
  (Deno.env.get("SHOPEE_TOKEN_HOST") || "https://openplatform.shopee.com.br").replace(/\/+$/, "");

export const SHOPEE_AUTH_PATH = "/api/v2/shop/auth_partner";
export const SHOPEE_TOKEN_PATH = "/api/v2/auth/token/get";
export const SHOPEE_REFRESH_PATH = "/api/v2/auth/access_token";

/** Sandbox auth uses web redirect; API calls use openplatform sandbox host */
export const SHOPEE_SANDBOX_AUTH_HOST = "https://open.sandbox.test-stable.shopee.com";
export const SHOPEE_SANDBOX_TOKEN_HOST = "https://openplatform.sandbox.test-stable.shopee.sg";

export const SHOPEE_REDIRECT_CANONICAL = "https://novuraerp.com.br/oauth/shopee/callback";

export interface ShopeeOAuthHosts {
  authHost: string;
  tokenHost: string;
  authPath: string;
  useSandboxWebAuth: boolean;
}

export function resolveShopeeOAuthHosts(
  appConfig?: Record<string, unknown> | null,
): ShopeeOAuthHosts {
  const cfg = appConfig ?? {};
  const environment = String(cfg.environment ?? "production").toLowerCase();
  const isSandbox = environment === "sandbox";

  const authHost = String(
    cfg.auth_host ?? (isSandbox ? SHOPEE_SANDBOX_AUTH_HOST : SHOPEE_AUTH_HOST_PROD),
  ).replace(/\/+$/, "");
  const tokenHost = String(
    cfg.token_host ?? (isSandbox ? SHOPEE_SANDBOX_TOKEN_HOST : SHOPEE_TOKEN_HOST_PROD),
  ).replace(/\/+$/, "");

  return {
    authHost,
    tokenHost,
    authPath: isSandbox ? "/auth" : SHOPEE_AUTH_PATH,
    useSandboxWebAuth: isSandbox,
  };
}

/** Strip www — Shopee Partner Console domain must match exactly (usually apex). */
export function normalizeShopeeRedirectUri(raw?: string | null): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace("://www.", "://");
  }
}

export async function resolveShopeeRedirectUri(
  admin: SupabaseClient,
  requested?: string | null,
  appId?: string | null,
): Promise<string> {
  const fromEnv = normalizeShopeeRedirectUri(Deno.env.get("SHOPEE_REDIRECT_URI"));
  if (fromEnv) return fromEnv;

  const fromRequest = normalizeShopeeRedirectUri(requested);
  if (fromRequest) return fromRequest;

  const lookupId = appId ?? null;
  const lookupName = lookupId ? null : "Shopee";

  try {
    const query = admin.from("apps").select("config");
    const { data: appRow } = lookupId
      ? await query.eq("id", lookupId).maybeSingle()
      : await query.eq("name", lookupName!).maybeSingle();

    const cfg = (appRow?.config ?? {}) as Record<string, unknown>;
    const fromConfig = normalizeShopeeRedirectUri(
      typeof cfg.redirect_uri === "string" ? cfg.redirect_uri : null,
    );
    if (fromConfig) return fromConfig;
  } catch {
    // fall through to canonical default
  }

  return SHOPEE_REDIRECT_CANONICAL;
}

export function appendStateToRedirect(redirectUri: string, state: string): string {
  try {
    const url = new URL(redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  } catch {
    const join = redirectUri.includes("?") ? "&" : "?";
    return `${redirectUri}${join}state=${encodeURIComponent(state)}`;
  }
}

/** Returns partner key as stored in apps.client_secret (trimmed). */
export function normalizeShopeePartnerKey(partnerKey: string): string {
  return String(partnerKey || "").trim();
}

export function buildShopeeSandboxAuthUrl(params: {
  partnerId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`${SHOPEE_SANDBOX_AUTH_HOST}/auth`);
  url.searchParams.set("auth_type", "seller");
  url.searchParams.set("partner_id", params.partnerId);
  url.searchParams.set("redirect_uri", appendStateToRedirect(params.redirectUri, params.state));
  url.searchParams.set("response_type", "code");
  return url.toString();
}
