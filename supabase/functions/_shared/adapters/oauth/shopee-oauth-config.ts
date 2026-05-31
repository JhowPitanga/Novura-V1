import type { SupabaseClient } from "../infra/supabase-client.ts";

export const SHOPEE_AUTH_HOST =
  (Deno.env.get("SHOPEE_AUTH_HOST") || "https://openplatform.shopee.com.br").replace(/\/+$/, "");
export const SHOPEE_AUTH_PATH = "/api/v2/shop/auth_partner";
export const SHOPEE_TOKEN_HOST =
  (Deno.env.get("SHOPEE_TOKEN_HOST") || "https://openplatform.shopee.com.br").replace(/\/+$/, "");
export const SHOPEE_TOKEN_PATH = "/api/v2/auth/token/get";
export const SHOPEE_REFRESH_PATH = "/api/v2/auth/access_token";

export const SHOPEE_REDIRECT_CANONICAL = "https://novuraerp.com.br/oauth/shopee/callback";

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
): Promise<string> {
  const fromRequest = normalizeShopeeRedirectUri(requested);
  const fromEnv = normalizeShopeeRedirectUri(Deno.env.get("SHOPEE_REDIRECT_URI"));
  if (fromEnv) return fromEnv;

  if (fromRequest) return fromRequest;

  try {
    const { data: appRow } = await admin
      .from("apps")
      .select("config")
      .eq("name", "Shopee")
      .maybeSingle();
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

/** Shopee partner keys from console may include a shpk prefix — strip for HMAC. */
export function normalizeShopeePartnerKey(partnerKey: string): string {
  const key = String(partnerKey || "").trim();
  return key.toLowerCase().startsWith("shpk") ? key.slice(4) : key;
}
