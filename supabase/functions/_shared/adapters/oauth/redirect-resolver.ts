import type { SupabaseClient } from "../infra/supabase-client.ts";
import {
  normalizeShopeeRedirectUri,
  SHOPEE_REDIRECT_CANONICAL,
} from "./shopee-oauth-config.ts";

export function getDefaultOAuthRedirectUri(
  supabaseUrl: string,
  providerKey: string,
): string {
  if (providerKey === "mercado_livre") {
    return "https://novuraerp.com.br/oauth/mercado-livre/callback";
  }
  if (providerKey === "shopee") {
    const envRedirect = Deno.env.get("SHOPEE_REDIRECT_URI")?.trim();
    if (envRedirect) return envRedirect;
    return SHOPEE_REDIRECT_CANONICAL;
  }
  return `${supabaseUrl}/functions/v1/oauth-callback`;
}

export async function resolveRedirectUriForApp(
  admin: SupabaseClient,
  params: {
    providerKey: string;
    appId?: string | null;
    requested?: string | null;
    supabaseUrl?: string;
  },
): Promise<string> {
  const supabaseUrl = params.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "";
  const fromEnv = params.providerKey === "shopee"
    ? normalizeShopeeRedirectUri(Deno.env.get("SHOPEE_REDIRECT_URI"))
    : null;
  if (fromEnv) return fromEnv;

  const fromRequest = normalizeShopeeRedirectUri(params.requested);
  if (fromRequest && params.providerKey === "shopee") return fromRequest;

  if (params.appId) {
    const { data: appRow } = await admin
      .from("apps")
      .select("config")
      .eq("id", params.appId)
      .maybeSingle();
    const cfg = (appRow?.config ?? {}) as Record<string, unknown>;
    const fromConfig = normalizeShopeeRedirectUri(
      typeof cfg.redirect_uri === "string" ? cfg.redirect_uri : null,
    );
    if (fromConfig) return fromConfig;
  }

  if (params.providerKey === "shopee") {
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
      // fall through
    }
  }

  if (params.requested?.trim()) {
    return params.requested.trim();
  }

  return getDefaultOAuthRedirectUri(supabaseUrl, params.providerKey);
}
