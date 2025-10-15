import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ConviteAceito() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "done" | "error">("processing");
  const [message, setMessage] = useState<string>("Processando convite...");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const invitationId = url.searchParams.get("invitation_id");

        // Exchange auth code from email link for a session
        try {
          await supabase.auth.exchangeCodeForSession(window.location.href);
        } catch (e) {
          // If there's no code in URL, ignore; user may already be logged in
        }

        if (!invitationId) {
          setStatus("error");
          setMessage("Convite inválido: ID ausente.");
          return;
        }

        const { error } = await supabase.functions.invoke("process-invitation", {
          body: { invitation_id: invitationId },
        });
        if (error) throw error;

        setStatus("done");
        setMessage("Convite aceito! Redirecionando...");
        toast.success("Convite aceito com sucesso. Bem-vindo!");
        // Recarrega a aplicação para que o contexto useAuth reavalie organizationId/permissions
        setTimeout(() => {
          window.location.replace("/");
        }, 900);
      } catch (e: any) {
        console.error("Falha ao processar convite:", e);
        setStatus("error");
        setMessage(e?.message || "Houve um problema ao aceitar o convite.");
        toast.error(e?.message || "Não foi possível aceitar o convite.");
      }
    };
    run();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold mb-2">Convite</h1>
        <p className="text-gray-600">{message}</p>
        {status === "processing" && (
          <div className="mt-6 inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        )}
      </div>
    </div>
  );
}