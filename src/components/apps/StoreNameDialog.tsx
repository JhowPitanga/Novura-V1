import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  startOAuth,
  openOAuthPopup,
  closeOAuthPopup,
  listenForOAuthResult,
  type OAuthSuccessPayload,
} from "@/WebhooksAPI/marketplace/oauth";
import { recoverPendingOAuthIntegration } from "@/services/marketplace-providers.service";
import {
  clearOAuthPendingFlow,
  saveOAuthPendingFlow,
  type OAuthPendingFlow,
} from "@/utils/oauthState";

interface StoreNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  providerKey: string;
  providerDisplayName: string;
  redirectUri?: string;
  onSuccess: (payload: OAuthSuccessPayload) => void;
  /** When set, OAuth refreshes tokens on this row instead of creating a new integration. */
  reconnectIntegrationId?: string | null;
  defaultStoreName?: string;
  reconnectMode?: boolean;
}

type ConnectPhase = "idle" | "preparing" | "authorizing";

export function StoreNameDialog({
  open,
  onOpenChange,
  appId,
  providerKey,
  providerDisplayName,
  redirectUri,
  onSuccess,
  reconnectIntegrationId = null,
  defaultStoreName = "",
  reconnectMode = false,
}: StoreNameDialogProps) {
  const { toast } = useToast();
  const { user, organizationId } = useAuth();
  const [storeName, setStoreName] = useState("");
  const [connectPhase, setConnectPhase] = useState<ConnectPhase>("idle");
  const [manualAuthUrl, setManualAuthUrl] = useState<string | null>(null);
  const isBusy = connectPhase !== "idle";

  useEffect(() => {
    if (!open) return;
    if (defaultStoreName.trim()) {
      setStoreName(defaultStoreName.trim());
    }
  }, [open, defaultStoreName]);

  const finishOAuthSuccess = (payload: OAuthSuccessPayload) => {
    clearOAuthPendingFlow();
    setConnectPhase("idle");
    setManualAuthUrl(null);
    setStoreName("");
    onOpenChange(false);
    onSuccess(payload);
  };

  const tryRecoverFromPendingIntegration = async (flow: OAuthPendingFlow) => {
    const recovered = await recoverPendingOAuthIntegration(flow);
    if (recovered) {
      finishOAuthSuccess(recovered);
      return true;
    }
    return false;
  };

  const handleConnect = async () => {
    const trimmed = storeName.trim();
    if (!trimmed) {
      toast({
        title: "Nome da loja obrigatório",
        description: "Informe um nome para identificar esta conta.",
        variant: "destructive",
      });
      return;
    }
    if (!organizationId) {
      toast({
        title: "Organização não encontrada",
        description: "Faça login novamente.",
        variant: "destructive",
      });
      return;
    }

    setConnectPhase("preparing");
    setManualAuthUrl(null);

    const pendingFlow: OAuthPendingFlow = {
      organizationId,
      appId,
      providerKey,
      storeName: trimmed,
      startedAt: Date.now(),
      reconnectIntegrationId: reconnectIntegrationId ?? null,
    };
    saveOAuthPendingFlow(pendingFlow);

    try {
      const result = await startOAuth(supabase, {
        appId,
        providerKey,
        organizationId,
        storeName: trimmed,
        connectedByUserId: user?.id ?? null,
        redirectUri: redirectUri ?? undefined,
        reconnectIntegrationId: reconnectIntegrationId ?? undefined,
      });

      const popup = openOAuthPopup(result.authorizationUrl, providerDisplayName);
      if (!popup) {
        setManualAuthUrl(result.authorizationUrl);
        setConnectPhase("idle");
        toast({
          title: "Popup bloqueado",
          description: "Use o botão abaixo para abrir o login do marketplace.",
          variant: "destructive",
        });
        return;
      }

      setConnectPhase("authorizing");

      let oauthCompleted = false;
      let pollClosed: number | null = null;
      const cleanup = () => {
        if (pollClosed !== null) {
          clearInterval(pollClosed);
          pollClosed = null;
        }
      };

      const unlisten = listenForOAuthResult({
        onSuccess: (payload) => {
          oauthCompleted = true;
          cleanup();
          closeOAuthPopup(popup);
          finishOAuthSuccess(payload);
        },
        onError: (err) => {
          oauthCompleted = true;
          cleanup();
          closeOAuthPopup(popup);
          clearOAuthPendingFlow();
          setConnectPhase("idle");
          toast({
            title: "Erro na autenticação",
            description: err.reason ?? err.error ?? "Tente novamente.",
            variant: "destructive",
          });
        },
        onAccountLinkedElsewhere: () => {
          oauthCompleted = true;
          cleanup();
          closeOAuthPopup(popup);
          clearOAuthPendingFlow();
          setConnectPhase("idle");
          toast({
            title: "Conta já conectada",
            description:
              "Esta conta já está vinculada a outra organização no Novura. Entre em contato com o suporte se isso for um engano.",
            variant: "destructive",
          });
        },
      });

      pollClosed = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        window.setTimeout(async () => {
          if (oauthCompleted) return;
          unlisten();
          const recovered = await tryRecoverFromPendingIntegration(pendingFlow);
          if (!recovered) {
            clearOAuthPendingFlow();
            setConnectPhase("idle");
            toast({
              title: "Autorização não concluída",
              description: "A conexão não foi finalizada. Tente conectar novamente.",
              variant: "destructive",
            });
          }
        }, 1200);
      }, 400);
    } catch (err) {
      clearOAuthPendingFlow();
      setConnectPhase("idle");
      toast({
        title: "Erro ao iniciar conexão",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isBusy) {
          setManualAuthUrl(null);
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-novura-primary" />
            {reconnectMode ? `Reconectar ${providerDisplayName}` : `Conectar ${providerDisplayName}`}
          </DialogTitle>
          <DialogDescription>
            {connectPhase === "authorizing"
              ? `Conclua a autorização na janela do ${providerDisplayName}. Este modal permanecerá aberto até a conexão ser confirmada.`
              : reconnectMode
                ? `Renove o acesso da loja abaixo no ${providerDisplayName}. Empresa e armazém já configurados serão mantidos.`
                : `Dê um nome para identificar esta conta. Em seguida, você será redirecionado para autorizar o acesso no ${providerDisplayName}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {connectPhase === "authorizing" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-novura-primary" />
              <p className="text-sm font-medium">Aguardando autorização...</p>
              <p className="text-xs text-muted-foreground">
                Loja: <span className="font-medium text-foreground">{storeName}</span>
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="store-name">
                Nome da loja <span className="text-destructive">*</span>
              </Label>
              <Input
                id="store-name"
                placeholder={`Ex.: Minha loja no ${providerDisplayName}`}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isBusy) handleConnect();
                }}
                disabled={isBusy}
                autoFocus
              />
            </div>
          )}

          {manualAuthUrl && connectPhase !== "authorizing" && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => window.open(manualAuthUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir login {providerDisplayName}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
            Cancelar
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isBusy || !storeName.trim()}
            className="bg-novura-primary hover:bg-novura-primary/90"
          >
            {connectPhase === "authorizing" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Aguardando autorização...
              </>
            ) : connectPhase === "preparing" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Preparando login...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                {reconnectMode ? "Reconectar" : "Conectar"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
