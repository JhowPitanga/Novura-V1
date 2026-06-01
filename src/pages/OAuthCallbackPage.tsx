// Universal OAuth callback page for marketplace SPA redirects.

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { OAuthSuccessPayload } from "@/WebhooksAPI/marketplace/oauth";
import { parseOAuthStatePayload } from "@/utils/oauthState";

const PROVIDER_LABELS: Record<string, string> = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
};

function pkceStorageKey(providerKey: string): string {
  return `oauth_pkce_${providerKey}`;
}

function resolvePostMessageTarget(state: string, apiOpenerOrigin?: string | null): string {
  const fromApi = apiOpenerOrigin?.trim();
  if (fromApi) return fromApi;
  const fromState = parseOAuthStatePayload(state)?.openerOrigin?.trim();
  if (fromState) return fromState;
  return window.location.origin;
}

function notifyOpener(
  message: Record<string, unknown>,
  targetOrigin: string,
): void {
  if (!window.opener) return;
  const origins = [targetOrigin.trim(), "*"].filter(
    (value, index, arr) => value && arr.indexOf(value) === index,
  );
  for (const origin of origins) {
    try {
      window.opener.postMessage(message, origin);
    } catch {
      // try next origin
    }
  }
}

/**
 * Handles /oauth/:providerKey/callback — exchanges code via oauth-callback (POST + JWT)
 * and notifies the opener with oauth_success.
 */
export default function OAuthCallbackPage({
  providerKeyOverride,
}: {
  providerKeyOverride?: string;
} = {}) {
  const { providerKey: routeProviderKey = "" } = useParams<{ providerKey: string }>();
  const providerKey = providerKeyOverride ?? routeProviderKey;
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const providerLabel = PROVIDER_LABELS[providerKey] ?? providerKey;

  useEffect(() => {
    if (!providerKey) {
      setErrorMsg("Provider não identificado na URL de callback.");
      return;
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const shopId = searchParams.get("shop_id");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setErrorMsg(`${providerLabel} retornou erro: ${errorParam}`);
      return;
    }

    if (!state) {
      setErrorMsg("Parâmetro state ausente no retorno do marketplace.");
      return;
    }

    if (providerKey === "shopee" && !shopId) {
      setErrorMsg("Parâmetros inválidos: shop_id ausente no retorno da Shopee.");
      return;
    }

    if (!code) {
      setErrorMsg("Código de autorização ausente. Tente conectar novamente.");
      return;
    }

    const run = async () => {
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        if (!sessionRes?.session?.access_token) {
          throw new Error("Sessão ausente. Faça login no Novura e tente conectar novamente.");
        }

        let codeVerifier: string | null = null;
        try {
          codeVerifier = sessionStorage.getItem(pkceStorageKey(providerKey));
        } catch {
          // sessionStorage unavailable
        }

        const body: Record<string, string | undefined> = {
          code,
          state,
          provider_key: providerKey,
          code_verifier: codeVerifier ?? undefined,
        };
        if (shopId) body.shop_id = shopId;

        const { data, error } = await supabase.functions.invoke<{
          type?: string;
          payload?: OAuthSuccessPayload;
          openerOrigin?: string | null;
          error?: string;
          reason?: string;
        }>("oauth-callback", { body });

        if (error) throw new Error(error.message);

        const postTarget = resolvePostMessageTarget(state, data?.openerOrigin);

        if (data?.type === "oauth_error") {
          notifyOpener(
            {
              type: "oauth_error",
              error: data.error,
              reason: data.reason ?? data.error,
              providerKey,
            },
            postTarget,
          );
          throw new Error(data.reason ?? data.error ?? "Falha ao concluir autorização");
        }

        if (data?.type !== "oauth_success" || !data.payload?.integrationId) {
          throw new Error(`Resposta inválida ao concluir a conexão com ${providerLabel}.`);
        }

        try {
          sessionStorage.removeItem(pkceStorageKey(providerKey));
        } catch {
          // ignore
        }

        notifyOpener(
          { type: "oauth_success", payload: data.payload },
          postTarget,
        );
        setTimeout(() => {
          try {
            window.close();
          } catch {
            // ignore
          }
        }, 300);
      } catch (err) {
        try {
          sessionStorage.removeItem(pkceStorageKey(providerKey));
        } catch {
          // ignore
        }
        setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      }
    };

    void run();
  }, [providerKey, providerLabel, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-6">
      <div className="max-w-md w-full bg-white shadow-sm rounded-xl p-6 text-center space-y-2">
        {errorMsg ? (
          <>
            <div className="text-xl font-semibold text-red-600">Falha na autorização</div>
            <div className="text-sm text-muted-foreground">{errorMsg}</div>
          </>
        ) : (
          <>
            <div className="text-xl font-semibold">Concluindo autorização...</div>
            <div className="text-sm text-muted-foreground">
              Aguarde enquanto finalizamos a conexão com {providerLabel}.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
