/**
 * ListingsPicker — select anúncios (marketplace_items_raw / marketplace_items_unified) for promotions.
 * Supports search, "anúncios disponíveis" filter, multiselect, and per-variation selection.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useMarketplaceListings, type MarketplaceListing } from "@/hooks/useMarketplaceListings";
import { formatVariationData } from "@/utils/listingUtils";
import { normalizeMarketplaceKey } from "@/utils/marketplaceUtils";

export interface PickerSelection {
  marketplaceItemId: string;
  variationId?: string;
  title: string;
  originalPrice: number | null;
}

interface ListingsPickerProps {
  orgId: string;
  marketplaceName: string;
  excludeItemIds?: string[];
  /** Row keys `itemId` or `itemId::variationId` already added — hide from picker. */
  excludeKeys?: string[];
  /** Called when user clicks "Adicionar X selecionados". */
  onAdd: (selected: PickerSelection[]) => void;
  disabled?: boolean;
}

interface PickerVariationRow {
  model_id: string;
  label: string;
  price: number | null;
  /** Resolved stock for Shopee rules; null = unknown (selection allowed). */
  shopeeStock: number | null;
}

function getThumb(pictures: any): string | null {
  if (!pictures) return null;
  if (Array.isArray(pictures) && pictures[0]) {
    const p = pictures[0];
    return typeof p === "string" ? p : (p?.url ?? p?.image_url ?? null);
  }
  return null;
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Prefer explicit Shopee stock signals; return null if unknown. */
function shopeeRawVariationStock(raw: Record<string, unknown> | undefined): number | null {
  if (!raw) return null;
  const v = raw as Record<string, any>;
  const sum = Number(v?.stock_info_v2?.summary_info?.total_available_stock ?? NaN);
  if (Number.isFinite(sum)) return sum;
  const ns = Number(v?.normal_stock ?? NaN);
  if (Number.isFinite(ns)) return ns;
  const st = Number(typeof v?.stock === "number" ? v.stock : NaN);
  if (Number.isFinite(st)) return st;
  const aq = Number(v?.available_quantity ?? NaN);
  if (Number.isFinite(aq)) return aq;
  return null;
}

function variationsForPicker(listing: MarketplaceListing, isShopee: boolean): PickerVariationRow[] {
  const rawArr = Array.isArray(listing.variations) ? (listing.variations as Record<string, unknown>[]) : [];
  const formatted = formatVariationData(rawArr as any[], listing as Record<string, unknown>);
  if (formatted.length === 0) return [];
  return formatted.map(v => {
    const raw = rawArr.find(
      r =>
        String((r as any).model_id ?? (r as any).variation_id ?? (r as any).id ?? "") === String(v.id),
    );
    const shopeeStock = isShopee ? shopeeRawVariationStock(raw as Record<string, unknown> | undefined) : null;
    return {
      model_id: String(v.id),
      label: v.types.map(t => `${t.name}: ${t.value}`).join(" · ") || v.sku,
      price: v.current_price ?? v.price ?? listing.price,
      shopeeStock,
    };
  });
}

/** Shopee: no-variation row — use listing.available_quantity when present. */
function shopeeSimpleListingOOS(listing: MarketplaceListing): boolean {
  const aq = listing.available_quantity;
  return aq != null && Number(aq) <= 0;
}

export function selectionKey(itemId: string, variationId?: string) {
  return variationId ? `${itemId}::${variationId}` : itemId;
}

export function ListingsPicker({ orgId, marketplaceName, excludeItemIds = [], excludeKeys = [], onAdd, disabled = false }: ListingsPickerProps) {
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [selected, setSelected] = useState<Map<string, PickerSelection>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const isShopee = normalizeMarketplaceKey(marketplaceName) === "shopee";
  /** Shopee: only "available" listings should be selectable; turning off the filter is browse-only. */
  const shopeeSelectionLocked = isShopee && !onlyActive;

  useEffect(() => {
    if (shopeeSelectionLocked) {
      setSelected(new Map());
    }
  }, [shopeeSelectionLocked]);

  const { data: listings = [], isLoading } = useMarketplaceListings({
    orgId,
    marketplaceName,
    search,
    onlyActive,
    excludeItemIds,
  });

  const excludedKeySet = useMemo(() => new Set(excludeKeys), [excludeKeys]);

  const visibleListings = useMemo(() => {
    return listings.filter(listing => {
      const variations = variationsForPicker(listing, isShopee);
      if (variations.length === 0) {
        return !excludedKeySet.has(listing.marketplace_item_id);
      }
      return variations.some(
        v => !excludedKeySet.has(selectionKey(listing.marketplace_item_id, v.model_id)),
      );
    });
  }, [listings, excludedKeySet, isShopee]);

  const variationOOS = (v: PickerVariationRow) => isShopee && v.shopeeStock != null && v.shopeeStock <= 0;

  const toggle = useCallback(
    (listing: MarketplaceListing, variationId?: string, variationPrice?: number | null, blocked?: boolean) => {
      if (blocked) return;
      const key = selectionKey(listing.marketplace_item_id, variationId);
      setSelected(prev => {
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.set(key, {
            marketplaceItemId: listing.marketplace_item_id,
            variationId,
            title: listing.title ?? listing.marketplace_item_id,
            originalPrice: variationPrice ?? listing.price,
          });
        }
        return next;
      });
    },
    [],
  );

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAdd = () => {
    if (selected.size === 0) return;
    onAdd(Array.from(selected.values()));
    setSelected(new Map());
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título, SKU ou ID…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="only-active"
            checked={onlyActive}
            onCheckedChange={v => setOnlyActive(Boolean(v))}
          />
          <Label htmlFor="only-active" className="text-sm cursor-pointer">
            Anúncios disponíveis
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleListings.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {search ? "Nenhum anúncio encontrado para esta busca." : "Nenhum anúncio disponível."}
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto max-h-80 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-10" />
                <TableHead>Anúncio</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleListings.map(listing => {
                const variations = variationsForPicker(listing, isShopee);
                const hasVariations = variations.length > 0;
                const isExpanded = expandedIds.has(listing.marketplace_item_id);
                const key = selectionKey(listing.marketplace_item_id);
                const isSelected = selected.has(key);
                const thumb = getThumb(listing.pictures);
                const simpleOOS = isShopee && !hasVariations && shopeeSimpleListingOOS(listing);

                return [
                  <TableRow
                    key={listing.marketplace_item_id}
                    className={`${isSelected ? "bg-violet-50" : ""} hover:bg-gray-50`}
                  >
                    <TableCell>
                      {!hasVariations && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(listing, undefined, undefined, simpleOOS)}
                          disabled={disabled || simpleOOS || shopeeSelectionLocked}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {thumb ? (
                        <img src={thumb} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-gray-100" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{listing.title ?? "—"}</p>
                        {simpleOOS && (
                          <Badge variant="destructive" className="text-[10px] shrink-0">
                            Sem estoque
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{listing.marketplace_item_id}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{listing.sku ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{formatPrice(listing.price)}</TableCell>
                    <TableCell>
                      {hasVariations && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleExpand(listing.marketplace_item_id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>,

                  ...(hasVariations && isExpanded
                    ? variations
                        .filter(v => !excludedKeySet.has(selectionKey(listing.marketplace_item_id, v.model_id)))
                        .map(v => {
                          const vKey = selectionKey(listing.marketplace_item_id, v.model_id);
                          const vSelected = selected.has(vKey);
                          const oos = variationOOS(v);
                          return (
                            <TableRow key={vKey} className={`${vSelected ? "bg-violet-50" : "bg-gray-50/50"}`}>
                              <TableCell className="pl-6">
                                <Checkbox
                                  checked={vSelected}
                                  onCheckedChange={() => toggle(listing, v.model_id, v.price, oos)}
                                  disabled={disabled || oos || shopeeSelectionLocked}
                                />
                              </TableCell>
                              <TableCell />
                              <TableCell colSpan={2}>
                                <div className="flex flex-wrap items-center gap-2 pl-2">
                                  <p className="text-xs text-muted-foreground">{v.label}</p>
                                  {oos && (
                                    <Badge variant="destructive" className="text-[10px] shrink-0">
                                      Sem estoque
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs">{formatPrice(v.price ?? listing.price)}</TableCell>
                              <TableCell />
                            </TableRow>
                          );
                        })
                    : []),
                ];
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-muted-foreground">
          {selected.size > 0 ? `${selected.size} selecionado(s)` : "Nenhum selecionado"}
        </p>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={selected.size === 0 || disabled || shopeeSelectionLocked}
          onClick={handleAdd}
        >
          Adicionar {selected.size > 0 ? `${selected.size}` : ""} selecionado(s)
        </Button>
      </div>
    </div>
  );
}
