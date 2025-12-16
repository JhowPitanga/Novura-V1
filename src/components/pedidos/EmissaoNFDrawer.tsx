import { useState, useEffect, useRef, useId } from "react";
import { X, CheckCircle, AlertTriangle, Loader2, Bot, Settings, ChevronDown } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

function extractXmlMeta(xml: string): { nfeNumber?: string; nfeKey?: string } {
  let nfeNumber: string | undefined = undefined;
  let nfeKey: string | undefined = undefined;
  try {
    const m = xml.match(/<nNF>(\d+)<\/nNF>/);
    if (m && m[1]) nfeNumber = m[1];
  } catch {}
  try {
    const m2 = xml.match(/Id="NFe(\d{44})"/);
    if (m2 && m2[1]) nfeKey = m2[1];
  } catch {}
  if (!nfeKey) {
    try {
      const m3 = xml.match(/<chNFe>(\d{44})<\/chNFe>/);
      if (m3 && m3[1]) nfeKey = m3[1];
    } catch {}
  }
  return { nfeNumber, nfeKey };
}

function renderSefazBadge(status?: string) {
  const v = String(status || "").toLowerCase();
  if (v === "autorizado" || v === "autorizada") return <Badge variant="default">Autorizada</Badge>;
  if (v === "pendente") return <Badge className="bg-yellow-500">Pendente</Badge>;
  if (v === "cancelado" || v === "cancelada") return <Badge variant="destructive">Cancelada</Badge>;
  if (v === "rejeitado" || v === "rejeitada") return <Badge variant="destructive">Rejeitada</Badge>;
  if (v === "denegado" || v === "denegada") return <Badge variant="destructive">Denegada</Badge>;
  if (v === "erro" || v === "error") return <Badge variant="destructive">Erro</Badge>;
  return <Badge variant="outline">{status || "Indefinido"}</Badge>;
}

function renderEnvioBadge(status?: string) {
  const v = String(status || "").toLowerCase();
  if (v === "sent") return <Badge className="bg-green-500 text-white">Enviado</Badge>;
  if (v === "error" || v === "erro") return <Badge variant="destructive">Erro</Badge>;
  if (v === "pending" || v === "pendente") return <Badge className="bg-yellow-500">Pendente</Badge>;
  return <Badge variant="outline">{status || "Pendente"}</Badge>;
}

interface EmissaoNFDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedidoId?: string | null;
  onEmissaoConcluida?: (pedidoId: string) => void;
  onOpenDetails?: (pedidoId: string) => void;
  autoAdvance?: boolean;
  queueIndex?: number;
  queueTotal?: number;
  restartNonce?: number;
  environment?: 'homologacao' | 'producao';
}

type EmissaoStatus = "Processando" | "Sucesso" | "Erro";

interface HistoricoEmissao {
  id: string;
  status: EmissaoStatus;
  mensagem: string;
  timestamp: string;
}

