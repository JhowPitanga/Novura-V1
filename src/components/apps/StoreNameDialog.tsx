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
  listenForOAuthResult,
  type OAuthSuccessPayload,
} from "@/WebhooksAPI/marketplace/oauth";

interface StoreNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provider key e.g. 'mercado_livre', 'shopee' */
  providerKey: string;
  /** Display name e.g. 'Mercado Livre' */
  providerDisplayName: string;
  /** Optional redirect URI explicitly required by provider console */
  redirectUri?: string;
  /** Called when OAuth completes successfully with the new integrationId */
  onSuccess: (payload: OAuthSuccessPayload) => void;
}

/**
 * Step 1 of the connection flow.
 * Asks the user for a store name then initiates the OAuth popup.
 * On success, calls onSuccess — which triggers QuickSetupModal (step 2).
 */
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
    try {
      const result = await startOAuth(supabase, {
        providerKey,
        organizationId,
        storeName: trimmed,
        connectedByUserId: user?.id ?? null,
        redirectUri: redirectUri ?? undefined,
      });

      // Open OAuth popup
      const popup = openOAuthPopup(result.authorizationUrl, providerDisplayName);
      if (!popup) {
        toast({
          title: "Popup bloqueado",
          description: "Permita pop-ups para este site e tente novamente.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Listen for postMessage from the callback popup
      let pollClosed: number | null = null;
      const cleanup = (forceStopLoading = false) => {
        if (pollClosed !== null) {
          clearInterval(pollClosed);
          pollClosed = null;
        }
        if (forceStopLoading) {
          setLoading(false);
        }
      };

      const unlisten = listenForOAuthResult({
        onSuccess: (payload) => {
          cleanup(true);
          setLoading(false);
          onOpenChange(false);
          setStoreName("");
          onSuccess(payload);
        },
        onError: (err) => {
          cleanup(true);
          setLoading(false);
          toast({
            title: "Erro na autenticação",
            description: err.reason ?? err.error ?? "Tente novamente.",
            variant: "destructive",
          });
        },
        onAccountLinkedElsewhere: () => {
          cleanup(true);
          setLoading(false);
          toast({
            title: "Conta já conectada",
            description:
              "Esta conta já está vinculada a outra organização no Novura. Entre em contato com o suporte se isso for um engano.",
            variant: "destructive",
          });
        },
      });

      // Detect if popup was closed manually without completing OAuth
      pollClosed = setInterval(() => {
        if (popup.closed) {
          cleanup(true);
          unlisten();
          // User closed popup before success/error callback
          // Keep dialog open but unlock actions (Cancel / close)
          setLoading(false);
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
        if (!loading) onOpenChange(v);
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
                if (e.key === "Enter") handleConnect();
              }}
              disabled={loading}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Este nome é exibido apenas internamente no Novura.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
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
                Conectando...
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
