// Universal OAuth flow helper for the frontend.
// Replaces the provider-specific startMercadoLivreAuth / startShopeeAuth functions.
// All OAuth flows go through the generic oauth-start-auth Edge Function.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StartOAuthOptions {
  providerKey: string;
  organizationId: string;
  companyId?: string | null;
  storeName: string;
  connectedByUserId?: string | null;
  redirectUri?: string | null;
  correlationId?: string;
}

export interface StartOAuthResult {
  /** URL to open in the popup */
  authorizationUrl: string;
  state: string;
  codeVerifier?: string | null;
}

export type OAuthSuccessPayload = {
  providerKey: string;
  integrationId: string;
  externalAccountId: string;
  ok: boolean;
};

export type OAuthErrorPayload = {
  type: "oauth_error";
  error: string;
  reason: string;
  providerKey: string | null;
};

// ---------------------------------------------------------------------------
// Start OAuth flow (opens popup)
// ---------------------------------------------------------------------------

/**
 * Calls oauth-start-auth and opens the authorization URL in a popup window.
 * Returns a cleanup function that removes the postMessage listener.
 */
export async function startOAuth(
  supabase: SupabaseClient<Database>,
  opts: StartOAuthOptions,
): Promise<StartOAuthResult> {
  const { data, error } = await supabase.functions.invoke("oauth-start-auth", {
    body: {
      providerKey: opts.providerKey,
      organizationId: opts.organizationId,
      companyId: opts.companyId ?? null,
      storeName: opts.storeName,
      connectedByUserId: opts.connectedByUserId ?? null,
      redirectUri: opts.redirectUri ?? undefined,
      correlationId: opts.correlationId ?? crypto.randomUUID(),
    },
  });

  if (error) throw error;

  const d = data as Record<string, unknown>;
  const authorizationUrl = d?.authorization_url as string | undefined;
  const state = d?.state as string | undefined;
  const codeVerifier = d?.code_verifier as string | null | undefined;

  if (!authorizationUrl) {
    throw new Error((d?.error as string) ?? "authorization_url_missing");
  }

  // Store PKCE verifier client-side so the callback can retrieve it
  if (codeVerifier) {
    try {
      sessionStorage.setItem(`oauth_pkce_${opts.providerKey}`, codeVerifier);
    } catch {
      // sessionStorage unavailable — PKCE will be skipped
    }
  }

  return { authorizationUrl, state: state ?? "", codeVerifier: codeVerifier ?? null };
}

// ---------------------------------------------------------------------------
// Popup window management
// ---------------------------------------------------------------------------

/** Open the authorization URL in a centered popup. */
export function openOAuthPopup(url: string, title = "OAuth"): Window | null {
  const w = 600;
  const h = 700;
  const left = Math.round(screen.width / 2 - w / 2);
  const top = Math.round(screen.height / 2 - h / 2);
  return window.open(
    url,
    title,
    `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,resizable=yes`,
  );
}

// ---------------------------------------------------------------------------
// PostMessage listeners
// ---------------------------------------------------------------------------

/**
 * Listens for the oauth_success postMessage from the callback popup.
 * Returns an unsubscribe function.
 * Calls onSuccess / onError / onAccountLinkedElsewhere accordingly.
 */
export function listenForOAuthResult(opts: {
  onSuccess: (payload: OAuthSuccessPayload) => void;
  onError?: (payload: OAuthErrorPayload) => void;
  /** Called when the account is actively linked to another org */
  onAccountLinkedElsewhere?: () => void;
}): () => void {
  const handler = (event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    const msg = event.data as { type?: string; payload?: unknown };

    if (msg.type === "oauth_success") {
      window.removeEventListener("message", handler);
      opts.onSuccess(msg.payload as OAuthSuccessPayload);
    } else if (msg.type === "oauth_error") {
      window.removeEventListener("message", handler);
      const errPayload = event.data as OAuthErrorPayload;
      if (errPayload.reason === "account_already_linked_elsewhere") {
        opts.onAccountLinkedElsewhere?.();
      } else {
        opts.onError?.(errPayload);
      }
    }
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