export function EmissaoNFDrawer({ open, onOpenChange, pedidoId, onEmissaoConcluida, onOpenDetails, autoAdvance, queueIndex, queueTotal, restartNonce, environment }: EmissaoNFDrawerProps) {
  const { toast } = useToast();
  const { organizationId: orgFromHook } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [historico, setHistorico] = useState<HistoricoEmissao[]>([]);
  const [emissaoConcluida, setEmissaoConcluida] = useState(false);
  const [pedidosComProblemas, setPedidosComProblemas] = useState<HistoricoEmissao[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [organizationIdState, setOrganizationIdState] = useState<string | null>(null);
  const [companyIdState, setCompanyIdState] = useState<string | null>(null);
  const [nfRow, setNfRow] = useState<any | null>(null);
  const [canSendXml, setCanSendXml] = useState(false);
  const [isRefreshingNf, setIsRefreshingNf] = useState(false);
  const [packIdState, setPackIdState] = useState<number | null>(null);
  const [emitEnvironmentState, setEmitEnvironmentState] = useState<'homologacao' | 'producao'>(() => {
    try {
      const v = environment || localStorage.getItem('nfe_environment') || 'homologacao';
      return v === 'producao' ? 'producao' : 'homologacao';
    } catch {
      return environment === 'producao' ? 'producao' : 'homologacao';
    }
  });
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  const handleSyncNfe = async () => {
    if (!pedidoId) return;
    if (isRefreshingNf) return;
    setIsRefreshingNf(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token: string | undefined = sessionRes?.session?.access_token;
      if (!token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        return;
      }
      let organizationId = organizationIdState || orgFromHook || null;
      if (!organizationId) {
        const { data: orgId } = await supabase.rpc('get_current_user_organization_id');
        organizationId = (Array.isArray(orgId) ? orgId?.[0] : orgId) || null;
      }
      if (!organizationId) {
        toast({ title: "Erro", description: "Organização não encontrada.", variant: "destructive" });
        return;
      }
      let companyId = companyIdState || null;
      if (!companyId) {
        const { data: companiesForOrg } = await supabase
          .from('companies')
          .select('id')
          .eq('organization_id', organizationId)
          .order('is_active', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1);
        companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
      }
      if (!companyId) {
        toast({ title: "Erro", description: "Nenhuma empresa ativa encontrada.", variant: "destructive" });
        return;
      }
      const headers: Record<string, string> = {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      };
      const { data, error } = await supabase.functions.invoke('focus-nfe-sync', {
        body: { organizationId, companyId, orderIds: [String(pedidoId)], environment: emitEnvironmentState },
        headers,
      } as any);
      if (error || (data && data.error)) {
        const msg = error?.message || String((data as any)?.error || "Falha ao sincronizar NF-e");
        toast({ title: "Erro", description: msg, variant: "destructive" });
        return;
      }
      if (organizationId && companyId) {
        try {
          const { data: orderRow } = await (supabase as any)
            .from('marketplace_orders_presented')
            .select('marketplace_order_id')
            .eq('id', pedidoId)
            .limit(1)
            .maybeSingle();
          const marketplaceOrderId = (orderRow as any)?.marketplace_order_id || null;
          if (marketplaceOrderId) {
            const { data: nfSel } = await (supabase as any)
              .from('notas_fiscais')
              .select('*')
              .eq('company_id', companyId)
              .eq('marketplace_order_id', marketplaceOrderId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (nfSel) {
              setNfRow(nfSel);
              const st = String((nfSel as any)?.status_focus || '').toLowerCase();
              const xmlHas = !!((nfSel as any)?.xml_base64 || (nfSel as any)?.xml_url);
              const marketplace = String((nfSel as any)?.marketplace || '');
              const mlSub = String((nfSel as any)?.marketplace_submission_status || '').toLowerCase();
              setCanSendXml(st === 'autorizado' && marketplace.toLowerCase().includes('mercado') && mlSub !== 'sent' && xmlHas);
              setLastStatus(st || null);
            }
          }
        } catch {}
      }
      toast({ title: "Sincronização concluída", description: "Dados da NF-e atualizados.", variant: "default" });
    } finally {
      setIsRefreshingNf(false);
    }
  };

  // Inicia/reinicia a emissão sempre que abrir, mudar pedidoId ou novo restartNonce
  useEffect(() => {
    if (open && pedidoId) {
      handleEmitirNfe(pedidoId);
    }
  }, [open, pedidoId, restartNonce]);

  // Garantir foco dentro do Drawer e evitar foco escondido
  useEffect(() => {
    if (open) {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && !contentRef.current?.contains(activeEl)) {
        activeEl.blur();
      }
      setTimeout(() => {
        const autofocusEl = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        const firstFocusable =
          autofocusEl ||
          contentRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          contentRef.current?.focus();
        }
      }, 0);
    }
  }, [open]);

  const handleEmitirNfe = async (id: string) => {
    setIsProcessing(true);
    setEmissaoConcluida(false);
    setHistorico([]);
    setPedidosComProblemas([]);

    setHistorico(prev => [...prev, {
      id: id,
      status: "Processando",
      mensagem: "Iniciando emissão...",
      timestamp: new Date().toLocaleTimeString(),
    }]);

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token: string | undefined = sessionRes?.session?.access_token;
      if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      let organizationId = orgFromHook || null;
      if (!organizationId) {
        const { data: orgId } = await supabase.rpc('get_current_user_organization_id');
        organizationId = (Array.isArray(orgId) ? orgId?.[0] : orgId) || null;
      }
      if (!organizationId) {
        throw new Error("Organização não encontrada para emissão.");
      }
      setOrganizationIdState(organizationId);

      let companyId: string | null = null;
      {
        const { data: companiesForOrg } = await supabase
          .from('companies')
          .select('id')
          .eq('organization_id', organizationId)
          .order('is_active', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1);
        companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
      }
      if (!companyId) {
        throw new Error("Nenhuma empresa ativa encontrada para emissão.");
      }
      setCompanyIdState(companyId);

      const headers: Record<string, string> = {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      };
      setHistorico(prev => [...prev, { id, status: "Processando", mensagem: "Verificando se existe erro...", timestamp: new Date().toLocaleTimeString() }]);
      {
        const { data: preOrder } = await (supabase as any)
          .from('marketplace_orders_presented_new')
          .select('items_count, items_total_quantity, unlinked_items_count, has_unlinked_items, marketplace_order_id, marketplace, pack_id')
          .eq('id', id)
          .eq('company_id', companyId)
          .eq('organizations_id', organizationId)
          .limit(1)
          .maybeSingle();
        setPackIdState((preOrder as any)?.pack_id ?? null);
        const itemsCount = Number((preOrder as any)?.items_count || 0);
        const itemsQty = Number((preOrder as any)?.items_total_quantity || 0);
        const hasUnlinked = !!(preOrder as any)?.has_unlinked_items;
        const unlinkedCount = Number((preOrder as any)?.unlinked_items_count || 0);
        if (itemsCount <= 0 || itemsQty <= 0) {
          setHistorico(prev => [...prev, { id, status: "Processando", mensagem: "Atualizando dados do pedido...", timestamp: new Date().toLocaleTimeString() }]);
          try { await (supabase as any).rpc('refresh_presented_order', { p_order_id: id }); } catch {}
          const { data: preOrder2 } = await (supabase as any)
            .from('marketplace_orders_presented_new')
            .select('items_count, items_total_quantity, unlinked_items_count, has_unlinked_items, marketplace_order_id, marketplace, pack_id')
            .eq('id', id)
            .eq('company_id', companyId)
            .eq('organizations_id', organizationId)
            .limit(1)
            .maybeSingle();
          setPackIdState((preOrder2 as any)?.pack_id ?? null);
          const itemsCount2 = Number((preOrder2 as any)?.items_count || 0);
          const itemsQty2 = Number((preOrder2 as any)?.items_total_quantity || 0);
          if (itemsCount2 <= 0 || itemsQty2 <= 0) {
            const errorLog = { id, status: "Erro" as EmissaoStatus, mensagem: "Pedido sem itens para emissão.", timestamp: new Date().toLocaleTimeString() };
            setHistorico(prev => [...prev, errorLog]);
            setPedidosComProblemas(prev => [...prev, errorLog]);
            toast({ title: "Erro", description: "Pedido sem itens para emissão.", variant: "destructive" });
            setEmissaoConcluida(true);
            return;
          }
        }
        if (hasUnlinked || unlinkedCount > 0) {
          const errorLog = { id, status: "Erro" as EmissaoStatus, mensagem: "Itens não vinculados a produtos. Vincule antes da emissão.", timestamp: new Date().toLocaleTimeString() };
          setHistorico(prev => [...prev, errorLog]);
          setPedidosComProblemas(prev => [...prev, errorLog]);
          toast({ title: "Itens não vinculados", description: "Vincule todos os itens a produtos para emitir a NF-e.", variant: "destructive" });
          setEmissaoConcluida(true);
          return;
        }
      }
      setHistorico(prev => [...prev, { id, status: "Processando", mensagem: "Validando configuração de NF...", timestamp: new Date().toLocaleTimeString() }]);
      {
        const { data: companyConf } = await (supabase as any)
          .from('companies')
          .select('numero_serie, proxima_nfe')
          .eq('id', companyId)
          .limit(1)
          .maybeSingle();
        const serieOk = !!(companyConf as any)?.numero_serie;
        const proxVal = (companyConf as any)?.proxima_nfe;
        const proxOk = proxVal !== null && proxVal !== undefined;
        if (!serieOk || !proxOk) {
          const errorLog = { id, status: "Erro" as EmissaoStatus, mensagem: "Configuração de NF incompleta (série/numeração).", timestamp: new Date().toLocaleTimeString() };
          setHistorico(prev => [...prev, errorLog]);
          setPedidosComProblemas(prev => [...prev, errorLog]);
          toast({ title: "Configuração NF inválida", description: "Defina série e próxima numeração em Configurações da Empresa.", variant: "destructive" });
          setEmissaoConcluida(true);
          return;
        }
      }
      setHistorico(prev => [...prev, { id, status: "Processando", mensagem: "Validando configuração fiscal...", timestamp: new Date().toLocaleTimeString() }]);
      {
        const { data: taxConf } = await (supabase as any)
          .from('company_tax_configs')
          .select('payload, is_default, natureza_saida, natureza_entrada, icms')
          .eq('company_id', companyId)
          .eq('is_default', true)
          .limit(1)
          .maybeSingle();
        const payload = (taxConf as any)?.payload || {};
        const naturezaSaidaCol = String((taxConf as any)?.natureza_saida || '').trim();
        const basicsNatureza = String(payload?.basics?.naturezaSaida || '').trim();
        const basicsOk = !!(naturezaSaidaCol || basicsNatureza);
        const icmsJson = (taxConf as any)?.icms || payload?.icms || {};
        const hasCfopConfigured = !!(icmsJson?.saida_PF_dentro?.cfop || icmsJson?.saida_PF_fora?.cfop || icmsJson?.saida_PJ_dentro?.cfop || icmsJson?.saida_PJ_fora?.cfop);
        if (!basicsOk || !hasCfopConfigured) {
          const errorLog = { id, status: "Erro" as EmissaoStatus, mensagem: "Configuração fiscal padrão incompleta (CFOP/natureza).", timestamp: new Date().toLocaleTimeString() };
          setHistorico(prev => [...prev, errorLog]);
          setPedidosComProblemas(prev => [...prev, errorLog]);
          toast({ title: "Configuração fiscal inválida", description: "Configure CFOP e Natureza de Saída em Configurações Fiscais.", variant: "destructive" });
          setEmissaoConcluida(true);
          return;
        }
      }
      setHistorico(prev => [...prev, { id, status: "Processando", mensagem: "Enviando nota para o SEFAZ...", timestamp: new Date().toLocaleTimeString() }]);

      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        results?: Array<{ orderId: string; packId?: number | null; ok: boolean; status?: string; error?: string }>;
        error?: string;
      }>('focus-nfe-emit', {
        body: { organizationId, companyId, orderIds: [id], environment: emitEnvironmentState },
        headers,
      } as any);

      if (error || (data && typeof data === "object" && (data as any).error)) {
        const msg = error?.message || String((data as any).error || "Falha na emissão");
        throw new Error(msg);
      }

      const results = (data?.results || []).filter(r => r && r.orderId);
      if (results.length === 0) {
        throw new Error("Resposta inválida da função de emissão.");
      }

      const r = results[0];
      if (!r.ok) {
        const mensagemErro = r.error || "Falha na emissão";
        const errorLog = {
          id: String(r.packId ?? id),
          status: "Erro" as EmissaoStatus,
          mensagem: `Erro: ${mensagemErro}`,
          timestamp: new Date().toLocaleTimeString(),
        };
        setHistorico(prev => [...prev, errorLog]);
        setPedidosComProblemas(prev => [...prev, errorLog]);
        setLastStatus(String(r.status || 'erro'));
        toast({
          title: "Erro",
          description: `Falha na emissão da NF-e. ${mensagemErro}`,
          variant: "destructive",
        });
        setEmissaoConcluida(true);
        return;
      }

      const status = String(r.status || "").toLowerCase();
      setLastStatus(status || null);
      const mensagemSucesso = status === "autorizado" ? "NF-e autorizada" : "NF-e enviada para processamento pela SEFAZ";
      setHistorico(prev => [...prev, {
        id: String(r.packId ?? id),
        status: "Sucesso",
        mensagem: mensagemSucesso,
        timestamp: new Date().toLocaleTimeString(),
      }]);
      setEmissaoConcluida(true);
      toast({
        title: status === "autorizado" ? "Sucesso" : "Enviado",
        description: `Pedido ${id}: ${mensagemSucesso}`,
        variant: "default",
      });

      if (organizationId && companyId) {
        try {
          const { data: orderRow } = await (supabase as any)
            .from('marketplace_orders_presented')
            .select('marketplace_order_id')
            .eq('id', id)
            .limit(1)
            .maybeSingle();
          const marketplaceOrderId = (orderRow as any)?.marketplace_order_id || null;
          if (marketplaceOrderId) {
            const { data: nfSel } = await (supabase as any)
              .from('notas_fiscais')
              .select('*')
              .eq('company_id', companyId)
              .eq('marketplace_order_id', marketplaceOrderId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (nfSel) {
              setNfRow(nfSel);
              const st = String((nfSel as any)?.status_focus || '').toLowerCase();
              const xmlHas = !!((nfSel as any)?.xml_base64 || (nfSel as any)?.xml_url);
              const marketplace = String((nfSel as any)?.marketplace || '');
              const mlSub = String((nfSel as any)?.marketplace_submission_status || '').toLowerCase();
              setCanSendXml(st === 'autorizado' && marketplace.toLowerCase().includes('mercado') && mlSub !== 'sent' && xmlHas);
            }
          }
        } catch (e) {}
      }

    } catch (error: any) {
      const mensagemErro = error.message.includes('não encontrado ou não está pronto') ? 'Pedido não encontrado ou não pronto.' :
                           error.message.includes('já foi emitida') ? 'NF-e já emitida.' :
                           error.message;

      const errorLog = {
        id: id,
        status: "Erro" as EmissaoStatus,
        mensagem: `Erro: ${mensagemErro}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setHistorico(prev => [...prev, errorLog]);
      setPedidosComProblemas(prev => [...prev, errorLog]);
      setLastStatus("erro");
      toast({
        title: "Erro",
        description: `Falha na emissão da NF-e. ${mensagemErro}`,
        variant: "destructive",
      });
      setEmissaoConcluida(true);
      if (autoAdvance && id) {
        try { onEmissaoConcluida?.(String(id)); } catch {}
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = (status: EmissaoStatus) => {
    switch (status) {
      case "Sucesso":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "Erro":
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case "Processando":
        return null;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: EmissaoStatus) => {
    switch (status) {
      case 'Sucesso':
        return <Badge className="bg-green-500 text-white">Sucesso</Badge>;
      case 'Erro':
        return <Badge className="bg-red-500 text-white">Erro</Badge>;
      case 'Processando':
        return <Badge className="bg-blue-500 text-white">Processando</Badge>;
      default:
        return <Badge variant="outline">Aguardando</Badge>;
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        ref={contentRef}
        className="h-full w-2/5 right-0 fixed inset-y-0 flex flex-col bg-white rounded-l-2xl p-0"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DrawerHeader className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex flex-col">
            <DrawerTitle id={titleId} className="text-xl font-bold">Emissão de Notas Fiscais</DrawerTitle>
            <DrawerDescription id={descriptionId}>Acompanhe o processo de emissão e o histórico de eventos.</DrawerDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{emitEnvironmentState === 'homologacao' ? 'Homologação' : 'Produção'}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Mais ações de emissão" className="gap-2">
                  Mais
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    if (pedidoId) {
                      try { (typeof onOpenDetails === 'function') && onOpenDetails(String(pedidoId)); } catch {}
                    }
                  }}
                >
                  Mostrar detalhes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSyncNfe()} disabled={isRefreshingNf}>
                  Sincronizar NF-e
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setEmitEnvironmentState('homologacao');
                    try { localStorage.setItem('nfe_environment', 'homologacao'); } catch {}
                  }}
                >
                  Ambiente: Homologação
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setEmitEnvironmentState('producao');
                    try { localStorage.setItem('nfe_environment', 'producao'); } catch {}
                  }}
                >
                  Ambiente: Produção
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!!queueTotal && !!queueIndex && queueTotal > 0 && (
              <Badge variant="outline">{`Pedido ${Math.min(queueIndex + 1, queueTotal)} de ${queueTotal}`}</Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="rounded-full" data-autofocus>
            <X className="w-5 h-5" />
          </Button>
          </div>
        </DrawerHeader>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col">
          <div className="flex flex-col items-center justify-center space-y-4 mb-8">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
              {isProcessing ? (
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              ) : pedidosComProblemas.length > 0 ? (
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              )}
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {isProcessing ? "Processando emissões..." : (pedidosComProblemas.length > 0 ? "Emissão concluída com erros" : (lastStatus && lastStatus !== 'autorizado' ? "Emissão enviada para processamento" : "Emissão concluída"))}
            </p>
            <div className="text-sm text-gray-600">
              {packIdState ? `Pack ID: ${packIdState}` : null}
            </div>
          </div>

          <div className="space-y-4 flex-1">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="history">
                <AccordionTrigger>Mensagens de Busca</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {historico.map((log, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <div className="flex-none pt-1">{getStatusIcon(log.status)}</div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">Pack {log.id}</p>
                          <p className="text-sm text-gray-600">{log.mensagem}</p>
                          <p className="text-xs text-gray-400 mt-1">{log.timestamp}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {emissaoConcluida && pedidosComProblemas.length > 0 && (
            <div className="mt-6">
              <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h4 className="font-semibold text-red-700">Pedidos com Problemas</h4>
                </div>
                {pedidosComProblemas.map((problema, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-start text-sm">
                      <span className="font-medium mr-1">{problema.id}:</span>
                      <p className="text-red-600">{problema.mensagem}</p>
                    </div>
                  </div>
                ))}
                {pedidoId && (
                  <div className="mt-4">
                    <Button
                      onClick={() => handleEmitirNfe(String(pedidoId))}
                      className="w-full h-10 rounded-xl bg-red-600 hover:bg-red-700"
                    >
                      Reenviar correção
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

        

        {emissaoConcluida && nfRow && (
          <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-800">NF-e #{String((nfRow as any)?.nfe_number || '')}</p>
                <p className="text-xs text-gray-600">Série: {String((nfRow as any)?.serie || '')}</p>
                <p className="text-xs font-mono text-gray-600">Chave: {String((nfRow as any)?.nfe_key || '')}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <p className="text-gray-600">Status SEFAZ</p>
                    {renderSefazBadge(String((nfRow as any)?.status_focus || ''))}
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-600">Autorizado em</p>
                    <span className="text-gray-800">{(nfRow as any)?.authorized_at ? new Date(String((nfRow as any)?.authorized_at)).toLocaleString('pt-BR') : '-'}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-600">Marketplace</p>
                    <span className="text-gray-800">{String((nfRow as any)?.marketplace || '')}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-600">Pack ID</p>
                    <span className="text-gray-800">{String((nfRow as any)?.pack_id ?? '')}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-600">Envio XML</p>
                    {renderEnvioBadge(String((nfRow as any)?.marketplace_submission_status || 'pendente'))}
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-600">ID Documento Fiscal (ML)</p>
                    <span className="text-gray-800">{String((nfRow as any)?.marketplace_fiscal_document_id || '') || '-'}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    disabled={!canSendXml}
                    onClick={async () => {
                      try {
                        const { data: sessionRes } = await supabase.auth.getSession();
                        const token: string | undefined = sessionRes?.session?.access_token;
                        if (!token) throw new Error("Sessão expirada");
                        const headers: Record<string, string> = {
                          apikey: SUPABASE_PUBLISHABLE_KEY,
                          Authorization: `Bearer ${token}`,
                        };
                        const { data, error } = await supabase.functions.invoke<any>('mercado-livre-submit-xml', {
                          body: {
                            organizationId: organizationIdState,
                            companyId: companyIdState,
                            notaFiscalId: (nfRow as any)?.id,
                          },
                          headers,
                        } as any);
                        if (error || (data && data.error)) {
                          throw new Error(error?.message || data?.error || "Falha ao enviar XML");
                        }
                        const status = String(data?.status || 'sent');
                        toast({ title: "Envio de XML", description: `XML enviado ao Mercado Livre (${status}).`, variant: "default" });
                        setIsRefreshingNf(true);
                        const { data: nfRefresh } = await (supabase as any)
                          .from('notas_fiscais')
                          .select('*')
                          .eq('id', (nfRow as any)?.id)
                          .limit(1)
                          .maybeSingle();
                        if (nfRefresh) setNfRow(nfRefresh);
                        setIsRefreshingNf(false);
                      } catch (e: any) {
                        setIsRefreshingNf(false);
                        toast({ title: "Erro no envio", description: e?.message || String(e), variant: "destructive" });
                      }
                    }}
                    className="bg-novura-primary hover:bg-novura-primary/90"
                  >
                    Enviar NFe
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        setIsRefreshingNf(true);
                        const { data: nfRefresh } = await (supabase as any)
                          .from('notas_fiscais')
                          .select('*')
                          .eq('id', (nfRow as any)?.id)
                          .limit(1)
                          .maybeSingle();
                        if (nfRefresh) {
                          setNfRow(nfRefresh);
                          const st = String((nfRefresh as any)?.status_focus || '').toLowerCase();
                          const xmlHas = !!((nfRefresh as any)?.xml_base64 || (nfRefresh as any)?.xml_url);
                          const marketplace = String((nfRefresh as any)?.marketplace || '');
                          const mlSub = String((nfRefresh as any)?.marketplace_submission_status || '').toLowerCase();
                          setCanSendXml(st === 'autorizado' && marketplace.toLowerCase().includes('mercado') && mlSub !== 'sent' && xmlHas);
                        }
                      } finally {
                        setIsRefreshingNf(false);
                      }
                    }}
                  >
                    {isRefreshingNf ? "Atualizando..." : "Atualizar dados"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!((nfRow as any)?.xml_base64)}
                    onClick={() => {
                      try {
                        const xmlText = atob(String((nfRow as any)?.xml_base64 || ''));
                        const blob = new Blob([xmlText], { type: 'application/xml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        const meta = extractXmlMeta(xmlText);
                        const nfeNum = String((nfRow as any)?.nfe_number || meta.nfeNumber || '').trim();
                        const nfeKey = String((nfRow as any)?.nfe_key || meta.nfeKey || '').trim();
                        const base = nfeNum ? `nfe_${nfeNum}` : (nfeKey ? `nfe_${nfeKey}` : 'nfe');
                        a.download = `${base}.xml`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {}
                    }}
                  >
                    Download XML
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!((nfRow as any)?.pdf_base64)}
                    onClick={() => {
                      try {
                        const pdfBytes = Uint8Array.from(atob(String((nfRow as any)?.pdf_base64 || '')), c => c.charCodeAt(0));
                        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `danfe_${String((nfRow as any)?.nfe_number || '')}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {}
                    }}
                  >
                    Download PDF
                  </Button>
                </div>
              </div>
            </div>
            {!canSendXml && <p className="text-xs text-gray-500 mt-2">Aguardando autorização e recebimento do XML pelo webhook ou já enviado ao marketplace.</p>}
          </div>
        )}

        </div>

        {emissaoConcluida && (
          <div className="p-6 border-t border-gray-100 flex-none">
            <Button
              onClick={() => {
                if (pedidoId) onEmissaoConcluida?.(String(pedidoId));
                onOpenChange(false);
              }}
              className="w-full h-12 rounded-2xl bg-novura-primary"
            >
              Concluir
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
