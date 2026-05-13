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
import { Trash2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAddItemsToPromotion } from "@/hooks/usePromotions";
import type { Promotion } from "@/types/promotions";

interface ItemDraft {
  marketplaceItemId: string;
  variationId: string;
  dealPrice: string;
  promotionStock: string;
  purchaseLimit: string;
}

function emptyDraft(): ItemDraft {
  return { marketplaceItemId: "", variationId: "", dealPrice: "", promotionStock: "", purchaseLimit: "" };
}

interface AddItemsToPromotionDialogProps {
  promotion: Promotion | null;
  integrationId: string;
  organizationId: string;
  marketplaceKey: string;
  onClose: () => void;
}

export function AddItemsToPromotionDialog({
  promotion,
  integrationId,
  organizationId,
  marketplaceKey,
  onClose,
}: AddItemsToPromotionDialogProps) {
  const [items, setItems] = useState<ItemDraft[]>([emptyDraft()]);
  const [submitResult, setSubmitResult] = useState<{ successful: number; failed: Array<{ marketplaceItemId: string; error: string }> } | null>(null);

  const addMutation = useAddItemsToPromotion(promotion?.id ?? "", organizationId, marketplaceKey);

  const updateItem = (index: number, field: keyof ItemDraft, value: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!promotion || !integrationId) return;
    const validItems = items.filter(i => i.marketplaceItemId && i.dealPrice);
    if (validItems.length === 0) return;

    const result = await addMutation.mutateAsync({
      integrationId,
      externalId: promotion.external_id,
      promotionType: promotion.promotion_type,
      items: validItems.map(i => ({
        marketplaceItemId: i.marketplaceItemId.trim(),
        variationId: i.variationId || undefined,
        dealPrice: Number(i.dealPrice),
        promotionStock: i.promotionStock ? Number(i.promotionStock) : undefined,
        purchaseLimit: i.purchaseLimit ? Number(i.purchaseLimit) : undefined,
      })),
    });

    setSubmitResult({ successful: result.successful.length, failed: result.failed });

    if (result.failed.length === 0) {
      handleClose();
    }
  };

  const handleClose = () => {
    setItems([emptyDraft()]);
    setSubmitResult(null);
    onClose();
  };

  if (!promotion) return null;

  const isFlashSale = promotion.promotion_type === "FLASH_SALE";

  return (
    <Dialog open={!!promotion} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar produtos à promoção</DialogTitle>
          <p className="text-sm text-gray-500 mt-1 line-clamp-1">
            {promotion.name || promotion.external_id}
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto pr-1">
          {submitResult && submitResult.failed.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-800">
                  {submitResult.successful} adicionado(s), {submitResult.failed.length} falhou(aram)
                </p>
              </div>
              <ul className="text-xs text-yellow-700 space-y-1">
                {submitResult.failed.map((f, i) => (
                  <li key={i}>{f.marketplaceItemId}: {f.error}</li>
                ))}
              </ul>
            </div>
          )}

          {items.map((item, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">Item #{index + 1}</Badge>
                {items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-400 hover:text-red-600"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label className="text-xs">ID do Anúncio *</Label>
                  <Input
                    value={item.marketplaceItemId}
                    onChange={e => updateItem(index, "marketplaceItemId", e.target.value)}
                    placeholder="MLB123456789 ou 1234567"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ID Variação</Label>
                  <Input
                    value={item.variationId}
                    onChange={e => updateItem(index, "variationId", e.target.value)}
                    placeholder="Opcional"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Preço oferta (R$) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.dealPrice}
                    onChange={e => updateItem(index, "dealPrice", e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-sm"
                  />
                </div>
                {isFlashSale && (
                  <div className="space-y-1">
                    <Label className="text-xs">Estoque reservado</Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.promotionStock}
                      onChange={e => updateItem(index, "promotionStock", e.target.value)}
                      placeholder="Qtd"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Limite por compra</Label>
                  <Input
                    type="number"
                    min="0"
                    value={item.purchaseLimit}
                    onChange={e => updateItem(index, "purchaseLimit", e.target.value)}
                    placeholder="Opcional"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed"
            onClick={() => setItems(prev => [...prev, emptyDraft()])}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Adicionar mais produto
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending || !items.some(i => i.marketplaceItemId && i.dealPrice)}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {addMutation.isPending ? "Adicionando..." : `Adicionar ${items.filter(i => i.marketplaceItemId && i.dealPrice).length} produto(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
