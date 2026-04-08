import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { OrderPagination as Paginacao } from "./Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Settings, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNfeEmissionOrders } from "@/hooks/useNfeEmissionOrders";
import { emitNfeQueue, getCompanyIdForOrg, type NfeEmissionOrderData } from "@/services/orders.service";

/** Normalize a status string to lowercase with underscores for comparison. */
function normSt(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').trim();
}

const NFE_EMIT_SLUGS = new Set(['invoice_pending', 'emissao_nf', 'emissao nf']);
const NFE_FAIL_SLUGS = new Set(['nfe_error', 'falha_na_emissao', 'falha na emissao']);
const NFE_XML_SLUGS = new Set(['nfe_xml_pending', 'subir_xml', 'subir xml']);

interface NfeEmitirListaProps {
  onOpenDetalhesPedido: (pedidoId: string) => void;
  onRefreshPedidos: () => void;
}

const MOCK_ORDERS: NfeEmissionOrderData[] = [
  {
    id: 'MOCK-1001',
    marketplace_order_id: 'MLB123456',
    customer_name: 'Cliente Exemplo',
    order_total: 249.9,
    status: 'invoice_pending',
    created_at: new Date().toISOString(),
    order_items: [{ product_name: 'Teclado Mecânico', quantity: 1, sku: 'TECL-MECH-01' }],
    marketplace: 'Mercado Livre',
    platform_id: 'ITEM-001',
    shipping_type: 'envios',
  },
  {
    id: 'MOCK-1002',
    marketplace_order_id: 'SHP987654',
    customer_name: 'Outro Cliente',
    order_total: 99.9,
    status: 'nfe_error',
    created_at: new Date().toISOString(),
    order_items: [{ product_name: 'Mouse Óptico', quantity: 2, sku: 'MOUSE-OPT-02' }],
    marketplace: 'Shopee',
    platform_id: 'ITEM-002',
    shipping_type: 'envios',
  },
];

export function NfeEmissionList({ onOpenDetalhesPedido, onRefreshPedidos }: NfeEmitirListaProps) {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { organizationId } = useAuth();

  const page = parseInt(searchParams.get('page') || '1');
  const useMock = searchParams.get('mock') === '1';
  const limit = 10;
  const offset = (page - 1) * limit;

  const [processingById, setProcessingById] = useState<Record<string, boolean>>({});
  const [transientStatusById, setTransientStatusById] = useState<Record<string, string>>({});
  const [emitEnvironment, setEmitEnvironment] = useState<'homologacao' | 'producao'>(() => {
    try {
      const v = localStorage.getItem('nfe_environment');
      return v === 'producao' ? 'producao' : 'homologacao';
    } catch {
      return 'homologacao';
    }
  });

  const { orders: fetchedOrders, totalCount, isLoading, refetch } = useNfeEmissionOrders(
    useMock ? null : organizationId,
    offset,
    limit,
  );

  const pedidos = useMock ? MOCK_ORDERS : fetchedOrders;
  const totalPedidos = useMock ? MOCK_ORDERS.length : totalCount;

  const statusOf = (p: NfeEmissionOrderData): string =>
    transientStatusById[p.id] ?? p.status ?? '';

  const counts = {
    emitCount: pedidos.filter(p => NFE_EMIT_SLUGS.has(normSt(statusOf(p)))).length,
    failCount: pedidos.filter(p => NFE_FAIL_SLUGS.has(normSt(statusOf(p)))).length,
    subirXmlCount: pedidos.filter(p => NFE_XML_SLUGS.has(normSt(statusOf(p)))).length,
  };

  const handleEmitirNfeClick = async (pedidoId: string) => {
    setProcessingById(prev => ({ ...prev, [pedidoId]: true }));
    setTransientStatusById(prev => ({ ...prev, [pedidoId]: 'processando' }));
    try {
      const orgId = organizationId;
      if (!orgId) throw new Error('Organização não encontrada');
      const companyId = await getCompanyIdForOrg(orgId);
      if (!companyId) throw new Error('Nenhuma empresa ativa encontrada');
      await emitNfeQueue(orgId, companyId, [pedidoId], emitEnvironment);
      navigate('/pedidos/emissao_nfe/processando');
    } catch (e) {
      setProcessingById(prev => ({ ...prev, [pedidoId]: false }));
      setTransientStatusById(prev => ({ ...prev, [pedidoId]: 'nfe_error' }));
      console.error('Falha ao enfileirar emissão:', e);
      toast({ title: 'Falha ao enfileirar emissão', description: (e as any)?.message || String(e), variant: 'destructive' });
    }
  };

  const handleCreateHomologationMocks = async () => {
    try { localStorage.setItem('nfe_environment', 'homologacao'); } catch {}
    try {
      const { error } = await (supabase as any).rpc('rpc_create_mock_orders_emissao_nf');
      if (error) throw error;
      toast({ title: 'Pedido de teste criado', description: '1 pedido adicionado para homologação.' });
      refetch();
      onRefreshPedidos();
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: `Falha ao criar pedidos de teste: ${e?.message || 'Erro desconhecido'}`,
        variant: 'destructive',
      });
    }
  };

  const renderNfeStatusBadge = (pedidoId: string, pedidoStatus: string) => {
    const st = normSt(transientStatusById[pedidoId] ?? pedidoStatus ?? '');
    if (st === 'processando') {
      return (
        <Badge className="bg-white text-purple-700 border border-purple-300 h-6 px-2 inline-flex items-center gap-2 rounded-md">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processando
        </Badge>
      );
    }
    if (NFE_FAIL_SLUGS.has(st)) {
      return <Badge className="bg-red-600 text-white h-6 px-2 inline-flex items-center rounded-md">Falha na emissão</Badge>;
    }
    if (NFE_XML_SLUGS.has(st)) {
      return <Badge className="bg-blue-500 text-white h-6 px-2 inline-flex items-center rounded-md">Subir XML</Badge>;
    }
    return <Badge variant="outline" className="h-6 px-2 inline-flex items-center rounded-md">Emissão NF</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Emissão de NFe</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Emitir ({counts.emitCount})</Badge>
            <Badge className="bg-blue-500 text-white">Processando ({Object.values(processingById).filter(Boolean).length})</Badge>
            <Badge className="bg-red-500 text-white">Falha ({counts.failCount})</Badge>
            <Badge variant="outline">Subir XML ({counts.subirXmlCount})</Badge>
            <Button variant="outline" onClick={handleCreateHomologationMocks}>
              Criar pedidos de teste (Homologação)
            </Button>
          </div>
        </CardContent>
      </Card>
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
      {isLoading ? (
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
              <TableHead>NF-e</TableHead>
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
                  {renderNfeStatusBadge(pedido.id, pedido.status)}
                </TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDetalhesPedido(pedido.id)}
                    >
                      Detalhes
                    </Button>
                    {processingById[pedido.id] ? (
                      <Button variant="outline" size="sm" disabled className="inline-flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processando
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleEmitirNfeClick(pedido.id)}>
                        Emitir
                      </Button>
                    )}
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
    </div>
  );
}
