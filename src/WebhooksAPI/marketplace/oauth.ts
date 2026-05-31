// Universal OAuth flow helper for the frontend.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
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

export async function startOAuth(
  client: SupabaseClient<Database>,
  opts: StartOAuthOptions,
): Promise<StartOAuthResult> {
  const body = {
    providerKey: opts.providerKey,
    organizationId: opts.organizationId,
    companyId: opts.companyId ?? null,
    storeName: opts.storeName,
    connectedByUserId: opts.connectedByUserId ?? null,
    redirectUri: opts.redirectUri ?? undefined,
    correlationId: opts.correlationId ?? crypto.randomUUID(),
  };

  const { data: sessionRes } = await client.auth.getSession();
  const token = sessionRes?.session?.access_token;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);

  const functionName =
    opts.providerKey === "shopee" ? "shopee-start-auth" : "oauth-start-auth";
  const requestBody =
    opts.providerKey === "shopee"
      ? {
          organizationId: body.organizationId,
          companyId: body.companyId,
          storeName: body.storeName,
          connectedByUserId: body.connectedByUserId,
          redirectUri: body.redirectUri,
          correlationId: body.correlationId,
        }
      : body;

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "Tempo esgotado ao conectar com o servidor. Tente novamente em instantes.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const authorizationUrl = parsed.authorization_url as string | undefined;
  const state = parsed.state as string | undefined;
  const codeVerifier = parsed.code_verifier as string | null | undefined;

  if (!response.ok || !authorizationUrl) {
    const msg =
      (parsed.error as string | undefined) ||
      (response.status === 504
        ? "Servidor de autenticação indisponível (timeout). Rode o deploy de oauth-start-auth."
        : `Falha ao iniciar OAuth (${response.status})`);
    throw new Error(msg);
  }

  if (codeVerifier) {
    try {
      sessionStorage.setItem(`oauth_pkce_${opts.providerKey}`, codeVerifier);
    } catch {
      // sessionStorage unavailable
    }
  }

  return { authorizationUrl, state: state ?? "", codeVerifier: codeVerifier ?? null };
}

const OAUTH_POPUP_FEATURES = (() => {
  const w = 600;
  const h = 700;
  const left = Math.round(screen.width / 2 - w / 2);
  const top = Math.round(screen.height / 2 - h / 2);
  return `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,resizable=yes`;
})();

export function openOAuthPopup(url: string, title = "OAuth"): Window | null {
  return window.open(url, title, OAUTH_POPUP_FEATURES);
}

export function closeOAuthPopup(popup: Window | null): void {
  try {
    popup?.close();
  } catch {
    // ignore
  }
}

export function listenForOAuthResult(opts: {
  onSuccess: (payload: OAuthSuccessPayload) => void;
  onError?: (payload: OAuthErrorPayload) => void;
  onAccountLinkedElsewhere?: () => void;
}): () => void {
  const handler = (event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    const msg = event.data as { type?: string; payload?: unknown };

    if (msg.type === "oauth_success" || msg.type === "shopee_oauth_success") {
      window.removeEventListener("message", handler);
      const payload = msg.payload as OAuthSuccessPayload | { ok?: boolean };
      if (payload && typeof payload === "object" && "integrationId" in payload) {
        opts.onSuccess(payload as OAuthSuccessPayload);
      } else if (msg.type === "shopee_oauth_success") {
        opts.onSuccess({
          providerKey: "shopee",
          integrationId: "",
          externalAccountId: "",
          ok: true,
        });
      }
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
