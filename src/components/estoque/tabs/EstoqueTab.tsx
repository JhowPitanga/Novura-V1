
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Package } from "lucide-react";
// Removemos o util de badge para customizar o design localmente
import { EstoqueManagementDrawer } from "../EstoqueManagementDrawer";
import { useStockData } from "@/hooks/useStockData";

interface EstoqueTabProps {
  activeFilter: string;
  searchTerm: string;
  selectedGalpao: string;
  selectedCategory: string;
}

export function EstoqueTab({ activeFilter, searchTerm, selectedGalpao, selectedCategory }: EstoqueTabProps) {
  const { stockData, loading, error, refetch } = useStockData();
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Função para calcular o status baseado na quantidade (regras temporárias)
  const getStatusFromStock = (estoque: number, reservado: number) => {
    const disponivel = estoque - reservado;
    if (disponivel <= 0) return "Sem estoque";
    if (disponivel <= 2) return "Crítico";
    if (disponivel < 5) return "Baixo";
    if (disponivel < 10) return "Médio";
    return "Suficiente";
  };

  // Mapeamento de preenchimento e cor da barra por status
  const getBarStyles = (status: string) => {
    switch (status) {
      case "Sem estoque":
        return { percent: 0, color: "bg-red-600" };
      case "Crítico":
        return { percent: 15, color: "bg-red-500" };
      case "Baixo":
        return { percent: 25, color: "bg-orange-500" };
      case "Médio":
        return { percent: 50, color: "bg-yellow-500" };
      case "Suficiente":
        return { percent: 100, color: "bg-green-600" };
      default:
        return { percent: 50, color: "bg-gray-400" };
    }
  };

  // Badge de status abaixo da barra
  const renderStatusBadge = (status: string) => {
    const base = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium";
    switch (status) {
      case "Sem estoque":
        return <span className={`${base} bg-red-600 text-white`}>Sem estoque</span>;
      case "Crítico":
        return <span className={`${base} bg-red-500 text-white`}>Crítico</span>;
      case "Baixo":
        return <span className={`${base} bg-orange-500 text-white`}>Baixo</span>;
      case "Médio":
        return <span className={`${base} bg-yellow-500 text-white`}>Médio</span>;
      case "Suficiente":
        return <span className={`${base} bg-green-600 text-white`}>Suficiente</span>;
      default:
        return <span className={`${base} bg-gray-500 text-white`}>Médio</span>;
    }
  };

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
    status: getStatusFromStock(product.total_current_stock, product.total_reserved_stock),
    image_urls: product.image_urls,
    stock_by_location: product.stock_by_location,
    galpao: product.stock_by_location?.length > 0 
      ? product.stock_by_location[0].storage_name 
      : undefined
  }));

// Filtrar dados baseado na busca, armazém e filtro ativo
  const filteredData = transformedData.filter(item => {
    const matchesSearch = item.produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sku.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filtrar por armazém
    const matchesGalpao = selectedGalpao === "todos" || 
      item.stock_by_location?.some(stock => stock.storage_name === selectedGalpao);

    // Filtrar por categoria
    const matchesCategoria = selectedCategory === "todas" || item.category_id === selectedCategory;
    
    // Filtrar por status baseado no filtro ativo
    const itemStatus = getStatusFromStock(item.estoque, item.reservado);
    if (activeFilter === "estoque" || activeFilter === "total") return matchesSearch && matchesGalpao && matchesCategoria;
    if (activeFilter === "inventario") {
      return matchesSearch && matchesGalpao && matchesCategoria && (itemStatus === "Sem estoque" || itemStatus === "Crítico" || itemStatus === "Baixo");
    }
    if (activeFilter === "sem_estoque") return matchesSearch && matchesGalpao && matchesCategoria && itemStatus === "Sem estoque";
    if (activeFilter === "critico") return matchesSearch && matchesGalpao && matchesCategoria && itemStatus === "Crítico";
    if (activeFilter === "baixo") return matchesSearch && matchesGalpao && matchesCategoria && itemStatus === "Baixo";
    if (activeFilter === "medio") return matchesSearch && matchesGalpao && matchesCategoria && itemStatus === "Médio";
    if (activeFilter === "suficiente") return matchesSearch && matchesGalpao && matchesCategoria && itemStatus === "Suficiente";
    
    return matchesSearch && matchesGalpao && matchesCategoria;
  });

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
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Imagem</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
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
                const currentStatus = getStatusFromStock(item.estoque, item.reservado);
                return (
                  <TableRow key={item.id} className="hover:bg-gray-50/50">
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
                              if (nextSibling) {
                                nextSibling.style.display = 'flex';
                              }
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
                      <div className="w-32">
                        <div className="mb-2">
                          {renderStatusBadge(currentStatus)}
                        </div>
                        <div className="h-2 w-full bg-gray-200 rounded overflow-hidden">
                          {(() => {
                            const { percent, color } = getBarStyles(currentStatus);
                            return (
                              <div
                                className={`h-2 ${color}`}
                                style={{ width: `${percent}%` }}
                              />
                            );
                          })()}
                        </div>
                      </div>
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
                      <p className="text-sm">
                        {item.galpao || 'Não em estoque'}
                      </p>
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EstoqueManagementDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        product={selectedProduct}
        onUpdateStock={handleUpdateStock}
        onStockAdjusted={handleStockAdjusted}
      />
    </div>
  );
}
