import { useState, useEffect, useMemo, useRef } from "react";
import { Link, Search, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchMarketplaceItemsForAdLinking } from "@/services/productAdLinks.service";
import { getCompanyIdForOrg } from "@/services/supabase-helpers";
import { marketplaceKeysEqual, normalizeMarketplaceKey } from "@/utils/marketplaceName";
import { marketplaceDisplayNameFromSlug, marketplaceSlugify } from "@/utils/listingUtils";

export interface IntegrationOption {
  /** Canonical filter key (same as marketplace_keys used for listing rows) */
  value: string;
  label: string;
  canonicalKey: string;
}

const ALL_MARKETPLACES_VALUE = "__all_marketplaces__";

const normalizeSearchValue = (value: unknown): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export interface MarketplaceItem {
  id: string;
  marketplace_item_id: string;
  title: string;
  sku?: string;
  modelId?: string;
  thumbnail?: string;
  marketplace_name: string;
  variation_id?: string;
  /** From listing row; used to sort unlinked items */
  updated_at?: string;
}

export interface ExistingLink {
  marketplace_name: string;
  marketplace_item_id: string;
  variation_id?: string;
}

interface ProductAdLinkingPanelProps {
  productId: string | null;
  /** When false, link/unlink actions show toast instead of persisting */
  allowMutations?: boolean;
  /** Called after a successful link or unlink (e.g. refresh counts in listagem) */
  onLinksMutation?: () => void;
}

