import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function ShopeeCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { organizationId } = useAuth();

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const shopId = searchParams.get("shop_id");

    if (!shopId) {
      setStatus("error");
      setErrorMsg("Parâmetros inválidos: code/shop_id ausentes.");
      return;
    }

    const run = async () => {
      try {
        let envFlag: string | null = null;
        try { envFlag = localStorage.getItem('shopee_auth_env'); } catch (_) {}
        let cbFunc = envFlag === 'sandbox' ? 'shopee-callback-sandbox' : 'shopee-callback';
        if (state) {
          try {
            const parsed = JSON.parse(atob(state)) as { env?: string | null };
            if (parsed?.env === 'sandbox') cbFunc = 'shopee-callback-sandbox';
            if (parsed?.env === 'prod') cbFunc = 'shopee-callback';
          } catch (_) {}
        }
        if (code) {
          const { data: sessionRes } = await supabase.auth.getSession();
          const token: string | undefined = sessionRes?.session?.access_token;
          const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
          if (token) headers.Authorization = `Bearer ${token}`;
          const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(cbFunc, {
            body: { code, state: state || undefined, shop_id: shopId },
            headers,
          });
          if (error || (data && typeof data === "object" && (data as Record<string, unknown>)["error"])) {
            const msg = error?.message || String((data as Record<string, unknown>)["error"]);
            throw new Error(msg || "Falha ao concluir autorização");
          }
        } else {
          if (!organizationId) {
            throw new Error("Sessão ausente para validar a conexão.");
          }
          const { data: integrations, error: qErr } = await supabase
            .from("marketplace_integrations")
            .select("id, config")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Shopee")
            .contains("config", { shopee_shop_id: String(shopId) })
            .limit(1);
          if (qErr) throw qErr;
          if (!integrations || integrations.length === 0) {
            throw new Error("Falha na autorização: código ausente no redirecionamento.");
          }
        }
        setStatus("success");
        try {
          if (window.opener) {
            window.opener.postMessage({ type: "shopee_oauth_success", payload: { ok: true } }, window.location.origin);
          }
          setTimeout(() => {
            window.close?.();
            navigate("/aplicativos/conectados", { replace: true });
          }, 500);
        } catch (_) {
          navigate("/aplicativos/conectados", { replace: true });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        setStatus("error");
        setErrorMsg(msg);
      }
      finally {
        try { localStorage.removeItem('shopee_auth_env'); } catch (_) {}
      }
    };

    run();
  }, [searchParams, navigate, organizationId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-6">
      <div className="max-w-md w-full bg-white shadow-sm rounded-xl p-6">
        {status === "processing" && (
          <div className="text-center space-y-2">
            <div className="text-xl font-semibold">Concluindo autorização...</div>
            <div className="text-sm text-muted-foreground">Aguarde enquanto finalizamos a conexão com a Shopee.</div>
          </div>
        )}
        {status === "success" && (
          <div className="text-center space-y-2">
            <div className="text-xl font-semibold text-green-600">Conexão autorizada!</div>
            <div className="text-sm text-muted-foreground">Você será redirecionado para a página de aplicativos conectados.</div>
          </div>
        )}
        {status === "error" && (
          <div className="text-center space-y-2">
            <div className="text-xl font-semibold text-red-600">Falha na autorização</div>
            <div className="text-sm text-muted-foreground">{errorMsg}</div>
          </div>
        )}
      </div>
    </div>
  );
}
