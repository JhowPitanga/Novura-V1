import { useState, useEffect, useMemo, useId, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Package, Search, Link2, CheckCircle2, Sparkles, AlertTriangle, X } from "lucide-react";
import { useBindableProducts } from "@/hooks/useProducts";
import { useUpsertListingLink } from "@/hooks/useListingLinks";
import { useAuth } from "@/hooks/useAuth";

interface BindableProduct {
  id: string;
  name: string;
  sku: string;
  image_urls?: string[];
  available_stock?: number;
}

export interface LinkPickerContext {
  marketplace: string;
  marketplaceItemId: string;
  variationId?: string;
  /** SKU from the marketplace listing (used for Auto-Match) */
  adSku?: string;
  adTitle?: string;
  adImage?: string;
  matchHints?: string[];
  pendingVariationIds?: string[];
  currentStep?: number;
  totalSteps?: number;
  progressLabel?: string;
}

interface LinkPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LinkPickerContext | null;
  onLinked?: (productId: string, productName: string) => void;
}

const EMPTY_MATCH_HINTS: string[] = [];
/** Max products in "Sugestões automáticas" (Auto-Match can overlap several SKUs) */
const MAX_AUTO_MATCH_SUGGESTIONS = 2;

/** Normalize SKU for fuzzy matching: lower-case, strip separators */
function normalizeSku(sku: string): string {
  return String(sku || "")
    .toLowerCase()
    .replace(/[-_.\s/]/g, "");
}

function cleanProductSku(sku: string | undefined | null): string {
  const s = String(sku ?? "").trim();
  if (!s || s.toUpperCase() === "N/A") return "";
  return s;
}

/** Levenshtein distance for short SKU fuzzy match */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/** True when normalized SKUs are close (typos / marketplace suffix/prefix) */
function fuzzySkuSimilar(normAd: string, normProd: string): boolean {
  if (!normAd || !normProd) return false;
  if (normAd === normProd) return false;
  const len = Math.max(normAd.length, normProd.length);
  if (len < 3) return false;
  const dist = levenshtein(normAd, normProd);
  if (len <= 8) return dist <= 1;
  if (len <= 14) return dist <= 2;
  return dist <= Math.ceil(len * 0.15);
}

