/**
 * Shopee shop flash sale — create campaign (time slot) and optionally add listings in one flow.
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, RefreshCw, Trash2, Zap, AlertCircle, Calendar as CalendarPickerIcon } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useShopeeFlashSlots } from "@/hooks/usePromotions";
import { supabase } from "@/integrations/supabase/client";
import {
  createShopeeFlashSale,
  fetchPromotionById,
  addItemsToPromotion,
  promotionKeys,
} from "@/services/promotions.service";
import { normalizeMarketplaceKey, marketplaceListingsDataTable } from "@/utils/marketplaceUtils";
import {
  ListingsPicker,
  selectionKey,
  type PickerSelection,
} from "@/components/promotions/ListingsPicker";
import { ShopeeFlashSlotPickerDialog } from "@/components/promotions/ShopeeFlashSlotPickerDialog";

const SHOPEE_DISPLAY = "Shopee";
const DEFAULT_FLASH_DISCOUNT_PCT = 10;

async function fetchIntegrationId(orgId: string, marketplaceName: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("marketplace_integrations")
    .select("id")
    .eq("organizations_id", orgId)
    .eq("marketplace_name", marketplaceName)
    .is("deactivated_at", null)
    .limit(1)
    .single();
  return data?.id ?? null;
}

function formatSlotTime(iso: string): string {
  try {
    return format(new Date(iso), "dd/MM/yy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

function getThumb(pictures: unknown): string | null {
  if (!pictures || !Array.isArray(pictures) || !pictures[0]) return null;
  const p = pictures[0] as any;
  return typeof p === "string" ? p : (p?.url ?? p?.image_url ?? null);
}

function parseMoneyInput(s: string): number | null {
  let t = s.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
  } else if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

type FlashDraftRow = {
  rowKey: string;
  marketplaceItemId: string;
  variationId?: string;
  title: string;
  thumb: string | null;
  originalPrice: number | null;
  dealPrice: string;
  promotionStock: string;
  purchaseLimit: string;
};

function pickerToFlashRow(s: PickerSelection, pictures: unknown, defaultPct: number): FlashDraftRow {
  const rowKey = selectionKey(s.marketplaceItemId, s.variationId);
  const orig = s.originalPrice;
  const pct = Math.min(99, Math.max(1, defaultPct));
  const deal = orig != null ? String(Math.round(orig * (100 - pct)) / 100) : "";
  return {
    rowKey,
    marketplaceItemId: s.marketplaceItemId,
    variationId: s.variationId,
    title: s.title,
    thumb: getThumb(pictures),
    originalPrice: orig,
    dealPrice: deal,
    promotionStock: "",
    purchaseLimit: "",
  };
}

export default function ShopeeFlashSaleCreate() {
  const { organizationId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [draftRows, setDraftRows] = useState<FlashDraftRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);

  const { data: integrationId } = useQuery({
    queryKey: ["integration-id", organizationId, SHOPEE_DISPLAY],
    queryFn: () => fetchIntegrationId(organizationId!, SHOPEE_DISPLAY),
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: slots = [], isLoading: slotsLoading } = useShopeeFlashSlots(integrationId ?? null);
  const marketplaceKey = normalizeMarketplaceKey(SHOPEE_DISPLAY);

  const selectedSlotSummary = useMemo(() => {
    if (!selectedSlotId) return null;
    const s = slots.find(x => x.slotId === selectedSlotId);
    if (!s) return null;
    return `${formatSlotTime(s.startTime)} → ${formatSlotTime(s.endTime)}`;
  }, [selectedSlotId, slots]);

  const excludeKeys = useMemo(() => draftRows.map(r => r.rowKey), [draftRows]);

  const handlePickerAddWithListings = useCallback(
    async (selected: PickerSelection[]) => {
      const def = DEFAULT_FLASH_DISCOUNT_PCT;
      const ids = [...new Set(selected.map(s => s.marketplaceItemId))];
      const picMap = new Map<string, unknown>();
      if (organizationId && ids.length) {
        const table = marketplaceListingsDataTable(SHOPEE_DISPLAY);
        const primary = await (supabase as any)
          .from(table)
          .select("marketplace_item_id, pictures")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", SHOPEE_DISPLAY)
          .in("marketplace_item_id", ids);
        let data = primary.data;
        if (primary.error) {
          const leg = await (supabase as any)
            .from("marketplace_items")
            .select("marketplace_item_id, pictures")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", SHOPEE_DISPLAY)
            .in("marketplace_item_id", ids);
          if (!leg.error) data = leg.data;
        }
        for (const row of data ?? []) {
          picMap.set(String(row.marketplace_item_id), row.pictures);
        }
      }
      setDraftRows(prev => {
        const map = new Map(prev.map(r => [r.rowKey, r]));
        for (const s of selected) {
          const k = selectionKey(s.marketplaceItemId, s.variationId);
          if (map.has(k)) continue;
          const pics = picMap.get(s.marketplaceItemId);
          map.set(k, pickerToFlashRow(s, pics, def));
        }
        return Array.from(map.values());
      });
    },
    [organizationId],
  );

  const updateRow = (rowKey: string, patch: Partial<FlashDraftRow>) => {
    setDraftRows(rows => rows.map(r => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  };

  const removeRow = (rowKey: string) => {
    setDraftRows(rows => rows.filter(r => r.rowKey !== rowKey));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !integrationId) throw new Error("Dados incompletos");
      const { promotionId } = await createShopeeFlashSale({
        integrationId,
        name: name.trim(),
        slotId: selectedSlotId,
      });
      const promo = await fetchPromotionById(organizationId, promotionId);
      if (!promo?.external_id) {
        throw new Error("Campanha criada, mas não foi possível obter o ID externo para adicionar anúncios.");
      }

      if (draftRows.length > 0) {
        const items = draftRows.map(r => {
          const deal = parseMoneyInput(r.dealPrice);
          const stock = r.promotionStock.trim() ? parseInt(r.promotionStock, 10) : undefined;
          const limit = r.purchaseLimit.trim() ? parseInt(r.purchaseLimit, 10) : undefined;
          if (deal == null || deal <= 0) {
            throw new Error(`Defina um preço flash válido para: ${r.title}`);
          }
          if (r.originalPrice != null && deal >= r.originalPrice) {
            throw new Error(`O preço flash deve ser menor que o original: ${r.title}`);
          }
          return {
            marketplaceItemId: r.marketplaceItemId,
            variationId: r.variationId,
            dealPrice: deal,
            promotionStock: Number.isFinite(stock) ? stock : undefined,
            purchaseLimit: Number.isFinite(limit) ? limit : undefined,
          };
        });

        const result = await addItemsToPromotion({
          integrationId,
          externalId: promo.external_id,
          promotionType: "FLASH_SALE",
          items,
        });
        if (result.failed.length > 0) {
          const msg = result.failed.map(f => f.error).join("; ");
          toast({
            title: "Campanha criada com avisos",
            description: `${result.failed.length} item(ns) falharam: ${msg}`,
            variant: "destructive",
          });
        }
      }
      return promotionId;
    },
    onSuccess: promotionId => {
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(organizationId!, marketplaceKey) });
      toast({
        title: "Oferta relâmpago criada",
        description: "Redirecionando para a campanha.",
      });
      navigate(`/anuncios/promocoes/shopee/flash/${promotionId}`, { replace: true });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao confirmar", description: err.message });
    },
  });

  const handleConfirm = () => {
    const nextErrors: string[] = [];
    if (!name.trim() || name.trim().length < 2) {
      nextErrors.push("Informe um nome com pelo menos 2 caracteres.");
    }
    if (!selectedSlotId) {
      nextErrors.push("Selecione um horário (slot) da Shopee.");
    }
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors([]);
    mutation.mutate();
  };

  if (!organizationId) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <GlobalHeader />
          <main className="flex-1 p-6 overflow-auto pb-28">
            <div className="max-w-5xl mx-auto space-y-6">
              <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate("/anuncios")}>
                <ArrowLeft className="h-4 w-4" />
                Voltar para Anúncios
              </Button>

              <div className="flex flex-wrap items-center gap-3">
                <div className="p-2.5 bg-violet-100 rounded-lg">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Nova oferta relâmpago — Shopee</h1>
                  <p className="text-sm text-muted-foreground">
                    Escolha o slot liberado pela Shopee, opcionalmente inclua anúncios e confirme.
                  </p>
                </div>
              </div>

              {!integrationId && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Conecte a Shopee em integrações para criar ofertas relâmpago.
                </p>
              )}

              {errors.length > 0 && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <ul className="text-sm text-red-700 space-y-1">
                    {errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Card className="border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">Campanha</CardTitle>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                      Rascunho local
                    </Badge>
                  </div>
                  <CardDescription>
                    A Shopee define a janela de tempo; os critérios de preço e estoque do slot aparecem em cada opção.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="fs-name">Nome da campanha</Label>
                    <Input
                      id="fs-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex: Flash sábado manhã"
                      maxLength={60}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <Label className="text-sm font-medium text-gray-900">Período de tempo</Label>
                        {selectedSlotSummary ? (
                          <p className="text-sm text-muted-foreground mt-1 tabular-nums">{selectedSlotSummary}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-1">Nenhum período selecionado.</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0 gap-2 rounded-xl border-primary/50 text-primary bg-white hover:bg-primary/10 hover:text-primary shadow-sm h-11 px-4"
                        disabled={slotsLoading || slots.length === 0 || !integrationId}
                        onClick={() => setSlotPickerOpen(true)}
                      >
                        <CalendarPickerIcon className="h-4 w-4 shrink-0" />
                        Selecionar período de tempo
                      </Button>
                    </div>

                    {slotsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                        Carregando horários disponíveis…
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 border rounded-lg px-3 bg-muted/30">
                        Nenhum slot disponível no momento. A Shopee libera janelas periodicamente — tente mais tarde ou
                        sincronize a aba Promoções.
                      </p>
                    ) : null}

                    <ShopeeFlashSlotPickerDialog
                      open={slotPickerOpen}
                      onOpenChange={setSlotPickerOpen}
                      slots={slots}
                      selectedSlotId={selectedSlotId}
                      onConfirm={setSelectedSlotId}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Anúncios na oferta</CardTitle>
                  <CardDescription>
                    Opcional. Busque anúncios ativos, ajuste o preço flash e o estoque reservado por linha antes de
                    confirmar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {integrationId && organizationId && (
                    <ListingsPicker
                      orgId={organizationId}
                      marketplaceName={SHOPEE_DISPLAY}
                      excludeKeys={excludeKeys}
                      onAdd={handlePickerAddWithListings}
                      disabled={mutation.isPending}
                    />
                  )}

                  <Separator />

                  {draftRows.length > 0 ? (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Anúncio</TableHead>
                            <TableHead className="text-right">Preço original</TableHead>
                            <TableHead className="text-right">Preço flash</TableHead>
                            <TableHead className="w-28">Estoque promo</TableHead>
                            <TableHead className="w-28">Limite compra</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {draftRows.map(r => (
                            <TableRow key={r.rowKey}>
                              <TableCell>
                                <div className="flex items-center gap-2 min-w-[180px]">
                                  {r.thumb ? (
                                    <img src={r.thumb} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                                  ) : (
                                    <div className="h-9 w-9 rounded bg-muted shrink-0" />
                                  )}
                                  <div>
                                    <p className="text-sm font-medium line-clamp-2">{r.title}</p>
                                    {r.variationId && (
                                      <p className="text-xs text-muted-foreground">Var. {r.variationId}</p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {r.originalPrice != null
                                  ? r.originalPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  className="h-8 w-28 text-right ml-auto"
                                  value={r.dealPrice}
                                  onChange={e => updateRow(r.rowKey, { dealPrice: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8 w-24"
                                  placeholder="opc."
                                  value={r.promotionStock}
                                  onChange={e => updateRow(r.rowKey, { promotionStock: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8 w-24"
                                  placeholder="opc."
                                  value={r.purchaseLimit}
                                  onChange={e => updateRow(r.rowKey, { purchaseLimit: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => removeRow(r.rowKey)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg bg-muted/20">
                      Nenhum anúncio na lista. Você pode confirmar só a campanha e adicionar produtos depois na página da
                      oferta.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>

          <footer className="sticky bottom-0 z-20 border-t bg-white/95 backdrop-blur px-6 py-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate("/anuncios")}>
              Cancelar
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[120px]"
              disabled={mutation.isPending || !integrationId || !name.trim() || !selectedSlotId}
              onClick={handleConfirm}
            >
              {mutation.isPending ? "Salvando…" : "Confirmar"}
            </Button>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
