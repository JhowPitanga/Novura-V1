import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Zap, ChevronRight, AlertCircle } from "lucide-react";
import { useAddItemsToPromotion } from "@/hooks/usePromotions";
import type { Promotion } from "@/types/promotions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MlFlashSaleInvitesListProps {
  invites: Promotion[];
  integrationId: string;
  organizationId: string;
  marketplaceKey: string;
}

interface OptInDialogProps {
  invite: Promotion | null;
  integrationId: string;
  organizationId: string;
  marketplaceKey: string;
  onClose: () => void;
}

function OptInFlashSaleDialog({ invite, integrationId, organizationId, marketplaceKey, onClose }: OptInDialogProps) {
  const [marketplaceItemId, setMarketplaceItemId] = useState("");
  const [dealPrice, setDealPrice] = useState("");
  const [stock, setStock] = useState("");
  const [error, setError] = useState("");

  const addMutation = useAddItemsToPromotion(invite?.id ?? "", organizationId, marketplaceKey);

  const handleOptIn = async () => {
    if (!invite) return;
    if (!marketplaceItemId || !dealPrice) {
      setError("Preencha o ID do anúncio e o preço de oferta.");
      return;
    }
    setError("");
    await addMutation.mutateAsync({
      integrationId,
      externalId: invite.external_id,
      promotionType: "FLASH_SALE",
      items: [{
        marketplaceItemId,
        dealPrice: Number(dealPrice),
        promotionStock: stock ? Number(stock) : undefined,
      }],
    });
    onClose();
  };

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try { return format(new Date(iso), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return "—"; }
  }

  if (!invite) return null;

  return (
    <Dialog open={!!invite} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Zap className="h-4 w-4 text-amber-600" />
            </div>
            <DialogTitle>Aceitar convite de Flash Sale</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p><strong>{invite.name || invite.external_id}</strong></p>
            <p className="text-xs mt-1">
              {formatDate(invite.start_date)} → {formatDate(invite.finish_date)}
            </p>
            {invite.deadline_date && (
              <p className="text-xs mt-1 text-red-600">
                Prazo para aceitar: {formatDate(invite.deadline_date)}
              </p>
            )}
          </div>
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div className="space-y-1">
            <Label>ID do Anúncio (MLB…)</Label>
            <Input
              value={marketplaceItemId}
              onChange={e => setMarketplaceItemId(e.target.value.trim())}
              placeholder="MLB123456789"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Preço de oferta (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={dealPrice}
                onChange={e => setDealPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Estoque reservado</Label>
              <Input
                type="number"
                min="1"
                value={stock}
                onChange={e => setStock(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Após aceitar, a oferta relâmpago não pode ser removida enquanto estiver ativa.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleOptIn}
            disabled={addMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {addMutation.isPending ? "Confirmando..." : "Confirmar participação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MlFlashSaleInvitesList({
  invites,
  integrationId,
  organizationId,
  marketplaceKey,
}: MlFlashSaleInvitesListProps) {
  const [optInTarget, setOptInTarget] = useState<Promotion | null>(null);

  if (invites.length === 0) return null;

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try { return format(new Date(iso), "dd/MM/yy", { locale: ptBR }); } catch { return "—"; }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          Convites de Oferta Relâmpago ({invites.length})
        </h3>
        <Badge className="text-xs bg-amber-200 text-amber-800 ml-auto">Mercado Livre</Badge>
      </div>
      <ul className="space-y-2">
        {invites.map(invite => (
          <li
            key={invite.id}
            className="flex items-center justify-between gap-4 bg-white rounded-lg border border-amber-100 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 line-clamp-1">{invite.name || invite.external_id}</p>
              <p className="text-xs text-gray-500">
                {formatDate(invite.start_date)} → {formatDate(invite.finish_date)}
                {invite.deadline_date && (
                  <span className="text-red-500 ml-2">Prazo: {formatDate(invite.deadline_date)}</span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-amber-700 border-amber-300 hover:bg-amber-100 shrink-0"
              onClick={() => setOptInTarget(invite)}
            >
              Aceitar
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </li>
        ))}
      </ul>

      <OptInFlashSaleDialog
        invite={optInTarget}
        integrationId={integrationId}
        organizationId={organizationId}
        marketplaceKey={marketplaceKey}
        onClose={() => setOptInTarget(null)}
      />
    </div>
  );
}
