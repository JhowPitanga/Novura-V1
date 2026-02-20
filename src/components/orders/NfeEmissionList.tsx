import { useState, useEffect, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { Paginacao } from "./Paginacao";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Settings, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";

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
  const [drawerMode] = useState<'emit' | 'preview' | 'edit'>('emit');
  const navigate = useNavigate();
  
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 10;
  const offset = (page - 1) * limit;
  
  const [processingById, setProcessingById] = useState<Record<string, boolean>>({});
  const [nfeStatusById, setNfeStatusById] = useState<Record<string, string>>({});
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
      const useMock = (searchParams.get('mock') === '1');
      if (useMock) {
        const mocks: OrderData[] = [
          {
            id: 'MOCK-1001',
            marketplace_order_id: 'MLB123456',
            customer_name: 'Cliente Exemplo',
            order_total: 249.9,
            status: 'Emissao NF',
            created_at: new Date().toISOString(),
            order_items: [
              { product_name: 'Teclado Mecânico', quantity: 1, sku: 'TECL-MECH-01' },
            ],
            marketplace: 'Mercado Livre',
            platform_id: 'ITEM-001',
            shipping_type: 'envios',
          },
          {
            id: 'MOCK-1002',
            marketplace_order_id: 'SHP987654',
            customer_name: 'Outro Cliente',
            order_total: 99.9,
            status: 'Falha na emissao',
            created_at: new Date().toISOString(),
            order_items: [
              { product_name: 'Mouse Óptico', quantity: 2, sku: 'MOUSE-OPT-02' },
            ],
            marketplace: 'Shopee',
            platform_id: 'ITEM-002',
            shipping_type: 'envios',
          },
        ];
        setPedidos(mocks);
        setNfeStatusById({
          [mocks[0].id]: mocks[0].status,
          [mocks[1].id]: mocks[1].status,
        });
        return;
      }
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
      const initialStatus: Record<string, string> = {};
      for (const p of parsed) {
        initialStatus[p.id] = p.status;
      }
      setNfeStatusById(initialStatus);
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
  }, [limit, offset, toast, searchParams]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos, onRefreshPedidos]);

  const handleEmitirNfeClick = async (pedidoId: string) => {
    setProcessingById(prev => ({ ...prev, [pedidoId]: true }));
    setNfeStatusById(prev => ({ ...prev, [pedidoId]: 'Processando' }));
    try {
      const { data: sessionRes } = await (supabase as any).auth.getSession();
      const token: string | undefined = sessionRes?.session?.access_token;
      if (!token) throw new Error('Sessão expirada');
      let orgId: string | null = null;
      {
        const { data: orgRes } = await (supabase as any).rpc('get_current_user_organization_id');
        orgId = (Array.isArray(orgRes) ? orgRes?.[0] : orgRes) || null;
      }
      if (!orgId) throw new Error('Organização não encontrada');
      let companyId: string | null = null;
      {
        const { data: companiesForOrg } = await (supabase as any)
          .from('companies')
          .select('id')
          .eq('organization_id', orgId)
          .order('is_active', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1);
        companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
      }
      if (!companyId) throw new Error('Nenhuma empresa ativa encontrada');
      const envSel = emitEnvironment;
      const { error: sendErr } = await (supabase as any).rpc('rpc_queues_emit', {
        p_message: {
          organizations_id: orgId,
          company_id: companyId,
          environment: envSel,
          orderIds: [String(pedidoId)],
        }
      } as any);
      if (sendErr) throw sendErr;
      navigate('/pedidos/emissao_nfe/processando');
    } catch (e) {
      setProcessingById(prev => ({ ...prev, [pedidoId]: false }));
      setNfeStatusById(prev => ({ ...prev, [pedidoId]: 'Falha na emissao' }));
      console.error('Falha ao enfileirar emissão:', e);
      toast({ title: 'Falha ao enfileirar emissão', description: (e as any)?.message || String(e), variant: 'destructive' });
    }
  };

  const handleVerNotaClick = (pedidoId: string) => {};

  const handleEmissaoDrawerClose = () => {};

  const handleEmissaoConcluida = (pedidoId: string) => { try { onRefreshPedidos(); } catch {} };

  const totalPedidos = 12; // Valor mockado.
  const counts = (() => {
    const statusOf = (p: OrderData) => nfeStatusById[p.id] || p.status || '';
    const emitCount = pedidos.filter(p => String(statusOf(p)).toLowerCase() === 'emissao nf').length;
    const failCount = pedidos.filter(p => String(statusOf(p)).toLowerCase() === 'falha na emissao').length;
    const subirXmlCount = pedidos.filter(p => String(statusOf(p)).toLowerCase() === 'subir xml').length;
    return { emitCount, failCount, subirXmlCount };
  })();
  const handleCreateHomologationMocks = async () => {
    try { localStorage.setItem('nfe_environment', 'homologacao'); } catch {}
    try {
      const { error } = await (supabase as any).rpc('rpc_create_mock_orders_emissao_nf');
      if (error) throw error;
      toast({ title: 'Pedido de teste criado', description: '1 pedido adicionado para homologação.' });
      await fetchPedidos();
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: `Falha ao criar pedidos de teste: ${e?.message || 'Erro desconhecido'}`,
        variant: 'destructive'
      });
    }
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
                  {(() => {
                    const st = (nfeStatusById[pedido.id] || pedido.status || '').toLowerCase();
                    if (st === 'processando') {
                      return (
                        <Badge className="bg-white text-purple-700 border border-purple-300 h-6 px-2 inline-flex items-center gap-2 rounded-md">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Processando
                        </Badge>
                      );
                    }
                    if (st === 'falha na emissao') {
                      return <Badge className="bg-red-600 text-white h-6 px-2 inline-flex items-center rounded-md">Falha na emissão</Badge>;
                    }
                    if (st === 'subir xml') {
                      return <Badge className="bg-blue-500 text-white h-6 px-2 inline-flex items-center rounded-md">Subir XML</Badge>;
                    }
                    return <Badge variant="outline" className="h-6 px-2 inline-flex items-center rounded-md">Emissão NF</Badge>;
                  })()}
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
