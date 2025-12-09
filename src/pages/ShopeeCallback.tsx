import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function ShopeeCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const shopId = searchParams.get("shop_id");

    if (!code || !state || !shopId) {
      setStatus("error");
      setErrorMsg("Parâmetros inválidos: code/state/shop_id ausentes.");
      return;
    }

    const run = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("shopee-callback", {
          body: { code, state, shop_id: shopId },
        });
        if (error || (data && typeof data === "object" && (data as Record<string, unknown>)["error"])) {
          const msg = error?.message || String((data as Record<string, unknown>)["error"]);
          throw new Error(msg || "Falha ao concluir autorização");
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
    };

    run();
  }, [searchParams, navigate]);

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
