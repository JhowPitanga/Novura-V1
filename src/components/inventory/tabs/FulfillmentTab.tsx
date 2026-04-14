import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Warehouse } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchFulfillmentStockByOrg, type ProductFulfillmentStock } from "@/services/inventory.service";

function marketplaceBadgeColor(marketplace: string | null) {
  if (!marketplace) return "bg-gray-100 text-gray-700";
  if (marketplace.toLowerCase().includes("mercado")) return "bg-yellow-100 text-yellow-800";
  if (marketplace.toLowerCase().includes("shopee")) return "bg-orange-100 text-orange-800";
  return "bg-blue-100 text-blue-700";
}

function StorageSummaryCard({ storageName, marketplace, totalQty, listingsCount }: {
  storageName: string;
  marketplace: string | null;
  totalQty: number;
  listingsCount: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Warehouse className="w-4 h-4 text-muted-foreground" />
          {storageName}
          {marketplace && (
            <Badge className={`ml-auto text-xs ${marketplaceBadgeColor(marketplace)}`}>
              {marketplace}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estoque total:</span>
            <span className="font-bold">{totalQty.toLocaleString("pt-BR")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Anúncios:</span>
            <span className="font-bold">{listingsCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FulfillmentTab() {
  const { organizationId } = useAuth();

  const { data: products = [], isLoading, error } = useQuery<ProductFulfillmentStock[]>({
    queryKey: ["fulfillment-stock", organizationId],
    queryFn: () => fetchFulfillmentStockByOrg(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Aggregate summary cards per storage
  const storageAggMap = new Map<string, { storageName: string; marketplace: string | null; totalQty: number; listingsCount: number }>();
  for (const product of products) {
    for (const summary of product.fulfillmentByStorage) {
      const existing = storageAggMap.get(summary.storageId);
      if (existing) {
        existing.totalQty += summary.totalQty;
        existing.listingsCount += summary.listings.length;
      } else {
        storageAggMap.set(summary.storageId, {
          storageName: summary.storageName,
          marketplace: summary.marketplace,
          totalQty: summary.totalQty,
          listingsCount: summary.listings.length,
        });
      }
    }
  }
  const storageCards = Array.from(storageAggMap.values());

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
        Erro ao carregar estoque fulfillment: {(error as Error).message}
      </div>
    );
  }

  return (
    <>
      {/* Per-storage summary cards */}
      {storageCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {storageCards.map((card) => (
            <StorageSummaryCard
              key={card.storageName}
              storageName={card.storageName}
              marketplace={card.marketplace}
              totalQty={card.totalQty}
              listingsCount={card.listingsCount}
            />
          ))}
        </div>
      ) : (
        <div className="mb-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          <Package className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm font-medium">Nenhum armazém fulfillment configurado</p>
          <p className="text-xs mt-1">Configure armazéns fulfillment e vincule integrações para visualizar o estoque aqui.</p>
        </div>
      )}

      {/* Detailed product table */}
      {products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produtos em Fulfillment</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Armazém</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Anúncios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.flatMap((product) =>
                  product.fulfillmentByStorage.map((summary) => (
                    <TableRow key={`${product.productId}-${summary.storageId}`}>
                      <TableCell className="font-medium">{product.productName}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{product.sku}</TableCell>
                      <TableCell>{summary.storageName}</TableCell>
                      <TableCell>
                        {summary.marketplace ? (
                          <Badge className={`text-xs ${marketplaceBadgeColor(summary.marketplace)}`}>
                            {summary.marketplace}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold">{summary.totalQty.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{summary.listings.length}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
