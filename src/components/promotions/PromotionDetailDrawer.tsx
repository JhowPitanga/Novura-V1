import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PromotionStatusBadge } from "./PromotionStatusBadge";
import { usePromotionItems, useRemoveItemFromPromotion } from "@/hooks/usePromotions";
import type { Promotion } from "@/types/promotions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PackagePlus,
  Trash2,
  Calendar,
  ShoppingBag,
  RefreshCw,
} from "lucide-react";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return "—"; }
}

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface PromotionDetailDrawerProps {
  promotion: Promotion | null;
  integrationId: string;
  organizationId: string;
  marketplaceKey: string;
  onClose: () => void;
  onAddItems: (p: Promotion) => void;
}

export function PromotionDetailDrawer({
  promotion,
  integrationId,
  organizationId,
  marketplaceKey,
  onClose,
  onAddItems,
}: PromotionDetailDrawerProps) {
  const { data: items = [], isLoading: itemsLoading } = usePromotionItems(promotion?.id ?? null);
  const removeMutation = useRemoveItemFromPromotion(promotion?.id ?? "", organizationId, marketplaceKey);

  const canAddItems = promotion && ["scheduled", "active", "pending"].includes(promotion.status);

  const handleRemoveItem = (itemId: string, variationId?: string | null) => {
    if (!promotion || !integrationId) return;
    removeMutation.mutate({
      integrationId,
      externalId: promotion.external_id,
      promotionType: promotion.promotion_type,
      mlKind: promotion.ml_kind ?? undefined,
      marketplaceItemId: itemId,
      variationId: variationId ?? undefined,
    });
  };

  return (
    <Sheet open={!!promotion} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {promotion && (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="text-lg leading-tight">{promotion.name || "Promoção sem nome"}</SheetTitle>
                <PromotionStatusBadge status={promotion.status} />
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="outline" className="text-xs text-gray-500 capitalize">
                  {promotion.promotion_type === "STANDARD_DISCOUNT" ? "Desconto Normal" : "Oferta Relâmpago"}
                </Badge>
                <Badge variant="outline" className="text-xs text-gray-500 capitalize">
                  {promotion.marketplace_key.replace("_", " ")}
                </Badge>
              </div>
            </SheetHeader>

            {/* Campaign meta */}
            <div className="space-y-3 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 font-medium">Início</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{formatDate(promotion.start_date)}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 font-medium">Fim</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{formatDate(promotion.finish_date)}</p>
                </div>
              </div>
              {promotion.meli_percent != null && (
                <div className="p-3 bg-violet-50 rounded-lg">
                  <p className="text-xs text-violet-600 font-medium">Desconto ML: {promotion.meli_percent}%</p>
                  {promotion.seller_percent != null && (
                    <p className="text-xs text-gray-500">Vendedor: {promotion.seller_percent}%</p>
                  )}
                </div>
              )}
              {promotion.last_synced_at && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Sincronizado em {formatDate(promotion.last_synced_at)}
                </p>
              )}
            </div>

            <Separator />

            {/* Items section */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Produtos ({items.length})
                  </h3>
                </div>
                {canAddItems && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-violet-700 border-violet-300 hover:bg-violet-50"
                    onClick={() => onAddItems(promotion)}
                  >
                    <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                    Adicionar
                  </Button>
                )}
              </div>

              {itemsLoading ? (
                <div className="flex justify-center py-6">
                  <RefreshCw className="h-5 w-5 animate-spin text-violet-500" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center">
                  <ShoppingBag className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Nenhum produto nesta promoção.</p>
                  {canAddItems && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => onAddItems(promotion)}
                    >
                      <PackagePlus className="h-4 w-4 mr-1.5" />
                      Adicionar produtos
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {items.map(item => (
                    <div
                      key={`${item.id}`}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.marketplace_item_id}</p>
                        {item.variation_id && (
                          <p className="text-xs text-gray-400">Variação: {item.variation_id}</p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {item.original_price != null && (
                            <span className="text-xs text-gray-400 line-through">{formatPrice(item.original_price)}</span>
                          )}
                          {item.deal_price != null && (
                            <span className="text-xs font-semibold text-green-600">{formatPrice(item.deal_price)}</span>
                          )}
                          {item.promotion_stock != null && (
                            <span className="text-xs text-gray-500">Est: {item.promotion_stock}</span>
                          )}
                        </div>
                      </div>
                      {canAddItems && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          onClick={() => handleRemoveItem(item.marketplace_item_id, item.variation_id)}
                          disabled={removeMutation.isPending}
                          aria-label="Remover produto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
