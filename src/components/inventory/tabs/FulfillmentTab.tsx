import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Warehouse, ExternalLink, Boxes } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface FullStockRow {
  marketplaceItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  productImage: string | null;
  storageName: string;
  storageId: string;
  marketplace: string | null;
  quantity: number;
}

interface WarehouseCard {
  storageId: string;
  storageName: string;
  marketplace: string | null;
  totalQty: number;
  itemCount: number;
}

/** Marketplace badges — vivid colors, no yellow (ML uses brand-adjacent blue). */
function marketplaceBadgeClass(marketplace: string | null) {
  if (!marketplace) return "border-transparent bg-slate-600 text-white";
  const m = marketplace.toLowerCase();
  if (m.includes("mercado")) return "border-transparent bg-[#3483FA] text-white";
  if (m.includes("shopee")) return "border-transparent bg-[#EE4D2D] text-white";
  return "border-transparent bg-sky-600 text-white";
}

/** Round icon container on integration summary cards */
function marketplaceCardIconClass(marketplace: string) {
  const m = marketplace.toLowerCase();
  if (m.includes("mercado")) return "bg-[#3483FA]/15 text-[#2563EB]";
  if (m.includes("shopee")) return "bg-[#EE4D2D]/15 text-[#EE4D2D]";
  return "bg-sky-600/15 text-sky-700";
}

/**
 * Fetches Full (fulfillment) stock for linked listings only.
 * Joins fulfillment_stock with marketplace_item_product_links to filter
 * only marketplace items that have a product link in this org.
 */
async function fetchLinkedFulfillmentStock(orgId: string): Promise<FullStockRow[]> {
  // 1) Fetch all links for this org (source of truth for product_id per listing)
  const { data: linksData, error: linksErr } = await (supabase as any)
    .from("marketplace_item_product_links")
    .select("marketplace_item_id, product_id")
    .eq("organizations_id", orgId);
  if (linksErr) throw new Error(linksErr.message);
  if (!linksData || linksData.length === 0) return [];

  const linkedItemToProduct = new Map<string, string>();
  for (const r of linksData as any[]) {
    linkedItemToProduct.set(String(r.marketplace_item_id), String(r.product_id));
  }
  const linkedItemIds = Array.from(linkedItemToProduct.keys());

  // 2) Source A: fulfillment_stock
  const { data: fsData, error: fsErr } = await (supabase as any)
    .from("fulfillment_stock")
    .select(
      `product_id, storage_id, marketplace_item_id, quantity,
       storage:storage_id ( name, marketplace_name )`
    )
    .eq("organization_id", orgId)
    .in("marketplace_item_id", linkedItemIds)
    .gt("quantity", 0);
  if (fsErr) throw new Error(fsErr.message);

  // 3) Source B: marketplace_stock_distribution (fallback)
  const { data: msdData, error: msdErr } = await (supabase as any)
    .from("marketplace_stock_distribution")
    .select("marketplace_item_id, warehouse_id, warehouse_name, marketplace_name, quantity")
    .eq("organizations_id", orgId)
    .in("marketplace_item_id", linkedItemIds)
    .gt("quantity", 0);
  if (msdErr) throw new Error(msdErr.message);

  // 4) Build canonical rows from both sources, deduplicating by item+storage
  const rowsMap = new Map<string, FullStockRow>();

  for (const r of (fsData || []) as any[]) {
    const itemId = String(r.marketplace_item_id || "");
    const productId = String(r.product_id || linkedItemToProduct.get(itemId) || "");
    const storageId = String(r.storage_id || "");
    const key = `${itemId}:${storageId}`;
    rowsMap.set(key, {
      marketplaceItemId: itemId,
      productId,
      productName: "Produto",
      productSku: "-",
      productImage: null,
      storageName: String(r.storage?.name || "Armazém"),
      storageId,
      marketplace: r.storage?.marketplace_name ?? null,
      quantity: Number(r.quantity || 0),
    });
  }

  for (const r of (msdData || []) as any[]) {
    const itemId = String(r.marketplace_item_id || "");
    const productId = String(linkedItemToProduct.get(itemId) || "");
    const storageId = `msd:${String(r.warehouse_id || "")}`;
    const key = `${itemId}:${storageId}`;
    // Keep fulfillment_stock as priority; only fallback-add when absent.
    if (rowsMap.has(key)) continue;
    rowsMap.set(key, {
      marketplaceItemId: itemId,
      productId,
      productName: "Produto",
      productSku: "-",
      productImage: null,
      storageName: String(r.warehouse_name || "Armazém Full"),
      storageId,
      marketplace: r.marketplace_name ?? null,
      quantity: Number(r.quantity || 0),
    });
  }

  const mergedRows = Array.from(rowsMap.values()).filter((r) => !!r.productId && r.quantity > 0);
  if (mergedRows.length === 0) return [];

  // 5) Fetch product metadata
  const productIds = [...new Set(mergedRows.map((r) => r.productId))];
  const { data: productsData } = await (supabase as any)
    .from("products")
    .select("id, name, sku, image_urls")
    .in("id", productIds);

  const productMap = new Map<string, { name: string; sku: string; imageUrl: string | null }>();
  for (const p of (productsData || []) as any[]) {
    const imgs = Array.isArray(p.image_urls) ? p.image_urls : [];
    productMap.set(p.id, { name: p.name, sku: p.sku, imageUrl: imgs[0] ?? null });
  }

  // 6) Map final display rows
  return mergedRows.map((r) => {
    const meta = productMap.get(r.productId) ?? { name: "Produto", sku: "-", imageUrl: null };
    return {
      marketplaceItemId: r.marketplaceItemId,
      productId: r.productId,
      productName: meta.name,
      productSku: meta.sku,
      productImage: meta.imageUrl,
      storageName: r.storageName,
      storageId: r.storageId,
      marketplace: r.marketplace,
      quantity: r.quantity,
    };
  });
}

