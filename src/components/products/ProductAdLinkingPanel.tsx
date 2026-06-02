/**
 * Presentational panel for product ↔ ad linking.
 * All data fetching and mutations delegated to useAdLinks + productAdLinks.service.
 * Derive helpers extracted to adLinkingMapping.ts.
 *
 * EXPORTED TYPES preserved at same import path (public contract — do not move):
 *   IntegrationOption, MarketplaceItem, ExistingLink
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { Link, Search, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useAdLinks } from "@/hooks/products/useAdLinks";
import { fetchMarketplaceItemsForAdLinking } from "@/services/productAdLinks.service";
import { marketplaceKeysEqual, normalizeMarketplaceKey } from "@/utils/marketplaceName";
import { marketplaceDisplayNameFromSlug, marketplaceSlugify } from "@/utils/listingUtils";
import {
  getThumbnail,
  deriveSku,
  buildVariationLabel,
  normalizeSearchValue,
  ALL_MARKETPLACES_VALUE,
} from "@/utils/products/adLinkingMapping";

// ─── Exported types — public contract, must remain here ───────────────────────
export interface IntegrationOption {
  value: string;
  label: string;
  canonicalKey: string;
}

export interface MarketplaceItem {
  id: string;
  marketplace_item_id: string;
  title: string;
  sku?: string;
  modelId?: string;
  thumbnail?: string;
  marketplace_name: string;
  variation_id?: string;
  updated_at?: string;
}

export interface ExistingLink {
  marketplace_name: string;
  marketplace_item_id: string;
  variation_id?: string;
}
// ──────────────────────────────────────────────────────────────────────────────

interface ProductAdLinkingPanelProps {
  productId: string | null;
  allowMutations?: boolean;
  onLinksMutation?: () => void;
}

export function ProductAdLinkingPanel({ productId, allowMutations = true, onLinksMutation }: ProductAdLinkingPanelProps) {
  const { organizationId } = useAuth();

  const {
    existingLinks,
    activeDbMarketplaceNames,
    integrationsQueryDone,
    linking,
    handleLink,
    handleUnlink,
  } = useAdLinks(productId, organizationId, allowMutations, onLinksMutation);

  const [selectedIntegrationValue, setSelectedIntegrationValue] = useState<string>("");
  const [search, setSearch] = useState("");
  const [allListingCandidates, setAllListingCandidates] = useState<MarketplaceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsQueryDone, setItemsQueryDone] = useState(false);
  const fetchGenerationRef = useRef(0);

  const availableIntegrations = useMemo((): IntegrationOption[] => {
    const marketplaceNames = [
      ...activeDbMarketplaceNames,
      ...allListingCandidates.map((item) => item.marketplace_name),
    ];
    if (!marketplaceNames.length) return [];
    const byKey = new Map<string, string>();
    for (const name of marketplaceNames) {
      const k = normalizeMarketplaceKey(name);
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, name);
    }
    const channelOptions = Array.from(byKey.entries())
      .map(([canonicalKey, sampleName]) => ({
        value: canonicalKey,
        label: marketplaceDisplayNameFromSlug(marketplaceSlugify(sampleName)),
        canonicalKey,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    if (channelOptions.length <= 1) return channelOptions;
    return [{ value: ALL_MARKETPLACES_VALUE, label: "Todos os canais", canonicalKey: ALL_MARKETPLACES_VALUE }, ...channelOptions];
  }, [activeDbMarketplaceNames, allListingCandidates]);

  const effectiveIntegrationValue = useMemo(() => {
    if (availableIntegrations.length === 0) return "";
    if (availableIntegrations.some((i) => i.value === selectedIntegrationValue)) return selectedIntegrationValue;
    return availableIntegrations[0].value;
  }, [availableIntegrations, selectedIntegrationValue]);

  useEffect(() => {
    if (availableIntegrations.length === 0) setSelectedIntegrationValue("");
  }, [availableIntegrations.length]);

  useEffect(() => {
    if (availableIntegrations.length === 0) return;
    if (!availableIntegrations.some((i) => i.value === selectedIntegrationValue)) {
      setSelectedIntegrationValue(availableIntegrations[0].value);
    }
  }, [availableIntegrations, selectedIntegrationValue]);

  useEffect(() => {
    if (!organizationId) { setAllListingCandidates([]); setItemsQueryDone(false); return; }
    const generation = ++fetchGenerationRef.current;
    const load = async () => {
      setItemsLoading(true); setItemsQueryDone(false);
      try {
        const { rows, error } = await fetchMarketplaceItemsForAdLinking(organizationId, 500);
        if (generation !== fetchGenerationRef.current) return;
        if (error) { setAllListingCandidates([]); return; }
        const flattened: MarketplaceItem[] = [];
        const flattenedKeys = new Set<string>();
        const makeItemKey = (mn: string, mid: string, vk: string) =>
          `${normalizeMarketplaceKey(mn) || mn}::${mid}::${vk || "root"}`;
        const pushFlattened = (item: MarketplaceItem) => {
          if (!item.marketplace_item_id || !item.marketplace_name) return;
          if (flattenedKeys.has(item.id)) return;
          flattenedKeys.add(item.id);
          flattened.push(item);
        };
        rows.forEach((item: any) => {
          const pictures = Array.isArray(item?.pictures) ? item.pictures : [];
          const variations = Array.isArray(item?.variations) ? item.variations : [];
          const marketplaceName = String(item.marketplace_name || "");
          const marketplaceItemId = String(item.marketplace_item_id || "");
          if (variations.length > 0) {
            variations.forEach((variation: any, index: number) => {
              const variationId = variation?.model_id != null ? String(variation.model_id)
                : variation?.id != null ? String(variation.id)
                : variation?.variation_id != null ? String(variation.variation_id) : "";
              const suffix = buildVariationLabel(variation);
              const sku = deriveSku(item, variation);
              const variationKey = variationId || sku || suffix || `variation_${index}`;
              pushFlattened({
                id: makeItemKey(marketplaceName, marketplaceItemId, variationKey),
                marketplace_item_id: marketplaceItemId,
                marketplace_name: marketplaceName,
                title: suffix ? `${item.title || "Anúncio"} — ${suffix}` : String(item.title || "Anúncio"),
                sku,
                modelId: variation?.model_id != null ? String(variation.model_id) : undefined,
                thumbnail: getThumbnail(item, variation, pictures) || (typeof item.thumbnail === "string" ? item.thumbnail : ""),
                variation_id: variationId,
                updated_at: item.updated_at ? String(item.updated_at) : undefined,
              });
            });
            return;
          }
          pushFlattened({
            id: makeItemKey(marketplaceName, marketplaceItemId, ""),
            marketplace_item_id: marketplaceItemId,
            marketplace_name: marketplaceName,
            title: String(item.title || "Anúncio"),
            sku: String(item.sku || ""),
            thumbnail: getThumbnail(item, {}, pictures) || (typeof item.thumbnail === "string" ? item.thumbnail : ""),
            variation_id: "",
            updated_at: item.updated_at ? String(item.updated_at) : undefined,
          });
        });
        if (generation !== fetchGenerationRef.current) return;
        setAllListingCandidates(flattened);
      } catch (err) {
        console.error("Error loading marketplace items:", err);
        if (generation === fetchGenerationRef.current) setAllListingCandidates([]);
      } finally {
        if (generation === fetchGenerationRef.current) { setItemsLoading(false); setItemsQueryDone(true); }
      }
    };
    void load();
  }, [organizationId]);

  const isLinked = (item: MarketplaceItem) =>
    existingLinks.some(
      (l) =>
        l.marketplace_item_id === item.marketplace_item_id &&
        marketplaceKeysEqual(l.marketplace_name, item.marketplace_name) &&
        String(l.variation_id || "") === String(item.variation_id || "")
    );

  const items = useMemo(() => {
    const linkedRank = (it: MarketplaceItem) => (isLinked(it) ? 1 : 0);
    const byMarketplace = !effectiveIntegrationValue ? []
      : effectiveIntegrationValue === ALL_MARKETPLACES_VALUE ? allListingCandidates
      : allListingCandidates.filter((i) => normalizeMarketplaceKey(i.marketplace_name) === effectiveIntegrationValue);
    const term = normalizeSearchValue(search.trim());
    const filtered = !term ? byMarketplace : byMarketplace.filter((i) => {
      const searchable = [i.title, i.sku, i.modelId, i.marketplace_item_id, i.marketplace_name, i.variation_id]
        .map(normalizeSearchValue).join(" ");
      return searchable.includes(term);
    });
    return [...filtered].sort((a, b) => {
      const r = linkedRank(b) - linkedRank(a);
      if (r !== 0) return r;
      return new Date(String(b.updated_at || 0)).getTime() - new Date(String(a.updated_at || 0)).getTime();
    });
  }, [allListingCandidates, existingLinks, effectiveIntegrationValue, search]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:gap-2">
        {!integrationsQueryDone && !itemsQueryDone ? (
          <p className="text-sm text-muted-foreground w-full sm:w-52 shrink-0 py-2">Carregando integrações…</p>
        ) : availableIntegrations.length === 0 ? (
          <p className="text-sm text-muted-foreground w-full sm:w-52 shrink-0 py-2">
            Nenhuma integração conectada. Conecte canais em Aplicativos.
          </p>
        ) : (
          <Select value={effectiveIntegrationValue} onValueChange={(v) => { setSelectedIntegrationValue(v); setSearch(""); }}>
            <SelectTrigger className="w-full sm:w-52 shrink-0"><SelectValue placeholder="Marketplace" /></SelectTrigger>
            <SelectContent position="item-aligned" className="z-[10050]">
              {availableIntegrations.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input placeholder="Buscar por título, SKU ou ID do anúncio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>
      <Separator className="shrink-0" />
      <ScrollArea className="min-h-0 flex-1">
        {itemsLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <div className="w-5 h-5 border-2 border-violet-600/30 border-t-violet-600 rounded-full animate-spin mr-2" />
            Carregando anúncios do módulo…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
            <ExternalLink className="w-8 h-8" />
            <p className="text-sm text-center px-4">Nenhum anúncio encontrado para este marketplace.</p>
            <p className="text-xs text-center px-4 text-gray-500">Sincronize anúncios no módulo Anúncios ou troque o filtro acima.</p>
          </div>
        ) : (
          <div className="space-y-2 pr-3">
            {items.map((item) => {
              const linked = isLinked(item);
              return (
                <div key={item.id} className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-colors ${linked ? "border-green-200 bg-green-50" : "border-gray-100 hover:border-violet-200 hover:bg-violet-50"}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center"><ExternalLink className="w-4 h-4 text-gray-300" /></div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                        <span className="text-xs text-gray-500">ID: {item.marketplace_item_id}</span>
                        {item.sku ? <span className="text-xs text-gray-400">SKU: {item.sku}</span> : null}
                        {item.modelId ? <span className="text-xs text-gray-400">id_model: {item.modelId}</span> : null}
                        {item.variation_id && !item.modelId ? <span className="text-xs text-gray-400">Variação: {item.variation_id}</span> : null}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button" size="sm" variant={linked ? "ghost" : "default"}
                    className={linked ? "text-green-600 hover:text-red-600 gap-1 shrink-0" : "bg-violet-700 hover:bg-violet-800 text-white gap-1 shrink-0"}
                    disabled={linking === item.id}
                    onClick={() => linked
                      ? handleUnlink({ marketplace_name: item.marketplace_name, marketplace_item_id: item.marketplace_item_id, variation_id: item.variation_id || "" })
                      : handleLink(item)
                    }
                  >
                    {linking === item.id ? <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : linked ? <><CheckCircle2 className="w-3.5 h-3.5" />Vinculado</> : <><Link className="w-3.5 h-3.5" />Vincular</>}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
