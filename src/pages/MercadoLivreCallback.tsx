import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function MercadoLivreCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Parâmetros inválidos: code/state ausentes.");
      return;
    }

    const run = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("mercado-livre-callback", {
          body: { code, state },
        });
        if (error || (data as any)?.error) {
          throw new Error(error?.message || (data as any)?.error || "Falha ao concluir autorização");
        }
        setStatus("success");
        // Se foi aberto em janela popup, notifica a janela pai e tenta fechar
        try {
          if (window.opener) {
            window.opener.postMessage({ type: "meli_oauth_success", payload: { ok: true } }, window.location.origin);
          }
          setTimeout(() => {
            try { window.close(); } catch (_) {}
            navigate("/aplicativos/conectados", { replace: true });
          }, 500);
        } catch (_) {
          navigate("/aplicativos/conectados", { replace: true });
        }
      } catch (e: any) {
        console.error("Erro no callback do Mercado Livre:", e);
        setStatus("error");
        setErrorMsg(e?.message || "Erro desconhecido");
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
            <div className="text-sm text-muted-foreground">Aguarde enquanto finalizamos a conexão com o Mercado Livre.</div>
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