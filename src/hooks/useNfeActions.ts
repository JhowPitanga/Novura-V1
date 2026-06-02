/**
 * NFe emission and status actions.
 * One responsibility: emit queue, sync NFe status, send XML to marketplace.
 * Extracted from useOrdersActions (Commit B2).
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  emitNfeQueue,
  submitXmlSend,
  syncNfeForOrder,
  updateOrdersInternalStatus,
} from "@/services/orders.service";
import { toast } from "@/components/ui/use-toast";

interface UseNfeActionsParams {
  organizationId: string | null | undefined;
  emitEnvironment: 'homologacao' | 'producao';
  getCompanyId: () => Promise<string | null>;
  refreshNfe: () => Promise<void>;
}

export function useNfeActions({
  organizationId,
  emitEnvironment,
  getCompanyId,
  refreshNfe,
}: UseNfeActionsParams) {
  const navigate = useNavigate();
  const [xmlLoadingIds, setXmlLoadingIds] = useState<string[]>([]);

  // xmlLoadingSet rebuilt new Set() each render — identity breaks feed rowViewModels deps.
  const xmlLoadingSet = new Set(xmlLoadingIds);

  const handleEmitirNfe = useCallback(async (
    pedidosToEmit: any[],
    opts?: { forceNewNumber?: boolean; forceNewRef?: boolean },
  ) => {
    if (!pedidosToEmit || pedidosToEmit.length === 0) return;
    try {
      if (!organizationId) throw new Error("Organização não encontrada");
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Nenhuma empresa ativa encontrada");
      const orderIds = pedidosToEmit.map(p => String(p.id)).filter(Boolean);
      let envSel: string = 'homologacao';
      try { envSel = localStorage.getItem('nfe_environment') || 'homologacao'; } catch { }
      await emitNfeQueue(organizationId, companyId, orderIds, envSel, {
        forceNewNumber: !!(opts?.forceNewNumber),
        forceNewRef: !!(opts?.forceNewRef),
      });
      try {
        await updateOrdersInternalStatus(orderIds, 'Processando NF');
      } catch { }
      navigate('/pedidos/emissao_nfe/processando');
    } catch {
      // silent — pre-existing debt; do not fix here (behavior-preserving)
    }
  }, [organizationId, getCompanyId, navigate]);

  const handleSyncNfeForPedido = useCallback(async (pedido: any) => {
    try {
      if (!organizationId) return;
      const companyId = await getCompanyId();
      if (!companyId) return;
      await syncNfeForOrder(organizationId, companyId, String(pedido.id), emitEnvironment);
      await refreshNfe();
    } catch { }
  }, [organizationId, getCompanyId, emitEnvironment, refreshNfe]);

  const handleEnviarNfeForPedido = useCallback(async (pedido: any) => {
    try {
      setXmlLoadingIds(prev => Array.from(new Set([...prev, String(pedido.id)])));
      if (!organizationId) throw new Error('Organização não encontrada.');
      const companyId = await getCompanyId();
      if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
      await submitXmlSend(organizationId, companyId, String(pedido.marketplaceOrderId || ''));
      toast({ title: "XML enfileirado", description: "Envio agendado para processamento." });
    } catch (e: any) {
      toast({ title: "Erro no envio", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setXmlLoadingIds(prev => prev.filter(id => id !== String(pedido.id)));
    }
  }, [organizationId, getCompanyId]);

  return { xmlLoadingSet, handleEmitirNfe, handleSyncNfeForPedido, handleEnviarNfeForPedido };
}
