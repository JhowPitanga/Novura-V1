/**
 * Manage a Shopee shop flash sale after creation.
 * Uses local DB + sync; marketplace APIs include get_shop_flash_sale, get_shop_flash_sale_items,
 * add_shop_flash_sale_items, update_shop_flash_sale, update_shop_flash_sale_items,
 * delete_shop_flash_sale, delete_shop_flash_sale_items.
 */

import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import {
  usePromotionById,
  usePromotionItems,
  useSyncPromotions,
  useDeletePromotion,
  useRemoveItemFromPromotion,
} from "@/hooks/usePromotions";
import { AddItemsToPromotionDialog } from "@/components/promotions/AddItemsToPromotionDialog";
import { PromotionStatusBadge } from "@/components/promotions/PromotionStatusBadge";
import { ArrowLeft, PackagePlus, RefreshCw, Trash2, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { promotionKeys } from "@/services/promotions.service";

const MARKETPLACE_KEY = "shopee";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ShopeeFlashSaleManage() {
  const { promotionId } = useParams<{ promotionId: string }>();
  const { organizationId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: promotion, isLoading, isError } = usePromotionById(organizationId ?? null, promotionId ?? null);
  const { data: items = [], isLoading: itemsLoading } = usePromotionItems(promotion?.id ?? null);

  const [addItemsOpen, setAddItemsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const syncMutation = useSyncPromotions(organizationId ?? "", MARKETPLACE_KEY);
  const deleteMutation = useDeletePromotion(organizationId ?? "", MARKETPLACE_KEY);
  const removeMutation = useRemoveItemFromPromotion(promotion?.id ?? "", organizationId ?? "", MARKETPLACE_KEY);

  const integrationId = promotion?.integration_id ?? "";

  const invalidateLocal = useCallback(() => {
    if (!organizationId || !promotionId || !promotion?.id) return;
    queryClient.invalidateQueries({ queryKey: promotionKeys.detailForOrg(organizationId, promotionId) });
    queryClient.invalidateQueries({ queryKey: promotionKeys.items(promotion.id) });
    queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(organizationId, MARKETPLACE_KEY) });
  }, [organizationId, promotionId, promotion?.id, queryClient]);

  const handleSync = () => {
    if (!integrationId) return;
    syncMutation.mutate(integrationId, {
      onSuccess: () => invalidateLocal(),
    });
  };

  const handleDeleteConfirm = () => {
    if (!promotion || !integrationId) return;
    deleteMutation.mutate(
      {
        integrationId,
        externalId: promotion.external_id,
        promotionType: promotion.promotion_type,
      },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          navigate("/anuncios", { replace: true });
        },
      },
    );
  };

  if (!organizationId) return null;

  const wrongType =
    promotion &&
    (promotion.promotion_type !== "FLASH_SALE" || promotion.marketplace_key !== "shopee");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <GlobalHeader />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-5xl mx-auto space-y-6">
              <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate("/anuncios")}>
                <ArrowLeft className="h-4 w-4" />
                Voltar para Anúncios
              </Button>

              {isLoading && (
                <div className="flex justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
                </div>
              )}

              {!isLoading && (isError || !promotion) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Promoção não encontrada</CardTitle>
                    <CardDescription>Verifique o link ou sincronize a aba Promoções.</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {!isLoading && promotion && wrongType && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tipo incorreto</CardTitle>
                    <CardDescription>Esta página é apenas para ofertas relâmpago da Shopee.</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {promotion && !wrongType && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-orange-100 rounded-lg shrink-0">
                        <Zap className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <h1 className="text-xl font-semibold text-gray-900 line-clamp-2">
                          {promotion.name || "Oferta relâmpago"}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <PromotionStatusBadge status={promotion.status} />
                          <Badge variant="outline" className="text-xs">
                            Shopee · ID {promotion.external_id}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          {formatDate(promotion.start_date)} — {formatDate(promotion.finish_date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={handleSync} disabled={!integrationId || syncMutation.isPending}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                        Sincronizar
                      </Button>
                      {["scheduled", "active", "pending"].includes(promotion.status) && (
                        <Button
                          size="sm"
                          className="bg-orange-600 hover:bg-orange-700 text-white"
                          onClick={() => setAddItemsOpen(true)}
                          disabled={!integrationId}
                        >
                          <PackagePlus className="h-4 w-4 mr-2" />
                          Adicionar produtos
                        </Button>
                      )}
                      {!["active"].includes(promotion.status) && (
                        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={!integrationId}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Encerrar / excluir
                        </Button>
                      )}
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Produtos na campanha</CardTitle>
                      <CardDescription>
                        Preço promocional e estoque reservado são obrigatórios para a Shopee neste tipo de promoção.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {itemsLoading ? (
                        <div className="flex justify-center py-10">
                          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : items.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                          Nenhum produto ainda. Use &quot;Adicionar produtos&quot; para incluir anúncios.
                        </p>
                      ) : (
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Anúncio</TableHead>
                                <TableHead>Variação</TableHead>
                                <TableHead className="text-right">Preço oferta</TableHead>
                                <TableHead className="text-right">Estoque promo</TableHead>
                                <TableHead className="w-[72px]" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map(row => (
                                <TableRow key={row.id}>
                                  <TableCell className="font-mono text-xs">{row.marketplace_item_id}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {row.variation_id ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">{formatPrice(row.deal_price)}</TableCell>
                                  <TableCell className="text-right text-sm">{row.promotion_stock ?? "—"}</TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500"
                                      disabled={removeMutation.isPending}
                                      onClick={() =>
                                        removeMutation.mutate({
                                          integrationId,
                                          externalId: promotion.external_id,
                                          promotionType: "FLASH_SALE",
                                          marketplaceItemId: row.marketplace_item_id,
                                          variationId: row.variation_id ?? undefined,
                                        })
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {promotion && !wrongType && (
        <>
          <AddItemsToPromotionDialog
            promotion={addItemsOpen ? promotion : null}
            integrationId={integrationId}
            organizationId={organizationId}
            marketplaceKey={MARKETPLACE_KEY}
            onClose={() => {
              setAddItemsOpen(false);
              invalidateLocal();
            }}
          />

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Encerrar ou excluir esta oferta relâmpago?</AlertDialogTitle>
                <AlertDialogDescription>
                  A campanha será removida ou encerrada na Shopee conforme o status atual. Esta ação não pode ser
                  desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={handleDeleteConfirm}
                  disabled={deleteMutation.isPending}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </SidebarProvider>
  );
}