export function ProductAdLinkingPanel({ productId, allowMutations = true, onLinksMutation }: ProductAdLinkingPanelProps) {
  const { toast } = useToast();
  const { organizationId } = useAuth();

  const [selectedIntegrationValue, setSelectedIntegrationValue] = useState<string>("");
  const [search, setSearch] = useState("");
  const [allListingCandidates, setAllListingCandidates] = useState<MarketplaceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [existingLinks, setExistingLinks] = useState<ExistingLink[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [activeDbMarketplaceNames, setActiveDbMarketplaceNames] = useState<string[]>([]);
  const [integrationsQueryDone, setIntegrationsQueryDone] = useState(false);
  const [itemsQueryDone, setItemsQueryDone] = useState(false);

  /** One option per connected channel (deduped by canonical key). Not limited to ML/Shopee. */
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
    return [
      {
        value: ALL_MARKETPLACES_VALUE,
        label: "Todos os canais",
        canonicalKey: ALL_MARKETPLACES_VALUE,
      },
      ...channelOptions,
    ];
  }, [activeDbMarketplaceNames, allListingCandidates]);

  /** Single source of truth for which marketplace tab is active (aligned with Select items). */
  const effectiveIntegrationValue = useMemo(() => {
    if (availableIntegrations.length === 0) return "";
    if (availableIntegrations.some((i) => i.value === selectedIntegrationValue)) {
      return selectedIntegrationValue;
    }
    return availableIntegrations[0].value;
  }, [availableIntegrations, selectedIntegrationValue]);

  const fetchGenerationRef = useRef(0);

  const items = useMemo(() => {
    const linkedRank = (it: MarketplaceItem) =>
      existingLinks.some(
        (l) =>
          l.marketplace_item_id === it.marketplace_item_id &&
          marketplaceKeysEqual(l.marketplace_name, it.marketplace_name) &&
          String(l.variation_id || "") === String(it.variation_id || "")
      )
        ? 1
        : 0;
    const byMarketplace = !effectiveIntegrationValue
      ? []
      : effectiveIntegrationValue === ALL_MARKETPLACES_VALUE
        ? allListingCandidates
        : allListingCandidates.filter(
            (i) => normalizeMarketplaceKey(i.marketplace_name) === effectiveIntegrationValue
          );
    const term = normalizeSearchValue(search.trim());
    const filtered = !term
      ? byMarketplace
      : byMarketplace.filter((i) => {
          const searchable = [
            i.title,
            i.sku,
            i.modelId,
            i.marketplace_item_id,
            i.marketplace_name,
            i.variation_id,
          ]
            .map(normalizeSearchValue)
            .join(" ");
          return searchable.includes(term);
        });

    return [...filtered].sort((a, b) => {
      const r = linkedRank(b) - linkedRank(a);
      if (r !== 0) return r;
      const ta = new Date(String(a.updated_at || 0)).getTime();
      const tb = new Date(String(b.updated_at || 0)).getTime();
      return tb - ta;
    });
  }, [allListingCandidates, existingLinks, effectiveIntegrationValue, search]);

  useEffect(() => {
    if (!productId || !organizationId) {
      setExistingLinks([]);
      return;
    }
    supabase
      .from("marketplace_item_product_links" as any)
      .select("marketplace_name, marketplace_item_id, variation_id")
      .eq("product_id", productId)
      .eq("organizations_id", organizationId)
      .then(({ data }) => {
        setExistingLinks(Array.isArray(data) ? data : []);
      });
  }, [productId, organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setIntegrationsQueryDone(false);
      setActiveDbMarketplaceNames([]);
      return;
    }
    setIntegrationsQueryDone(false);
    setActiveDbMarketplaceNames([]);
    const loadActiveIntegrations = async () => {
      const parseNames = (data: unknown) =>
        Array.isArray(data)
          ? Array.from(new Set((data as any[]).map((row: any) => String(row.marketplace_name || "")))).filter(Boolean)
          : [];
      try {
        let res = await (supabase as any)
          .from("marketplace_integrations")
          .select("marketplace_name")
          .eq("organizations_id", organizationId)
          .is("deactivated_at", null);
        if (res.error) {
          res = await (supabase as any)
            .from("marketplace_integrations")
            .select("marketplace_name")
            .eq("organizations_id", organizationId);
        }
        if (res.error) throw res.error;
        setActiveDbMarketplaceNames(parseNames(res.data));
      } catch {
        setActiveDbMarketplaceNames([]);
      } finally {
        setIntegrationsQueryDone(true);
      }
    };
    void loadActiveIntegrations();
  }, [organizationId]);

  useEffect(() => {
    if (availableIntegrations.length === 0) {
      setSelectedIntegrationValue("");
    }
  }, [availableIntegrations.length]);

  useEffect(() => {
    if (availableIntegrations.length === 0) return;
    if (!availableIntegrations.some((i) => i.value === selectedIntegrationValue)) {
      setSelectedIntegrationValue(availableIntegrations[0].value);
    }
  }, [availableIntegrations, selectedIntegrationValue]);

  useEffect(() => {
    if (!organizationId) {
      setAllListingCandidates([]);
      setItemsQueryDone(false);
      return;
    }
    const generation = ++fetchGenerationRef.current;

    const load = async () => {
      setItemsLoading(true);
      setItemsQueryDone(false);
      try {
        const { rows, error } = await fetchMarketplaceItemsForAdLinking(organizationId, 500);
        if (generation !== fetchGenerationRef.current) return;

        if (error) {
          console.error(error);
          toast({
            title: "Erro ao carregar anúncios",
            description: error.message,
            variant: "destructive",
          });
          setAllListingCandidates([]);
          return;
        }

        const flattened: MarketplaceItem[] = [];
        const flattenedKeys = new Set<string>();

        const makeItemKey = (marketplaceName: string, marketplaceItemId: string, variationKey: string) =>
          `${normalizeMarketplaceKey(marketplaceName) || marketplaceName}::${marketplaceItemId}::${variationKey || "root"}`;

        const pushFlattened = (item: MarketplaceItem) => {
          if (!item.marketplace_item_id || !item.marketplace_name) return;
          if (flattenedKeys.has(item.id)) return;
          flattenedKeys.add(item.id);
          flattened.push(item);
        };

        const getImageUrl = (value: any): string => {
          if (!value) return "";
          if (typeof value === "string") {
            if (/^https?:\/\//i.test(value)) return value;
            return `https://cf.shopee.com.br/file/${value}`;
          }
          if (value.url) return String(value.url);
          if (value.secure_url) return String(value.secure_url);
          if (value.image_url) return String(value.image_url);
          if (value.thumbnail_url) return String(value.thumbnail_url);
          if (value.model_image_url) return String(value.model_image_url);
          if (value.image_id) return `https://cf.shopee.com.br/file/${value.image_id}`;
          if (value.picture_id) return `https://cf.shopee.com.br/file/${value.picture_id}`;
          return "";
        };

        const getThumbnail = (item: any, variation: any, pictures: any[]) => {
          const directVariationImage =
            getImageUrl(variation?.model_image_url) ||
            getImageUrl(variation?.image_url) ||
            getImageUrl(variation?.thumbnail) ||
            getImageUrl(variation?.image);
          if (directVariationImage) return directVariationImage;

          const picIds = [
            ...(Array.isArray(variation?.picture_ids) ? variation.picture_ids : []),
            variation?.picture_id,
            variation?.image_id,
          ].filter(Boolean);
          for (const picId of picIds) {
            const match = pictures.find((p: any) => {
              if (typeof p === "string") return p.includes(String(picId));
              return String(p?.id || p?.picture_id || p?.image_id || "") === String(picId);
            });
            const matchedUrl = getImageUrl(match);
            if (matchedUrl) return matchedUrl;
            return getImageUrl(picId);
          }

          const itemImage =
            getImageUrl(item?.thumbnail) ||
            getImageUrl(item?.image_url) ||
            getImageUrl(item?.image) ||
            getImageUrl(item?.data?.base_info?.image?.image_url_list?.[0]) ||
            getImageUrl(item?.data?.base_info?.promotion_image?.image_url_list?.[0]);
          if (itemImage) return itemImage;

          return getImageUrl(pictures[0]);
        };

        const deriveSku = (item: any, variation: any) => {
          if (variation?.model_sku) return String(variation.model_sku);
          if (variation?.sku) return String(variation.sku);
          if (variation?.seller_sku) return String(variation.seller_sku);
          if (item?.sku) return String(item.sku);
          if (item?.data?.base_info?.item_sku) return String(item.data.base_info.item_sku);
          return "";
        };

        const buildVariationLabel = (variation: any): string => {
          const combos = Array.isArray(variation?.attribute_combinations) ? variation.attribute_combinations : [];
          const comboLabel = combos
            .filter((a: any) => a?.id !== "SELLER_SKU")
            .map((a: any) => a?.value_name || a?.value_id || "")
            .filter(Boolean)
            .join(" / ");
          if (comboLabel) return comboLabel;
          return String(variation?.model_name || variation?.name || variation?.variation_name || "").trim();
        };

        rows.forEach((item: any) => {
          const pictures = Array.isArray(item?.pictures) ? item.pictures : [];
          const variations = Array.isArray(item?.variations) ? item.variations : [];
          const marketplaceName = String(item.marketplace_name || "");
          const marketplaceItemId = String(item.marketplace_item_id || "");
          if (variations.length > 0) {
            variations.forEach((variation: any, index: number) => {
              const variationId =
                variation?.model_id != null
                  ? String(variation.model_id)
                  : variation?.id != null
                    ? String(variation.id)
                    : variation?.variation_id != null
                      ? String(variation.variation_id)
                      : "";
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
                thumbnail:
                  getThumbnail(item, variation, pictures) ||
                  (typeof item.thumbnail === "string" ? item.thumbnail : ""),
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
        if (generation === fetchGenerationRef.current) {
          setItemsLoading(false);
          setItemsQueryDone(true);
        }
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

  const handleLink = async (item: MarketplaceItem) => {
    if (!allowMutations) {
      toast({
        title: "Salve o produto primeiro",
        description: "Conclua o cadastro para poder vincular anúncios a este produto.",
      });
      return;
    }
    if (!productId || !organizationId) {
      toast({
        title: "Aviso",
        description: "Salve o produto antes de vincular anúncios.",
        variant: "destructive",
      });
      return;
    }
    setLinking(item.id);
    try {
      const companyId = await getCompanyIdForOrg(organizationId);
      if (!companyId) {
        throw new Error("Não foi possível resolver company_id para a organização.");
      }
      const { error } = await (supabase as any).from("marketplace_item_product_links").upsert(
        {
          organizations_id: organizationId,
          company_id: companyId,
          product_id: productId,
          marketplace_name: item.marketplace_name,
          marketplace_item_id: item.marketplace_item_id,
          variation_id: item.variation_id || "",
          permanent: true,
        },
        { onConflict: "organizations_id,marketplace_name,marketplace_item_id,variation_id" }
      );
      if (error) throw error;
      setExistingLinks((prev) => [
        ...prev,
        {
          marketplace_name: item.marketplace_name,
          marketplace_item_id: item.marketplace_item_id,
          variation_id: item.variation_id || "",
        },
      ]);
      toast({ title: "Vínculo criado", description: `"${item.title}" vinculado ao produto.` });
      onLinksMutation?.();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Erro ao vincular anúncio.", variant: "destructive" });
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (link: ExistingLink) => {
    if (!allowMutations) return;
    if (!productId || !organizationId) return;
    try {
      await (supabase as any)
        .from("marketplace_item_product_links")
        .delete()
        .eq("organizations_id", organizationId)
        .eq("product_id", productId)
        .eq("marketplace_name", link.marketplace_name)
        .eq("marketplace_item_id", link.marketplace_item_id)
        .eq("variation_id", link.variation_id || "");
      setExistingLinks((prev) =>
        prev.filter(
          (l) =>
            !(
              l.marketplace_name === link.marketplace_name &&
              l.marketplace_item_id === link.marketplace_item_id &&
              String(l.variation_id || "") === String(link.variation_id || "")
            )
        )
      );
      toast({ title: "Vínculo removido" });
      onLinksMutation?.();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  };

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
          <Select
            value={effectiveIntegrationValue}
            onValueChange={(v) => {
              setSelectedIntegrationValue(v);
              setSearch("");
            }}
          >
            <SelectTrigger className="w-full sm:w-52 shrink-0">
              <SelectValue placeholder="Marketplace" />
            </SelectTrigger>
            <SelectContent position="item-aligned" className="z-[10050]">
              {availableIntegrations.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Buscar por título, SKU ou ID do anúncio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
            <p className="text-xs text-center px-4 text-gray-500">
              Sincronize anúncios no módulo Anúncios ou troque o filtro acima.
            </p>
          </div>
        ) : (
          <div className="space-y-2 pr-3">
            {items.map((item) => {
              const linked = isLinked(item);
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-colors ${
                    linked ? "border-green-200 bg-green-50" : "border-gray-100 hover:border-violet-200 hover:bg-violet-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center">
                        <ExternalLink className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                        <span className="text-xs text-gray-500">ID: {item.marketplace_item_id}</span>
                        {item.sku ? <span className="text-xs text-gray-400">SKU: {item.sku}</span> : null}
                        {item.modelId ? <span className="text-xs text-gray-400">id_model: {item.modelId}</span> : null}
                        {item.variation_id && !item.modelId ? (
                          <span className="text-xs text-gray-400">Variação: {item.variation_id}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={linked ? "ghost" : "default"}
                    className={
                      linked
                        ? "text-green-600 hover:text-red-600 gap-1 shrink-0"
                        : "bg-violet-700 hover:bg-violet-800 text-white gap-1 shrink-0"
                    }
                    disabled={linking === item.id}
                    onClick={() =>
                      linked
                        ? handleUnlink({
                            marketplace_name: item.marketplace_name,
                            marketplace_item_id: item.marketplace_item_id,
                            variation_id: item.variation_id || "",
                          })
                        : handleLink(item)
                    }
                  >
                    {linking === item.id ? (
                      <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : linked ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Vinculado
                      </>
                    ) : (
                      <>
                        <Link className="w-3.5 h-3.5" />
                        Vincular
                      </>
                    )}
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
