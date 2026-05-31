import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { OAuthSuccessPayload } from "@/WebhooksAPI/marketplace/oauth";

/**
 * Shopee redirects here (SPA route). Exchanges the code via oauth-callback (POST + JWT)
 * and notifies the opener with oauth_success.
 */
export default function ShopeeCallback() {
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const shopId = searchParams.get("shop_id");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setErrorMsg(`Shopee retornou erro: ${errorParam}`);
      return;
    }

    if (!shopId || !state) {
      setErrorMsg("Parâmetros inválidos: shop_id ou state ausentes no retorno da Shopee.");
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

        const { data, error } = await supabase.functions.invoke<{
          type?: string;
          payload?: OAuthSuccessPayload;
          error?: string;
          reason?: string;
        }>("oauth-callback", {
          body: {
            code,
            state,
            shop_id: shopId,
            provider_key: "shopee",
          },
        });

        if (error) throw new Error(error.message);

        if (data?.type === "oauth_error") {
          throw new Error(data.reason ?? data.error ?? "Falha ao concluir autorização");
        }

        if (data?.type !== "oauth_success" || !data.payload?.integrationId) {
          throw new Error("Resposta inválida ao concluir a conexão com a Shopee.");
        }

        if (window.opener) {
          window.opener.postMessage(
            { type: "oauth_success", payload: data.payload },
            window.location.origin,
          );
        }
        setTimeout(() => {
          try {
            window.close();
          } catch {
            // ignore
          }
        }, 300);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      }
    };

    void run();
  }, [searchParams]);

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
              Aguarde enquanto finalizamos a conexão com a Shopee.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
