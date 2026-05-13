/**
 * Create standard discount — single page: basic info + product selection, then Confirm.
 * Route: /anuncios/promocoes/nova?marketplace=<displayName>
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Tag, Trash2, AlertCircle } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  createStandardDiscount,
  addItemsToPromotion,
  promotionKeys,
} from "@/services/promotions.service";
import { validateStandardDiscount } from "@/components/promotions/validators";
import { normalizeMarketplaceKey, marketplaceListingsDataTable } from "@/utils/marketplaceUtils";
import { supabase } from "@/integrations/supabase/client";
import {
  ListingsPicker,
  selectionKey,
  type PickerSelection,
} from "@/components/promotions/ListingsPicker";
import { PromoDateTimeField } from "@/components/promotions/PromoDateTimePopover";

const DEFAULT_PICKER_DISCOUNT_PCT = 10;

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

type DraftRow = {
  rowKey: string;
  marketplaceItemId: string;
  variationId?: string;
  title: string;
  thumb: string | null;
  originalPrice: number | null;
  dealPrice: string;
  discountPercent: string;
  promotionStock: string;
  purchaseLimit: string;
};

function pickerToDraft(s: PickerSelection, pictures: unknown, defaultPct: number): DraftRow {
  const rowKey = selectionKey(s.marketplaceItemId, s.variationId);
  const orig = s.originalPrice;
  const pct = Math.min(99, Math.max(0, defaultPct));
  const deal =
    orig != null ? String(Math.round(orig * (100 - pct)) / 100) : "";
  return {
    rowKey,
    marketplaceItemId: s.marketplaceItemId,
    variationId: s.variationId,
    title: s.title,
    thumb: getThumb(pictures),
    originalPrice: orig,
    dealPrice: deal,
    discountPercent: String(pct),
    promotionStock: "",
    purchaseLimit: "",
  };
}

export default function PromotionCreate() {
  const { organizationId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const marketplaceDisplayName = searchParams.get("marketplace") ?? "Shopee";
  const isShopee = marketplaceDisplayName.toLowerCase() === "shopee";
  const marketplaceKey = normalizeMarketplaceKey(marketplaceDisplayName);
  const nameMax = isShopee ? 150 : 60;

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [bulkPct, setBulkPct] = useState("");
  const [selectedBulk, setSelectedBulk] = useState<Set<string>>(new Set());

  const { data: integrationId } = useQuery({
    queryKey: ["integration-id", organizationId, marketplaceDisplayName],
    queryFn: () => fetchIntegrationId(organizationId!, marketplaceDisplayName),
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
  });

  const excludeKeys = useMemo(() => draftRows.map(r => r.rowKey), [draftRows]);

  const mutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      startDate: string;
      endDate: string;
      rows: DraftRow[];
    }) => {
      if (!organizationId || !integrationId) throw new Error("Dados incompletos");
      const promo = await createStandardDiscount({
        organizationId,
        integrationId,
        name: payload.name.trim(),
        startDate: payload.startDate,
        endDate: payload.endDate,
      });
      if (payload.rows.length === 0) return promo;

      const items = payload.rows.map(r => {
        const deal = parseMoneyInput(r.dealPrice);
        const pct = parseFloat(r.discountPercent.replace(",", "."));
        const stock = r.promotionStock.trim() ? parseInt(r.promotionStock, 10) : undefined;
        const limit = r.purchaseLimit.trim() ? parseInt(r.purchaseLimit, 10) : undefined;
        if (deal != null && deal > 0 && (r.originalPrice == null || deal < r.originalPrice)) {
          return {
            marketplaceItemId: r.marketplaceItemId,
            variationId: r.variationId,
            dealPrice: deal,
            promotionStock: Number.isFinite(stock) ? stock : undefined,
            purchaseLimit: Number.isFinite(limit) ? limit : undefined,
          };
        }
        if (Number.isFinite(pct) && pct > 0 && pct < 100) {
          return {
            marketplaceItemId: r.marketplaceItemId,
            variationId: r.variationId,
            discountPercent: pct,
            promotionStock: Number.isFinite(stock) ? stock : undefined,
            purchaseLimit: Number.isFinite(limit) ? limit : undefined,
          };
        }
        throw new Error(`Defina preço com desconto ou % válidos para: ${r.title}`);
      });

      const result = await addItemsToPromotion({
        integrationId,
        externalId: promo.external_id,
        promotionType: "STANDARD_DISCOUNT",
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
      return promo;
    },
    onSuccess: promo => {
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(organizationId!, marketplaceKey) });
      toast({ title: "Promoção criada", description: "Campanha salva no marketplace e na Novura." });
      navigate(`/anuncios/promocoes/${promo.id}?marketplace=${encodeURIComponent(marketplaceDisplayName)}`, { replace: true });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao confirmar", description: err.message });
    },
  });

  /** Merge listing pictures from a lightweight fetch */
  const handlePickerAddWithListings = useCallback(
    async (selected: PickerSelection[]) => {
      const def = DEFAULT_PICKER_DISCOUNT_PCT;
      const ids = [...new Set(selected.map(s => s.marketplaceItemId))];
      const picMap = new Map<string, unknown>();
      if (organizationId && ids.length) {
        const table = marketplaceListingsDataTable(marketplaceDisplayName);
        const primary = await (supabase as any)
          .from(table)
          .select("marketplace_item_id, pictures")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", marketplaceDisplayName)
          .in("marketplace_item_id", ids);
        let data = primary.data;
        if (primary.error) {
          const leg = await (supabase as any)
            .from("marketplace_items")
            .select("marketplace_item_id, pictures")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", marketplaceDisplayName)
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
          map.set(k, pickerToDraft(s, pics, def));
        }
        return Array.from(map.values());
      });
    },
    [organizationId, marketplaceDisplayName],
  );

  const updateRow = (rowKey: string, patch: Partial<DraftRow>) => {
    setDraftRows(rows =>
      rows.map(r => {
        if (r.rowKey !== rowKey) return r;
        const next = { ...r, ...patch };
        if ("discountPercent" in patch && r.originalPrice != null) {
          const p = parseFloat(String(patch.discountPercent).replace(",", "."));
          if (Number.isFinite(p) && p > 0 && p < 100) {
            next.dealPrice = String(Math.round(r.originalPrice * (100 - p)) / 100);
          }
        }
        if ("dealPrice" in patch && r.originalPrice != null) {
          const d = parseMoneyInput(String(patch.dealPrice));
          if (d != null && r.originalPrice > 0) {
            next.discountPercent = String(
              Math.min(99, Math.max(0, Math.round((1 - d / r.originalPrice) * 100))),
            );
          }
        }
        return next;
      }),
    );
  };

  const removeRow = (rowKey: string) => {
    setDraftRows(rows => rows.filter(r => r.rowKey !== rowKey));
    setSelectedBulk(s => {
      const n = new Set(s);
      n.delete(rowKey);
      return n;
    });
  };

  const applyBulkPct = () => {
    const p = parseFloat(bulkPct.replace(",", "."));
    if (!Number.isFinite(p) || p <= 0 || p >= 100) return;
    setDraftRows(rows =>
      rows.map(r => {
        if (!selectedBulk.has(r.rowKey)) return r;
        if (r.originalPrice == null) return { ...r, discountPercent: String(p) };
        const deal = Math.round(r.originalPrice * (100 - p)) / 100;
        return { ...r, discountPercent: String(p), dealPrice: String(deal) };
      }),
    );
  };

  const toggleBulk = (rowKey: string) => {
    setSelectedBulk(prev => {
      const n = new Set(prev);
      if (n.has(rowKey)) {
        n.delete(rowKey);
      } else {
        n.add(rowKey);
      }
      return n;
    });
  };

  const toggleBulkAll = () => {
    setSelectedBulk(prev =>
      prev.size === draftRows.length ? new Set() : new Set(draftRows.map(r => r.rowKey)),
    );
  };

  const handleConfirm = () => {
    const validationErrors = validateStandardDiscount({ name, startDate, endDate, isShopee });
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    mutation.mutate({
      name,
      startDate,
      endDate,
      rows: draftRows,
    });
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
                  <Tag className="h-6 w-6 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Novo desconto — {marketplaceDisplayName}</h1>
                  <p className="text-sm text-muted-foreground">
                    Preencha as informações da campanha, inclua anúncios e confirme para criar no canal.
                  </p>
                </div>
              </div>

              {!integrationId && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Nenhuma integração ativa para {marketplaceDisplayName}.
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

              {/* Informações básicas */}
              <Card className="border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">Informações básicas</CardTitle>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                      Rascunho local
                    </Badge>
                  </div>
                  <CardDescription>Defina o nome interno e o período da campanha.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-name">Nome da promoção de desconto</Label>
                    <Input
                      id="promo-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex: Campanha Maio 2026"
                      maxLength={nameMax}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {name.trim().length}/{nameMax}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PromoDateTimeField label="Início" value={startDate} onChange={setStartDate} id="start-date" />
                    <PromoDateTimeField label="Fim" value={endDate} onChange={setEndDate} id="end-date" />
                  </div>
                </CardContent>
              </Card>

              {/* Produtos */}
              <Card className="border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Produtos da promoção de desconto</CardTitle>
                  <CardDescription>Busque anúncios sincronizados e adicione à lista. Ajuste preço ou % por linha.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {integrationId && organizationId && (
                    <ListingsPicker
                      orgId={organizationId}
                      marketplaceName={marketplaceDisplayName}
                      excludeKeys={excludeKeys}
                      onAdd={handlePickerAddWithListings}
                      disabled={mutation.isPending}
                    />
                  )}

                  <Separator />

                  {draftRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-muted/40 border">
                        <Label className="text-xs text-muted-foreground w-full sm:w-auto">Aplicar % aos selecionados</Label>
                        <Input
                          className="w-24 h-9"
                          placeholder="%"
                          value={bulkPct}
                          onChange={e => setBulkPct(e.target.value)}
                        />
                        <Button type="button" size="sm" variant="secondary" onClick={applyBulkPct}>
                          Aplicar
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {selectedBulk.size} linha(s) selecionada(s)
                        </span>
                      </div>

                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">
                                <Checkbox
                                  checked={draftRows.length > 0 && selectedBulk.size === draftRows.length}
                                  onCheckedChange={toggleBulkAll}
                                />
                              </TableHead>
                              <TableHead>Produto</TableHead>
                              <TableHead className="text-right">Preço original</TableHead>
                              <TableHead className="text-right">Preço com desconto</TableHead>
                              <TableHead className="text-right">% OFF</TableHead>
                              <TableHead className="w-24">Estoque promo</TableHead>
                              <TableHead className="w-24">Limite</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {draftRows.map(r => (
                              <TableRow key={r.rowKey}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedBulk.has(r.rowKey)}
                                    onCheckedChange={() => toggleBulk(r.rowKey)}
                                  />
                                </TableCell>
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
                                <TableCell className="text-right">
                                  <Input
                                    className="h-8 w-20 text-right ml-auto"
                                    value={r.discountPercent}
                                    onChange={e => updateRow(r.rowKey, { discountPercent: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-8 w-20"
                                    placeholder="opc."
                                    value={r.promotionStock}
                                    onChange={e => updateRow(r.rowKey, { promotionStock: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-8 w-20"
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
                    </div>
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
              disabled={mutation.isPending || !integrationId || !name.trim() || !startDate || !endDate}
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
