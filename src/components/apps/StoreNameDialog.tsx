import { useState } from "react";
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

interface StoreNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerKey: string;
  providerDisplayName: string;
  redirectUri?: string;
  onSuccess: (payload: OAuthSuccessPayload) => void;
}

export function StoreNameDialog({
  open,
  onOpenChange,
  providerKey,
  providerDisplayName,
  redirectUri,
  onSuccess,
}: StoreNameDialogProps) {
  const { toast } = useToast();
  const { user, organizationId } = useAuth();
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [manualAuthUrl, setManualAuthUrl] = useState<string | null>(null);

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

    setLoading(true);
    setManualAuthUrl(null);

    try {
      const result = await startOAuth(supabase, {
        providerKey,
        organizationId,
        storeName: trimmed,
        connectedByUserId: user?.id ?? null,
        redirectUri: redirectUri ?? undefined,
      });

      const popup = openOAuthPopup(result.authorizationUrl, providerDisplayName);
      if (!popup) {
        setManualAuthUrl(result.authorizationUrl);
        setLoading(false);
        toast({
          title: "Popup bloqueado",
          description: "Use o botão abaixo para abrir o login do marketplace.",
          variant: "destructive",
        });
        return;
      }

      let pollClosed: number | null = null;
      const cleanup = (forceStopLoading = false) => {
        if (pollClosed !== null) {
          clearInterval(pollClosed);
          pollClosed = null;
        }
        if (forceStopLoading) setLoading(false);
      };

      const unlisten = listenForOAuthResult({
        onSuccess: (payload) => {
          cleanup(true);
          setManualAuthUrl(null);
          onOpenChange(false);
          setStoreName("");
          onSuccess(payload);
        },
        onError: (err) => {
          cleanup(true);
          closeOAuthPopup(popup);
          toast({
            title: "Erro na autenticação",
            description: err.reason ?? err.error ?? "Tente novamente.",
            variant: "destructive",
          });
        },
        onAccountLinkedElsewhere: () => {
          cleanup(true);
          closeOAuthPopup(popup);
          toast({
            title: "Conta já conectada",
            description:
              "Esta conta já está vinculada a outra organização no Novura. Entre em contato com o suporte se isso for um engano.",
            variant: "destructive",
          });
        },
      });

      pollClosed = window.setInterval(() => {
        if (popup.closed) {
          cleanup(true);
          unlisten();
        }
      }, 500);
    } catch (err) {
      setLoading(false);
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
        if (!loading) {
          setManualAuthUrl(null);
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-novura-primary" />
            Conectar {providerDisplayName}
          </DialogTitle>
          <DialogDescription>
            Dê um nome para identificar esta conta. Em seguida, você será redirecionado para
            autorizar o acesso no {providerDisplayName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                if (e.key === "Enter" && !loading) handleConnect();
              }}
              disabled={loading}
              autoFocus
            />
          </div>

          {manualAuthUrl && (
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConnect}
            disabled={loading || !storeName.trim()}
            className="bg-novura-primary hover:bg-novura-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Preparando login...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                Conectar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