export function FulfillmentTab() {
  const { organizationId } = useAuth();
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: rows = [], isLoading, error } = useQuery<FullStockRow[]>({
    queryKey: ["full-stock-linked", organizationId],
    queryFn: () => fetchLinkedFulfillmentStock(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const integrationCards = useMemo(() => {
    const map = new Map<string, { marketplace: string; totalQty: number; listingCount: number; listingIds: Set<string> }>();
    for (const row of rows) {
      const key = String(row.marketplace || "Outros");
      const prev = map.get(key);
      if (prev) {
        prev.totalQty += Number(row.quantity || 0);
        prev.listingIds.add(row.marketplaceItemId);
      } else {
        map.set(key, {
          marketplace: key,
          totalQty: Number(row.quantity || 0),
          listingCount: 0,
          listingIds: new Set([row.marketplaceItemId]),
        });
      }
    }
    return Array.from(map.values()).map((c) => ({
      marketplace: c.marketplace,
      totalQty: c.totalQty,
      listingCount: c.listingIds.size,
    }));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalize = (v: string) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const tokens = normalize(searchTerm).split(/\s+/).filter(Boolean);

    return rows.filter((r) => {
      const marketplaceOk =
        selectedMarketplace === "all" || String(r.marketplace || "Outros") === selectedMarketplace;
      if (!marketplaceOk) return false;
      if (tokens.length === 0) return true;
      const haystack = normalize(`${r.marketplaceItemId} ${r.productSku} ${r.productName}`);
      return tokens.every((t) => haystack.includes(t));
    });
  }, [rows, selectedMarketplace, searchTerm]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Erro ao carregar estoque Full: {(error as Error).message}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {integrationCards.map((card) => {
          const selected = selectedMarketplace === card.marketplace;
          return (
            <button
              key={card.marketplace}
              type="button"
              onClick={() => setSelectedMarketplace((prev) => (prev === card.marketplace ? "all" : card.marketplace))}
              className={`text-left rounded-2xl bg-white shadow-lg ring-1 p-0 transition ${selected ? "ring-violet-400" : "ring-gray-200/60 hover:ring-violet-200"}`}
            >
              <Card className="rounded-2xl border-0 shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{card.marketplace}</p>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Quantidade em estoque</span>
                          <span className="font-bold text-foreground">{card.totalQty.toLocaleString("pt-BR")}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Anúncios em Full</span>
                          <span className="font-bold text-foreground">{card.listingCount.toLocaleString("pt-BR")}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`rounded-full p-2 ${marketplaceCardIconClass(card.marketplace)}`}>
                      <Boxes className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por ID do anúncio, SKU ou título..."
              className="h-12 min-w-[260px] flex-1 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
            />
            <Select value={selectedMarketplace} onValueChange={setSelectedMarketplace}>
              <SelectTrigger className="h-12 w-[220px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
                <SelectValue placeholder="Marketplace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os marketplaces</SelectItem>
                {integrationCards.map((c) => (
                  <SelectItem key={c.marketplace} value={c.marketplace}>
                    {c.marketplace}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {visibleRows.length} resultados
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed table */}
      {visibleRows.length > 0 && (
        <Card className="rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Produtos com estoque Full</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>ID do anúncio</TableHead>
                  <TableHead>Armazém Full</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="text-right">Qtd. Full</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row, idx) => (
                  <TableRow key={`${row.marketplaceItemId}-${row.storageId}-${idx}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-md bg-gray-100 overflow-hidden shrink-0">
                          {row.productImage ? (
                            <img
                              src={row.productImage}
                              alt={row.productName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-sm truncate max-w-[180px]">
                          {row.productName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {row.productSku}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs flex items-center gap-1">
                        {row.marketplaceItemId}
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{row.storageName}</TableCell>
                    <TableCell>
                      {row.marketplace ? (
                        <Badge className={`text-xs ${marketplaceBadgeClass(row.marketplace)}`}>
                          {row.marketplace}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {row.quantity.toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
