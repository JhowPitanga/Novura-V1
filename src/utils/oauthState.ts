/** Decode OAuth state (unsigned read) to recover openerOrigin / appId for postMessage routing. */
export function parseOAuthStatePayload(state: string): {
  openerOrigin?: string;
  appId?: string;
  providerKey?: string;
} | null {
  const raw = String(state || "").trim();
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = atob(padded + "=".repeat(padLen));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      openerOrigin:
        typeof parsed.openerOrigin === "string" ? parsed.openerOrigin : undefined,
      appId: typeof parsed.appId === "string" ? parsed.appId : undefined,
      providerKey: typeof parsed.providerKey === "string" ? parsed.providerKey : undefined,
    };
  } catch {
    return null;
  }
}

/** Origins allowed to post oauth_success back to the Novura app opener. */
export const OAUTH_CALLBACK_ORIGINS = [
  "https://novuraerp.com.br",
  "https://www.novuraerp.com.br",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
] as const;

export function isAllowedOAuthMessageOrigin(origin: string): boolean {
  if (!origin) return false;
  if (typeof window !== "undefined" && origin === window.location.origin) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === "https:" && (hostname === "novuraerp.com.br" || hostname.endsWith(".novuraerp.com.br"))) {
      return true;
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  } catch {
    // fall through
  }
  return OAUTH_CALLBACK_ORIGINS.some((allowed) => origin === allowed);
}

export const OAUTH_PENDING_FLOW_KEY = "novura:oauth_pending_flow";

export interface OAuthPendingFlow {
  organizationId: string;
  appId: string;
  providerKey: string;
  storeName: string;
  startedAt: number;
}

export function saveOAuthPendingFlow(flow: OAuthPendingFlow): void {
  try {
    sessionStorage.setItem(OAUTH_PENDING_FLOW_KEY, JSON.stringify(flow));
  } catch {
    // sessionStorage unavailable
  }
}

export function readOAuthPendingFlow(): OAuthPendingFlow | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_PENDING_FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OAuthPendingFlow;
    if (!parsed?.organizationId || !parsed?.providerKey || !parsed?.storeName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearOAuthPendingFlow(): void {
  try {
    sessionStorage.removeItem(OAUTH_PENDING_FLOW_KEY);
  } catch {
    // ignore
  }
}
