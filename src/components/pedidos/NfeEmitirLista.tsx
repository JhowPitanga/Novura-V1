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
import { Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const [restartNonce, setRestartNonce] = useState(0);
  const [emitEnvironment, setEmitEnvironment] = useState<'homologacao' | 'producao'>(() => {
    try {
      const v = localStorage.getItem('nfe_environment');
      return v === 'producao' ? 'producao' : 'homologacao';
    } catch {
      return 'homologacao';
    }
  });

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      let orgId: string | null = null;
      {
        const { data: orgRes } = await supabase.rpc('get_current_user_organization_id');
        orgId = (Array.isArray(orgRes) ? orgRes?.[0] : orgRes) || null;
      }
      let q: any = (supabase as any)
        .from('marketplace_orders_presented_new')
        .select(`
          id,
          marketplace_order_id,
          created_at,
          marketplace,
          shipping_type,
          status_interno,
          first_item_title,
          first_item_sku,
          items_total_quantity,
          first_item_id
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (orgId) {
        q = (q as any).eq('organizations_id', orgId);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : [];
      const parsed: OrderData[] = rows
        .filter((o: any) => String(o?.status_interno || '') === 'Emissao NF')
        .map((o: any) => ({
          id: String(o.id),
          marketplace_order_id: String(o.marketplace_order_id || o.id),
          customer_name: '',
          order_total: 0,
          status: String(o.status_interno || ''),
          created_at: String(o.created_at),
          order_items: [
            {
              product_name: String(o.first_item_title || ''),
              quantity: Number(o.items_total_quantity || 1),
              sku: String(o.first_item_sku || '')
            }
          ],
          marketplace: String(o.marketplace || ''),
          platform_id: String(o.first_item_id || ''),
          shipping_type: String(o.shipping_type || '')
        }));
      setPedidos(parsed);
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
    setRestartNonce((n) => n + 1);
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
      <div className="flex justify-end space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Configurar ambiente de emissão">
              <Settings className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setEmitEnvironment('homologacao');
                try { localStorage.setItem('nfe_environment', 'homologacao'); } catch {}
              }}
            >
              Ambiente: Homologação
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setEmitEnvironment('producao');
                try { localStorage.setItem('nfe_environment', 'producao'); } catch {}
              }}
            >
              Ambiente: Produção
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
        restartNonce={restartNonce}
        environment={emitEnvironment}
      />
    </div>
  );
}
