import { useState, useEffect, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { Paginacao } from "./Paginacao";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams } from "react-router-dom";
import { EmissaoNFDrawer } from './EmissaoNFDrawer';

interface OrderItem {
  product_name: string;
  quantity: number;
  sku: string;
}

interface OrderData {
  id: string;
  marketplace_order_id: string;
  customer_name: string;
  order_total: number;
  status: string;
  created_at: string;
  order_items: OrderItem[];
  marketplace: string;
  platform_id: string;
  shipping_type: string;
}

interface NfeEmitirListaProps {
  onOpenDetalhesPedido: (pedidoId: string) => void;
  onRefreshPedidos: () => void;
}

export function NfeEmitirLista({ onOpenDetalhesPedido, onRefreshPedidos }: NfeEmitirListaProps) {
  const [pedidos, setPedidos] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 10;
  const offset = (page - 1) * limit;
  
  const [isEmissaoDrawerOpen, setIsEmissaoDrawerOpen] = useState(false);
  const [pedidoIdParaEmissao, setPedidoIdParaEmissao] = useState<string | null>(null);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      // Mock data for demonstration since get_orders_for_nfe function doesn't exist
      const mockData: OrderData[] = [
        {
          id: "1",
          marketplace_order_id: "ML001",
          customer_name: "João Silva",
          order_total: 150.00,
          status: "processando",
          created_at: new Date().toISOString(),
          order_items: [
            { product_name: "Produto A", quantity: 2, sku: "SKU001" }
          ],
          marketplace: "Mercado Livre",
          platform_id: "ML123",
          shipping_type: "PAC"
        }
      ];
      
      setPedidos(mockData);
    } catch (error: any) {
      console.error("Erro ao buscar pedidos para NF-e:", error);
      toast({
        title: "Erro",
        description: `Falha ao carregar a lista de pedidos: ${error.message || 'Erro desconhecido'}`,
        variant: "destructive",
      });
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, toast]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos, onRefreshPedidos]);

  const handleEmitirNfeClick = (pedidoId: string) => {
    setPedidoIdParaEmissao(pedidoId);
    setIsEmissaoDrawerOpen(true);
  };

  const handleEmissaoDrawerClose = () => {
    setIsEmissaoDrawerOpen(false);
    setPedidoIdParaEmissao(null);
  };

  const handleEmissaoConcluida = (pedidoId: string) => {
    handleEmissaoDrawerClose();
    onRefreshPedidos();
  };

  const totalPedidos = 12; // Valor mockado.

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-4">
          {[...Array(limit)].map((_, index) => (
            <div key={index} className="bg-white rounded-lg p-4 shadow-sm flex items-center space-x-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </div>
          ))}
        </div>
      ) : pedidos.length === 0 ? (
        <div className="text-center text-gray-500 py-10">
          Nenhum pedido encontrado para emissão de NF-e.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID Pedido</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Valor do Pedido</TableHead>
              <TableHead>Marketplace</TableHead>
              <TableHead>ID Plataforma</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedidos.map((pedido) => (
              <TableRow key={pedido.id}>
                <TableCell className="font-medium">
                  <span className="block text-sm font-bold text-gray-900">{pedido.marketplace_order_id}</span>
                  <span className="block text-xs text-gray-500">{new Date(pedido.created_at).toLocaleDateString()}</span>
                </TableCell>
                <TableCell>
                  {pedido.order_items?.map((item, index) => (
                    <div key={index} className="text-sm">
                      {item.quantity}x {item.product_name} ({item.sku})
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pedido.order_total)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{pedido.marketplace}</Badge>
                </TableCell>
                <TableCell>{pedido.platform_id}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDetalhesPedido(pedido.id)}
                    >
                      Detalhes
                    </Button>
                    <Button size="sm" onClick={() => handleEmitirNfeClick(pedido.id)}>
                      Emitir NF
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Paginacao
        totalItems={totalPedidos}
        limit={limit}
        currentPage={page}
      />

      <EmissaoNFDrawer
        open={isEmissaoDrawerOpen}
        onOpenChange={setIsEmissaoDrawerOpen}
        pedidoId={pedidoIdParaEmissao}
        onEmissaoConcluida={handleEmissaoConcluida}
      />
    </div>
  );
}