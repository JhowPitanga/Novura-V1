const SHOPEE_CALLBACK_PATH = "/oauth/shopee/callback";

/** Registered in Shopee Partner Console (apex domain, no www). */
export const SHOPEE_REDIRECT_CANONICAL = "https://novuraerp.com.br/oauth/shopee/callback";

/**
 * Shopee validates redirect domain against Partner Console.
 * Console is registered on apex (novuraerp.com.br) — strip www when building from window.
 */
export function normalizeOAuthOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
    }
    return url.origin;
  } catch {
    return origin.replace("://www.", "://");
  }
}

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

export function resolveShopeeRedirectUri(envOverride?: string | null): string {
  const normalizedEnv = normalizeShopeeRedirectUri(envOverride);
  if (normalizedEnv) return normalizedEnv;

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = normalizeOAuthOrigin(window.location.origin);
    return `${origin}/oauth/shopee/callback`;
  }

  return SHOPEE_REDIRECT_CANONICAL;
}

export function resolveOAuthRedirectUri(
  providerKey: string,
  envOverride?: string | null,
): string | undefined {
  if (envOverride?.trim()) {
    if (providerKey === "shopee") {
      return normalizeShopeeRedirectUri(envOverride) ?? envOverride.trim();
    }
    return envOverride.trim();
  }

  if (providerKey === "shopee") {
    return resolveShopeeRedirectUri();
  }

  if (providerKey === "mercado_livre") {
    return "https://novuraerp.com.br/oauth/mercado-livre/callback";
  }

  return undefined;
}
