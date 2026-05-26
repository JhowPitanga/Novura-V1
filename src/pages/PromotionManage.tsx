/**
 * PromotionManage — full management page for a STANDARD_DISCOUNT promotion.
 * Route: /anuncios/promocoes/:promotionId?marketplace=<displayName>
 *
 * Features:
 *  - Editable header (name, dates)
 *  - Bulk toolbar: apply % or R$ discount + optional dedicated stock to selected items
 *  - Items table with per-row inline removal and error display
 *  - ListingsPicker: search marketplace_items, multiselect, add with % or fixed price
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PromotionStatusBadge } from "@/components/promotions/PromotionStatusBadge";
import { ListingsPicker, type PickerSelection } from "@/components/promotions/ListingsPicker";
import { translateMarketplaceError } from "@/components/promotions/validators";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  usePromotionById,
  usePromotionItems,
  useSyncPromotions,
  useDeletePromotion,
  useEndPromotion,
  useAddItemsToPromotion,
  useUpdatePromotionItems,
  useRemoveItemFromPromotion,
  useUpdatePromotion,
} from "@/hooks/usePromotions";
import { promotionKeys } from "@/services/promotions.service";
import { normalizeMarketplaceKey } from "@/utils/marketplaceUtils";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Tag,
  Pencil,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return "—"; }
}
function formatPrice(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PromotionManage() {
  const { promotionId } = useParams<{ promotionId: string }>();
  const { organizationId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const marketplaceDisplayName = searchParams.get("marketplace") ?? "Shopee";
  const marketplaceKey = normalizeMarketplaceKey(marketplaceDisplayName);

  const { data: promotion, isLoading, isError } = usePromotionById(organizationId ?? null, promotionId ?? null);
  const { data: items = [], isLoading: itemsLoading } = usePromotionItems(promotion?.id ?? null);

  const integrationId = promotion?.integration_id ?? "";
  const isActive = promotion?.status === "active";
  const isEditable = promotion ? ["scheduled", "pending", "draft"].includes(promotion.status) : false;
  const canAddItems = promotion ? ["scheduled", "active", "pending"].includes(promotion.status) : false;

  // Header edit state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingDates, setEditingDates] = useState(false);
  const [startDateValue, setStartDateValue] = useState("");
  const [endDateValue, setEndDateValue] = useState("");

  useEffect(() => {
    if (promotion) {
      setNameValue(promotion.name ?? "");
      setStartDateValue(promotion.start_date ? promotion.start_date.slice(0, 16) : "");
      setEndDateValue(promotion.finish_date ? promotion.finish_date.slice(0, 16) : "");
    }
  }, [promotion?.id]);

  // Bulk toolbar state
  const [discountMode, setDiscountMode] = useState<"percent" | "absolute">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [bulkPurchaseLimit, setBulkPurchaseLimit] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Item-level error display
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const invalidateAll = useCallback(() => {
    if (!organizationId || !promotionId || !promotion?.id) return;
    queryClient.invalidateQueries({ queryKey: promotionKeys.detailForOrg(organizationId, promotionId) });
    queryClient.invalidateQueries({ queryKey: promotionKeys.items(promotion.id) });
    queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(organizationId, marketplaceKey) });
  }, [organizationId, promotionId, promotion?.id, marketplaceKey, queryClient]);

  const syncMutation = useSyncPromotions(organizationId ?? "", marketplaceKey);
  const deleteMutation = useDeletePromotion(organizationId ?? "", marketplaceKey);
  const endMutation = useEndPromotion(organizationId ?? "", marketplaceKey);
  const updateMutation = useUpdatePromotion(organizationId ?? "", marketplaceKey);
  const addItemsMutation = useAddItemsToPromotion(promotion?.id ?? "", organizationId ?? "", marketplaceKey);
  const updateItemsMutation = useUpdatePromotionItems(promotion?.id ?? "");
  const removeMutation = useRemoveItemFromPromotion(promotion?.id ?? "", organizationId ?? "", marketplaceKey);

  const handleSync = () => {
    if (!integrationId) return;
    syncMutation.mutate(integrationId, { onSuccess: () => invalidateAll() });
  };

  const handleSaveName = () => {
    if (!integrationId || !promotion) return;
    updateMutation.mutate(
      { integrationId, externalId: promotion.external_id, promotionType: "STANDARD_DISCOUNT", patch: { name: nameValue } },
      { onSuccess: () => { setEditingName(false); invalidateAll(); } },
    );
  };

  const handleSaveDates = () => {
    if (!integrationId || !promotion) return;
    updateMutation.mutate(
      { integrationId, externalId: promotion.external_id, promotionType: "STANDARD_DISCOUNT", patch: { startDate: startDateValue, endDate: endDateValue } },
      { onSuccess: () => { setEditingDates(false); invalidateAll(); } },
    );
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedItemIds(prev =>
      prev.size === items.length ? new Set() : new Set(items.map(i => i.id)),
    );
  };

  const handleApplyBulk = () => {
    if (!promotion || !integrationId || selectedItemIds.size === 0 || !discountValue) return;
    const targetItems = items.filter(i => selectedItemIds.has(i.id));
    const updatePayload = targetItems.map(i => ({
      marketplaceItemId: i.marketplace_item_id,
      variationId: i.variation_id ?? undefined,
      ...(discountMode === "percent"
        ? { discountPercent: Number(discountValue) }
        : { dealPrice: Number(discountValue) }),
      ...(bulkStock ? { promotionStock: Number(bulkStock) } : {}),
      ...(bulkPurchaseLimit ? { purchaseLimit: Number(bulkPurchaseLimit) } : {}),
    }));

    updateItemsMutation.mutate(
      { integrationId, externalId: promotion.external_id, promotionType: "STANDARD_DISCOUNT", items: updatePayload },
      {
        onSuccess: (result) => {
          const newErrors: Record<string, string> = {};
          for (const f of result.failed) {
            const found = items.find(i => i.marketplace_item_id === f.marketplaceItemId);
            if (found) newErrors[found.id] = translateMarketplaceError(f.error, marketplaceKey);
          }
          setItemErrors(newErrors);
          invalidateAll();
        },
      },
    );
  };

  const handleAddFromPicker = (selections: PickerSelection[]) => {
    if (!promotion || !integrationId) return;
    const pct = discountValue ? Number(discountValue) : undefined;
    const addPayload = selections.map(s => ({
      marketplaceItemId: s.marketplaceItemId,
      variationId: s.variationId,
      ...(pct != null && discountMode === "percent" ? { discountPercent: pct } : {}),
      ...(pct != null && discountMode === "absolute" ? { dealPrice: pct } : {}),
      ...(bulkStock ? { promotionStock: Number(bulkStock) } : {}),
      ...(bulkPurchaseLimit ? { purchaseLimit: Number(bulkPurchaseLimit) } : {}),
    }));

    addItemsMutation.mutate(
      { integrationId, externalId: promotion.external_id, promotionType: "STANDARD_DISCOUNT", items: addPayload },
      {
        onSuccess: (result) => {
          const newErrors: Record<string, string> = {};
          for (const f of result.failed) {
            const found = items.find(i => i.marketplace_item_id === f.marketplaceItemId);
            if (found) newErrors[found.id] = translateMarketplaceError(f.error, marketplaceKey);
          }
          setItemErrors(prev => ({ ...prev, ...newErrors }));
          invalidateAll();
          if (result.failed.length > 0) {
            toast({ variant: "destructive", title: `${result.failed.length} item(s) falharam`, description: "Verifique os erros na tabela." });
          }
        },
      },
    );
  };

  const handleRemoveItem = (itemRow: typeof items[0]) => {
    if (!promotion || !integrationId) return;
    removeMutation.mutate({
      integrationId,
      externalId: promotion.external_id,
      promotionType: promotion.promotion_type,
      mlKind: promotion.ml_kind ?? undefined,
      marketplaceItemId: itemRow.marketplace_item_id,
      variationId: itemRow.variation_id ?? undefined,
    }, { onSuccess: () => invalidateAll() });
  };

  const handleDelete = () => {
    if (!promotion || !integrationId) return;
    deleteMutation.mutate(
      { integrationId, externalId: promotion.external_id, promotionType: promotion.promotion_type, force: "auto" },
      { onSuccess: () => { setDeleteOpen(false); navigate("/anuncios", { replace: true }); } },
    );
  };

  if (!organizationId) return null;

  const wrongType = promotion && promotion.promotion_type !== "STANDARD_DISCOUNT";

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
                  <RefreshCw className="h-8 w-8 animate-spin text-violet-500" />
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
                    <CardDescription>Esta página é para descontos normais (STANDARD_DISCOUNT).</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {!isLoading && promotion && !wrongType && (
                <>
                  {/* ── Header card ───────────────────────────────────── */}
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="p-2.5 bg-violet-100 rounded-lg shrink-0">
                            <Tag className="h-6 w-6 text-violet-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingName ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={nameValue}
                                  onChange={e => setNameValue(e.target.value)}
                                  className="h-8 text-base font-semibold"
                                  autoFocus
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName} disabled={updateMutation.isPending}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)}>
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <h1 className="text-xl font-semibold text-gray-900 truncate">{promotion.name || "Sem nome"}</h1>
                                {isEditable && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingName(true)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <PromotionStatusBadge status={promotion.status} />
                              <Badge variant="outline" className="text-xs">
                                {marketplaceDisplayName} · ID {promotion.external_id}
                              </Badge>
                            </div>

                            {editingDates ? (
                              <div className="flex flex-wrap items-center gap-2 mt-3">
                                <Input type="datetime-local" value={startDateValue} onChange={e => setStartDateValue(e.target.value)} className="h-8 w-48 text-sm" />
                                <span className="text-sm text-muted-foreground">até</span>
                                <Input type="datetime-local" value={endDateValue} onChange={e => setEndDateValue(e.target.value)} className="h-8 w-48 text-sm" />
                                <Button size="sm" variant="ghost" onClick={handleSaveDates} disabled={updateMutation.isPending}>
                                  <Check className="h-3.5 w-3.5 mr-1 text-green-600" /> Salvar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingDates(false)}>
                                  <X className="h-3.5 w-3.5 mr-1 text-red-500" /> Cancelar
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 mt-2">
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(promotion.start_date)} — {formatDate(promotion.finish_date)}
                                </p>
                                {isEditable && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingDates(true)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 shrink-0">
                          <Button variant="outline" size="sm" onClick={handleSync} disabled={!integrationId || syncMutation.isPending}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                            Sincronizar
                          </Button>
                          {isActive && (
                            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                              Encerrar campanha
                            </Button>
                          )}
                          {!isActive && (
                            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── Bulk toolbar ──────────────────────────────────── */}
                  {canAddItems && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Desconto e estoque (aplica aos selecionados)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex border rounded-md overflow-hidden">
                            <button
                              className={`px-3 py-1.5 text-sm transition-colors ${discountMode === "percent" ? "bg-violet-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                              onClick={() => setDiscountMode("percent")}
                            >
                              %
                            </button>
                            <button
                              className={`px-3 py-1.5 text-sm transition-colors border-l ${discountMode === "absolute" ? "bg-violet-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                              onClick={() => setDiscountMode("absolute")}
                            >
                              R$
                            </button>
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-xs text-muted-foreground">
                              {discountMode === "percent" ? "Desconto %" : "Preço promo (R$)"}
                            </Label>
                            <Input
                              type="number"
                              min={discountMode === "percent" ? "1" : "0"}
                              max={discountMode === "percent" ? "99" : undefined}
                              step={discountMode === "percent" ? "1" : "0.01"}
                              value={discountValue}
                              onChange={e => setDiscountValue(e.target.value)}
                              className="h-8 w-28 text-sm"
                              placeholder={discountMode === "percent" ? "Ex: 20" : "Ex: 49.90"}
                            />
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-xs text-muted-foreground">Estoque dedicado</Label>
                            <Input
                              type="number"
                              min="0"
                              value={bulkStock}
                              onChange={e => setBulkStock(e.target.value)}
                              className="h-8 w-24 text-sm"
                              placeholder="Opcional"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-xs text-muted-foreground">Limite/compra</Label>
                            <Input
                              type="number"
                              min="0"
                              value={bulkPurchaseLimit}
                              onChange={e => setBulkPurchaseLimit(e.target.value)}
                              className="h-8 w-24 text-sm"
                              placeholder="Opcional"
                            />
                          </div>
                          {selectedItemIds.size > 0 && (
                            <Button
                              size="sm"
                              className="bg-violet-600 hover:bg-violet-700 text-white"
                              onClick={handleApplyBulk}
                              disabled={updateItemsMutation.isPending || !discountValue}
                            >
                              {updateItemsMutation.isPending ? "Aplicando…" : `Aplicar a ${selectedItemIds.size} item(s)`}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* ── Items in campaign ─────────────────────────────── */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Produtos na campanha</CardTitle>
                      <CardDescription>
                        {items.length} produto(s) · sincronizado em {formatDate(promotion.last_synced_at)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {itemsLoading ? (
                        <div className="flex justify-center py-10">
                          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : items.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                          Nenhum produto ainda. Use o picker abaixo para adicionar.
                        </p>
                      ) : (
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8">
                                  <Checkbox
                                    checked={selectedItemIds.size === items.length && items.length > 0}
                                    onCheckedChange={toggleSelectAll}
                                  />
                                </TableHead>
                                <TableHead>Anúncio</TableHead>
                                <TableHead>Variação</TableHead>
                                <TableHead className="text-right">Preço orig.</TableHead>
                                <TableHead className="text-right">Preço promo</TableHead>
                                <TableHead className="text-right">Desc.</TableHead>
                                <TableHead className="text-right">Estoque</TableHead>
                                <TableHead className="text-right">Limite</TableHead>
                                <TableHead className="w-[72px]" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map(row => {
                                const err = itemErrors[row.id];
                                const discPct = row.original_price && row.deal_price
                                  ? Math.round((1 - row.deal_price / row.original_price) * 100)
                                  : null;
                                return [
                                  <TableRow key={row.id} className={err ? "bg-red-50" : ""}>
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedItemIds.has(row.id)}
                                        onCheckedChange={() => toggleSelectItem(row.id)}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{row.marketplace_item_id}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{row.variation_id ?? "—"}</TableCell>
                                    <TableCell className="text-right text-sm">{formatPrice(row.original_price)}</TableCell>
                                    <TableCell className="text-right text-sm font-medium text-violet-700">{formatPrice(row.deal_price)}</TableCell>
                                    <TableCell className="text-right text-sm">
                                      {discPct != null ? <span className="text-green-600">{discPct}%</span> : "—"}
                                    </TableCell>
                                    <TableCell className="text-right text-sm">{row.promotion_stock ?? "—"}</TableCell>
                                    <TableCell className="text-right text-sm">{row.purchase_limit ?? "—"}</TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-500"
                                        disabled={removeMutation.isPending}
                                        onClick={() => handleRemoveItem(row)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>,
                                  ...(err ? [
                                    <TableRow key={`err-${row.id}`} className="bg-red-50 border-t-0">
                                      <TableCell colSpan={9} className="pt-0 pb-2">
                                        <div className="flex items-center gap-1.5 text-xs text-red-600">
                                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                          {err}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ] : []),
                                ];
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ── Listings Picker ───────────────────────────────── */}
                  {canAddItems && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Adicionar anúncios</CardTitle>
                        <CardDescription>
                          O desconto configurado na toolbar acima será aplicado ao adicionar.
                          Deixe em branco para adicionar sem desconto e configurar depois.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ListingsPicker
                          orgId={organizationId}
                          marketplaceName={marketplaceDisplayName}
                          excludeItemIds={items.map(i => i.marketplace_item_id)}
                          onAdd={handleAddFromPicker}
                          disabled={addItemsMutation.isPending}
                        />
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* ── Delete confirmation ────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive ? "Encerrar campanha?" : "Excluir campanha?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? "A campanha está ativa. Ela será encerrada no marketplace usando end_discount. Esta ação não pode ser desfeita."
                : "A campanha será excluída no marketplace. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleteMutation.isPending || endMutation.isPending}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