function stripParentheticals(s: string): string {
  return String(s || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedForTitleMatch(s: string): string {
  return stripParentheticals(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant word overlap between listing title and catalog product name */
function titleBoostsSimilarity(adTitle: string, productName: string): boolean {
  const at = normalizedForTitleMatch(adTitle);
  const pn = normalizedForTitleMatch(productName);
  if (at.length < 4 || pn.length < 4) return false;
  if (pn.includes(at.slice(0, Math.min(32, at.length))) || at.includes(pn.slice(0, Math.min(32, pn.length)))) {
    return true;
  }
  const aw = at.split(" ").filter((w) => w.length > 2);
  const pwArr = pn.split(" ").filter((w) => w.length > 2);
  if (!aw.length || !pwArr.length) return false;
  const pw = new Set(pwArr);
  let hits = 0;
  for (const w of aw) {
    if (pw.has(w)) {
      hits++;
      continue;
    }
    for (const p of pwArr) {
      if (p.includes(w) || w.includes(p)) {
        hits++;
        break;
      }
    }
  }
  return hits >= 2 || (hits >= 1 && aw.length <= 3);
}

type MatchTier = "exact" | "similar" | "none";

function getMatchTier(
  productSku: string,
  adSku: string,
  productName = "",
  hints: string[] = [],
  adTitle = ""
): MatchTier {
  const pSku = cleanProductSku(productSku);
  const aSku = String(adSku || "").trim();
  const normAd = normalizeSku(aSku);
  const normProd = normalizeSku(pSku);
  const nameLower = String(productName || "").toLowerCase();

  if (normAd && normProd && normProd === normAd) return "exact";

  const hintMatch = hints.some(
    (h) => h && nameLower.includes(String(h).toLowerCase().trim())
  );
  if (hintMatch) return "similar";

  if (normAd && normProd) {
    if (normProd.includes(normAd) || normAd.includes(normProd)) return "similar";
    if (fuzzySkuSimilar(normAd, normProd)) return "similar";
  }

  if (adTitle && productName && titleBoostsSimilarity(adTitle, productName)) return "similar";

  return "none";
}

export function LinkPickerDrawer({
  open,
  onOpenChange,
  context,
  onLinked,
}: LinkPickerDrawerProps) {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const titleId = useId();
  const descriptionId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const { bindableProducts, loading } = useBindableProducts(open);
  const upsertLink = useUpsertListingLink();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Reset UI when drawer opens; matching uses context.adSku in ranked list (no search prefill).
  useEffect(() => {
    if (open) {
      setSearchTerm("");
      setSelectedProductId(null);
      setConfirmed(false);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, context?.marketplaceItemId, context?.variationId, context?.adSku]);

  const products = bindableProducts as BindableProduct[];
  const adSku = context?.adSku || "";
  const adTitle = context?.adTitle || "";
  const matchHints =
    context?.matchHints && context.matchHints.length > 0 ? context.matchHints : EMPTY_MATCH_HINTS;

  // Build ranked list: exact > similar > none, then apply search filter
  const rankedProducts = useMemo(() => {
    const withTier = products.map((p) => ({
      ...p,
      tier: getMatchTier(p.sku, adSku, p.name, matchHints, adTitle),
    }));

    const filtered = searchTerm
      ? withTier.filter((p) => {
          const term = searchTerm.toLowerCase();
          return (
            p.name.toLowerCase().includes(term) ||
            p.sku.toLowerCase().includes(term)
          );
        })
      : withTier;

    const order: Record<MatchTier, number> = { exact: 0, similar: 1, none: 2 };
    return [...filtered].sort((a, b) => order[a.tier] - order[b.tier]);
  }, [products, adSku, adTitle, searchTerm, matchHints]);

  const suggestions = useMemo(
    () => rankedProducts.filter((p) => p.tier !== "none").slice(0, MAX_AUTO_MATCH_SUGGESTIONS),
    [rankedProducts]
  );

  /** Full catalog list: same ranking/search as rankedProducts but without rows already shown in Sugestões automáticas */
  const rankedProductsForFullList = useMemo(() => {
    if (suggestions.length === 0) return rankedProducts;
    const suggestionIds = new Set(suggestions.map((s) => s.id));
    return rankedProducts.filter((p) => !suggestionIds.has(p.id));
  }, [rankedProducts, suggestions]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const handleSelect = (id: string) => {
    setSelectedProductId(id);
    setConfirmed(false);
  };

  const handleConfirmLink = async () => {
    if (!selectedProductId || !context || !organizationId) return;
    try {
      await upsertLink.mutateAsync({
        marketplaceName: context.marketplace,
        marketplaceItemId: context.marketplaceItemId,
        variationId: context.variationId,
        productId: selectedProductId,
      });
      setConfirmed(true);
      toast({
        title: "Anúncio vinculado",
        description: `Vínculo permanente criado com "${selectedProduct?.name}".`,
      });
      onLinked?.(selectedProductId, selectedProduct?.name || "");
      setTimeout(() => onOpenChange(false), 800);
    } catch (err: any) {
      toast({
        title: "Erro ao vincular",
        description: err.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const selectedMatchTier = selectedProduct
    ? getMatchTier(selectedProduct.sku, adSku, selectedProduct.name, matchHints, adTitle)
    : ("none" as MatchTier);

  const isMatchSimilarOnly = selectedProduct && selectedMatchTier === "similar";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 flex h-full w-full sm:w-[90%] md:w-[60%] lg:w-[45%] xl:w-[38%] flex-col"
      >
        <DrawerHeader className="flex items-start justify-between border-b pb-4">
          <div>
            <DrawerTitle id={titleId} className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Vincular ao produto
            </DrawerTitle>
            <DrawerDescription id={descriptionId} className="mt-1">
              {context?.adTitle
                ? `Anúncio: ${context.adTitle}`
                : `ID: ${context?.marketplaceItemId || "—"}`}
              {context?.adSku && (
                <span className="ml-2 font-mono text-xs text-primary">
                  SKU: {context.adSku}
                </span>
              )}
              {context?.progressLabel && (
                <Badge className="ml-2 bg-purple-100 text-purple-700 border-purple-200 text-[10px]">
                  {context.progressLabel}
                </Badge>
              )}
            </DrawerDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="mt-1 h-8 w-8 p-0 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </DrawerHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search */}
          <div className="px-4 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Buscar por nome ou SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-4 py-3 space-y-4">
              {/* Auto-Match Suggestions */}
              {suggestions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                      Sugestões automáticas
                    </span>
                  </div>
                  <div className="space-y-1">
                    {suggestions.map((p) => (
                      <ProductRow
                        key={p.id}
                        product={p}
                        adSku={adSku}
                        adTitle={adTitle}
                        matchHints={matchHints}
                        isSelected={selectedProductId === p.id}
                        onSelect={() => handleSelect(p.id)}
                        isSuggestion
                      />
                    ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              )}

              {/* Full list (excludes suggestion rows to avoid duplicate selection UI) */}
              <div>
                {suggestions.length > 0 && rankedProductsForFullList.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                    Todos os produtos
                  </p>
                )}
                {loading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Carregando produtos...
                  </div>
                ) : rankedProducts.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum produto encontrado.
                  </div>
                ) : suggestions.length > 0 && rankedProductsForFullList.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Outros produtos: use a busca por nome ou SKU acima.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {(suggestions.length > 0 ? rankedProductsForFullList : rankedProducts).map((p) => (
                      <ProductRow
                        key={p.id}
                        product={p}
                        adSku={adSku}
                        adTitle={adTitle}
                        matchHints={matchHints}
                        isSelected={selectedProductId === p.id}
                        onSelect={() => handleSelect(p.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Confirmation panel */}
          {selectedProduct && !confirmed && (
            <div className="border-t bg-gray-50 px-4 py-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-gray-200 overflow-hidden shrink-0">
                  {selectedProduct.image_urls?.[0] ? (
                    <img
                      src={selectedProduct.image_urls[0]}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{selectedProduct.name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">SKU produto: {selectedProduct.sku}</span>
                    {adSku ? (
                      <>
                        <span>|</span>
                        <span className="font-mono text-primary">SKU anúncio: {adSku}</span>
                      </>
                    ) : null}
                    {selectedMatchTier === "exact" ? (
                      <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200 px-1 py-0">
                        SKU idêntico
                      </Badge>
                    ) : selectedMatchTier === "similar" ? (
                      <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-200 px-1 py-0">
                        Talvez seja esse
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Warning for similar-only match */}
              {isMatchSimilarOnly && (
                <div className="flex items-start gap-2 rounded-md border-2 border-[#FF6400] bg-[#FF6400]/12 p-3 text-xs shadow-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#FF6400]" aria-hidden />
                  <span className="font-medium leading-snug text-gray-900">
                    A correspondência é sugerida automaticamente (SKU, nome ou atributos). Confira se é o produto
                    certo antes de vincular.
                  </span>
                </div>
              )}

              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={handleConfirmLink}
                disabled={upsertLink.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {upsertLink.isPending ? "Vinculando..." : "Confirmar vínculo"}
              </Button>
            </div>
          )}

          {confirmed && (
            <div className="border-t bg-green-50 px-4 py-4 flex items-center gap-2 text-green-700 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Vínculo criado com sucesso!
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface ProductRowProps {
  product: BindableProduct & { tier?: MatchTier };
  adSku: string;
  adTitle?: string;
  matchHints?: string[];
  isSelected: boolean;
  onSelect: () => void;
  isSuggestion?: boolean;
}

function ProductRow({
  product,
  adSku,
  adTitle = "",
  matchHints = [],
  isSelected,
  onSelect,
  isSuggestion,
}: ProductRowProps) {
  const tier = product.tier ?? getMatchTier(product.sku, adSku, product.name, matchHints, adTitle);
  const image = product.image_urls?.[0];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-gray-200 bg-white hover:bg-gray-50",
        isSuggestion && !isSelected ? "border-primary/35 bg-primary/5" : "",
      ].join(" ")}
    >
      <div className="w-9 h-9 rounded-md bg-gray-100 overflow-hidden shrink-0">
        {image ? (
          <img src={image} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{product.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
          {tier === "exact" && (
            <Badge className="text-[9px] px-1 py-0 bg-green-100 text-green-800 border-green-200">
              SKU idêntico
            </Badge>
          )}
          {tier === "similar" && (
            <Badge className="text-[9px] px-1 py-0 bg-purple-100 text-purple-700 border-purple-200">
              Talvez seja esse
            </Badge>
          )}
        </div>
      </div>
      {product.available_stock != null && (
        <span className="text-xs text-muted-foreground shrink-0">
          {product.available_stock} un.
        </span>
      )}
      {isSelected && (
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
      )}
    </button>
  );
}
