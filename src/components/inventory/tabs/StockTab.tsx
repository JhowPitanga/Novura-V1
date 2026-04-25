
import { Fragment, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Settings, Package, ChevronDown, ChevronUp, Warehouse, Boxes, AlertTriangle, DollarSign } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InventoryManagementDrawer } from "../InventoryManagementDrawer";
import { useStockData } from "@/hooks/useStockData";
import { useStorage } from "@/hooks/useStorage";
import type { Storage } from "@/hooks/useStorage";

interface EstoqueTabProps {
  activeFilter: string;
  searchTerm: string;
  /** "todos" or storage row id — aligns filter with stock_by_location.storage_id */
  selectedWarehouseFilter: string;
  selectedCategory: string;
}

/** Resolve catalog storage id for a stock row (prefer storage_id; fallback name match). */
function resolveStorageIdForRow(
  loc: { storage_id?: string; storage_name?: string },
  storageLocations: Storage[]
): string | null {
  if (loc.storage_id != null && String(loc.storage_id).length > 0) {
    return String(loc.storage_id);
  }
  const nm = String(loc.storage_name || "").trim();
  if (!nm) return null;
  const hit = storageLocations.find((s) => String(s.name || "").trim() === nm);
  return hit ? String(hit.id) : null;
}

export function StockTab({ activeFilter, searchTerm, selectedWarehouseFilter, selectedCategory }: EstoqueTabProps) {
  const { stockData, loading, error, refetch } = useStockData();
  const { storageLocations } = useStorage();
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // Transformar dados do Supabase para o formato esperado pelo componente
  const transformedData = stockData.map(product => ({
    id: product.id,
    produto: product.type === 'VARIACAO_ITEM' && product.parent_product_name
      ? `${product.parent_product_name} (${product.name})`
      : product.name,
    sku: product.sku,
    categoria: product.category_name ?? null,
    category_id: product.category_id ?? null,
    precoCusto: product.cost_price,
    estoque: product.total_current_stock,
    reservado: product.total_reserved_stock,
    disponivel: product.total_available_stock,
    image_urls: product.image_urls,
    stock_by_location: product.stock_by_location,
    galpao: product.stock_by_location?.length > 0 
      ? product.stock_by_location[0].storage_name 
      : undefined
  }));

  const normalize = (v: string) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const smartMatch = (text: string, term: string) => {
    const hay = normalize(text);
    const tokens = normalize(term).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.every((t) => hay.includes(t));
  };

  const baseFilteredData = transformedData.filter(item => {
    const haystack = `${item.produto} ${item.sku}`;
    const matchesSearch = smartMatch(haystack, searchTerm);
    
    const matchesWarehouse =
      selectedWarehouseFilter === "todos" ||
      item.stock_by_location?.some((stock) => {
        const sid = resolveStorageIdForRow(stock, storageLocations);
        return sid != null && sid === String(selectedWarehouseFilter);
      });

    // Filtrar por categoria
    const matchesCategoria = selectedCategory === "todas" || item.category_id === selectedCategory;
    
    return matchesSearch && matchesWarehouse && matchesCategoria;
  });

  // Filtrar dados baseado no filtro ativo (sem estoque ou todos)
  const filteredData = baseFilteredData.filter((item) => {
    const isNoStock = Number(item.disponivel || 0) <= 0;
    if (activeFilter === "sem_estoque") return isNoStock;
    return true;
  });

  const noStockCount = baseFilteredData.filter(item => Number(item.disponivel || 0) <= 0).length;
  const totalStockQty = baseFilteredData.reduce((acc, item) => acc + Number(item.estoque || 0), 0);
  const totalCostInStock = baseFilteredData.reduce(
    (acc, item) => acc + (Number(item.precoCusto || 0) * Number(item.estoque || 0)),
    0
  );
  const storageNameById = new Map<string, string>();
  for (const storage of storageLocations) {
    storageNameById.set(String(storage.id), String(storage.name || "Armazém"));
  }
  // Only aggregate storages that appear in stock rows — pre-filling all storages with 0
  // would flood the top-N list with empty warehouses and wrong % emphasis after slice().
  const warehouseTotalsById = new Map<string, number>();
  const fallbackNameById = new Map<string, string>();
  for (const item of baseFilteredData) {
    for (const loc of item.stock_by_location || []) {
      const sid = resolveStorageIdForRow(loc, storageLocations);
      if (!sid) continue;
      if (selectedWarehouseFilter !== "todos" && sid !== String(selectedWarehouseFilter)) {
        continue;
      }
      if (!warehouseTotalsById.has(sid)) {
        warehouseTotalsById.set(sid, 0);
        fallbackNameById.set(sid, String(loc.storage_name || "Armazém"));
      }
      const add = Number(loc.current || 0);
      warehouseTotalsById.set(sid, (warehouseTotalsById.get(sid) || 0) + add);
    }
  }
  const totalFromWarehouseLocations = Array.from(warehouseTotalsById.values()).reduce((a, b) => a + b, 0);

  let warehouseDistribution = Array.from(warehouseTotalsById.entries())
    .map(([id, qty]) => ({
      id,
      name: storageNameById.get(id) || fallbackNameById.get(id) || "Armazém",
      qty,
      pct: totalFromWarehouseLocations > 0 ? (qty / totalFromWarehouseLocations) * 100 : 0,
    }))
    .filter((w) => w.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  if (selectedWarehouseFilter !== "todos") {
    const sel = warehouseDistribution.find((d) => d.id === String(selectedWarehouseFilter));
    if (sel) {
      warehouseDistribution = [sel, ...warehouseDistribution.filter((d) => d.id !== String(selectedWarehouseFilter))];
    }
  }
  warehouseDistribution = warehouseDistribution.slice(0, 10);
  const topWarehouse = warehouseDistribution[0];
  const secondaryWarehouse = warehouseDistribution[1];
  const remainingWarehousesCount = Math.max(0, warehouseDistribution.length - 2);

  const handleManageStockClick = (product: any) => {
    setSelectedProduct(product);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedProduct(null);
  };

  const handleStockAdjusted = () => {
    handleCloseDrawer();
    refetch(); // Reload products after stock adjustment
  };

  const handleUpdateStock = async (productId: string, newStock: number) => {
    // Aqui você pode implementar a lógica para atualizar o estoque no Supabase
    // Por enquanto, vamos apenas recarregar os dados
    await refetch();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Carregando estoque...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-destructive">Erro: {error}</div>
      </div>
    );
  }

  if (filteredData.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-muted-foreground">
              Nenhum produto encontrado. Cadastre produtos na aba de Produtos.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
          <CardContent className="p-4 h-[140px] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Estoque total</p>
                <p className="text-2xl font-bold mt-1">{totalStockQty.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-full p-2 bg-[#7C3AED]/15 text-[#7C3AED]">
                <Boxes className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
          <CardContent className="p-4 h-[140px] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Produtos sem estoque</p>
                <p className="text-2xl font-bold mt-1">{noStockCount.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-full p-2 bg-red-500/15 text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
          <CardContent className="p-4 h-[140px] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Custo em estoque</p>
                <p className="text-2xl font-bold mt-1">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalCostInStock)}
                </p>
              </div>
              <div className="rounded-full p-2 bg-emerald-500/15 text-emerald-600">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
          <CardContent className="p-4 h-[140px] flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Distribuição por armazém</p>
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-[#7C3AED]" />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#7C3AED]/15 text-[#7C3AED] hover:bg-[#7C3AED]/25 transition"
                      aria-label="Ver distribuição completa por armazém"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[280px] p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Todos os armazéns</p>
                    <div className="max-h-64 overflow-auto space-y-2 pr-1">
                      {warehouseDistribution.map((w) => (
                        <div key={w.id}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate max-w-[180px]">{w.name}</span>
                            <span className="font-semibold">{w.pct.toFixed(0)}% ({w.qty})</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full bg-[#7C3AED]" style={{ width: `${Math.max(2, w.pct)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2 flex-1">
              {warehouseDistribution.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem dados de distribuição.</p>
              )}
              {topWarehouse && (
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="pr-2 break-words leading-tight">{topWarehouse.name}</span>
                    <span className="font-semibold">{topWarehouse.pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full bg-[#7C3AED]" style={{ width: `${Math.max(2, topWarehouse.pct)}%` }} />
                  </div>
                </div>
              )}
              {secondaryWarehouse && (
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="pr-2 break-words leading-tight">{secondaryWarehouse.name}</span>
                    <span className="font-medium">{secondaryWarehouse.pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full bg-[#A78BFA]" style={{ width: `${Math.max(2, secondaryWarehouse.pct)}%` }} />
                  </div>
                </div>
              )}
              {remainingWarehousesCount > 0 && (
                <p className="text-[11px] text-[#7C3AED] font-medium">
                  +{remainingWarehousesCount} armazém{remainingWarehousesCount > 1 ? "ns" : ""} (clique na seta para ver todos)
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="px-4 pt-4">
          <h3 className="text-sm font-semibold text-gray-800">Controle de Estoque</h3>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Imagem</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço de Custo</TableHead>
            <TableHead>Armazém Principal</TableHead>
                <TableHead>Reservado</TableHead>
                <TableHead>Disponível</TableHead>
                <TableHead>Estoque Atual</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item) => {
                const isExpanded = expandedProducts.has(String(item.id));
                return (
                  <Fragment key={item.id}>
                    <TableRow className="hover:bg-gray-50/50">
                      <TableCell>
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                          {item.image_urls && item.image_urls.length > 0 ? (
                            <img 
                              src={item.image_urls[0]} 
                              alt={item.produto}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                target.style.display = 'none';
                                const nextSibling = target.nextElementSibling as HTMLElement;
                                if (nextSibling) nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{item.produto}</p>
                          <p className="font-mono text-xs text-muted-foreground mt-0.5">{item.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{item.categoria || '—'}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {item.precoCusto ? new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          }).format(item.precoCusto) : 'N/A'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm">{item.galpao || 'Não em estoque'}</p>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-novura-primary hover:underline"
                            onClick={() => setExpandedProducts(prev => {
                              const n = new Set(prev);
                              if (n.has(String(item.id))) n.delete(String(item.id));
                              else n.add(String(item.id));
                              return n;
                            })}
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {isExpanded ? "Ocultar armazéns" : "Ver armazéns"}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          <p className="font-bold text-orange-600">{item.reservado}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          <p className="font-bold text-green-600">{item.disponivel}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          <p className="font-bold text-2xl text-primary">{item.estoque}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleManageStockClick(item)}
                          className="h-8 px-2"
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Gerenciar
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-gray-50">
                        <TableCell colSpan={9}>
                          <div className="rounded-lg border bg-white">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Armazém</TableHead>
                                  <TableHead className="text-right">Reservado</TableHead>
                                  <TableHead className="text-right">Disponível</TableHead>
                                  <TableHead className="text-right">Estoque atual</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(item.stock_by_location || []).map((loc: any) => (
                                  <TableRow key={loc.storage_id}>
                                    <TableCell>{loc.storage_name}</TableCell>
                                    <TableCell className="text-right font-semibold text-orange-600">{loc.reserved}</TableCell>
                                    <TableCell className="text-right font-semibold text-green-600">{loc.available}</TableCell>
                                    <TableCell className="text-right font-semibold text-primary">{loc.current}</TableCell>
                                  </TableRow>
                                ))}
                                {(item.stock_by_location || []).length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">
                                      Sem distribuição por armazém para este produto.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <InventoryManagementDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        product={selectedProduct}
        onUpdateStock={handleUpdateStock}
        onStockAdjusted={handleStockAdjusted}
      />
    </div>
  );
}
