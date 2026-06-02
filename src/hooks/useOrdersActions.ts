/**
 * Bulk-action hook for the Orders page (Commit B1 — dead code removed).
 *
 * Dead handlers removed (controller owns live versions; grep-confirmed no other consumers):
 *   - handleScan, handleCompleteBipagem, handleSaveVinculacoes (overridden by controller)
 *   - handleSyncSelectedOrders (was a no-op placeholder in actions; controller has real impl)
 *   - handleGerarNovaNfeForPedido (zero consumers anywhere — grep confirmed)
 *   - internal processingIdsLocal/Set/addProcessingId (controller owns its own; actions copy
 *     was never read by any consumer pipeline)
 *   - internal companyIdRef/getCompanyId (deduped → useCompanyIdCache injected via param)
 *
 * Commit B2 will split this into useNfeActions + useOrderSyncActions + usePrintActions.
 */
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  arrangeShopeeShipment,
  emitNfeQueue,
  fetchOrderByInternalId,
  fetchShopeeShops as fetchShopeeShopsSvc,
  markOrdersPrinted,
  submitXmlSend,
  syncMercadoLivreOrders,
  syncNfeForOrder,
  syncShopeeOrders,
  updateOrdersInternalStatus,
} from "@/services/orders.service";
import { generateFunctionalPickingListPDF } from "@/utils/pdfGenerators";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs } from "@/lib/datetime";
import { exportOrdersCsv } from "@/utils/orderCsvUtils";
import { toast } from "@/components/ui/use-toast";
import type { Order } from "@/types/orders";

interface UseOrdersActionsParams {
  organizationId: string | null | undefined;
  activeStatus: string;
  emitEnvironment: 'homologacao' | 'producao';
  pedidos: Order[];
  setPedidos: React.Dispatch<React.SetStateAction<Order[]>>;
  filteredOrders: Order[];
  printSettings: any;
  selectedPedidosImpressao: string[];
  shopeeOrderSnInput: string;
  shopeeDateFrom: string;
  shopeeDateTo: string;
  selectedShopeeShopId: number | null;
  onSyncComplete: () => Promise<void>;
  onClearSelections: () => void;
  onSetSelectedPedidosImpressao: React.Dispatch<React.SetStateAction<string[]>>;
  onSetSelectedPedidosEmissao: React.Dispatch<React.SetStateAction<string[]>>;
  onSetSelectedPedidos: React.Dispatch<React.SetStateAction<string[]>>;
  onSetSelectedPedidosEnviado: React.Dispatch<React.SetStateAction<string[]>>;
  onSetScannedPedido: (v: any) => void;
  onSetScannedSku: (v: string) => void;
  onSetScannerOpen: (v: boolean) => void;
  onSetCompleteModalOpen: (v: boolean) => void;
  onSetIsSyncModalOpen: (v: boolean) => void;
  onSetShopeeShopOptions: (v: Array<{ id: string; shop_id: number; label: string }>) => void;
  onSetSelectedShopeeShopId: (v: number | null) => void;
  printOrders: Order[];
  notPrintedOrders: Order[];
  printedOrders: Order[];
  getCompanyId: () => Promise<string | null>;
}

export interface UseOrdersActionsResult {
  isSyncing: boolean;
  xmlLoadingSet: Set<string>;
  arrangeLoadingSet: Set<string>;
  handleEmitirNfe: (pedidosToEmit: any[], opts?: { forceNewNumber?: boolean; forceNewRef?: boolean }) => Promise<void>;
  handleSyncNfeForPedido: (pedido: any) => Promise<void>;
  handleEnviarNfeForPedido: (pedido: any) => Promise<void>;
  handleArrangeShipmentForPedido: (pedido: any) => Promise<void>;
  handleSyncOrders: () => Promise<void>;
  handleSyncShopeeOrders: () => Promise<void>;
  handleSyncOrderByInternalId: (id?: string) => Promise<void>;
  handleExportCSV: () => void;
  handlePrintLabels: () => Promise<void>;
  handleReprintLabel: (pedido: any) => Promise<void>;
  handlePrintPickingList: () => void;
  loadShopeeShops: () => Promise<void>;
  refreshNfeAuthorizedMapForList: () => Promise<void>;
}

export function useOrdersActions(
  params: UseOrdersActionsParams,
  refreshNfe: () => Promise<void>,
): UseOrdersActionsResult {
  const {
    organizationId, activeStatus, emitEnvironment, pedidos, setPedidos, filteredOrders,
    printSettings, selectedPedidosImpressao, shopeeOrderSnInput,
    shopeeDateFrom, shopeeDateTo, selectedShopeeShopId,
    onSyncComplete, onClearSelections,
    onSetSelectedPedidosImpressao, onSetSelectedPedidosEmissao,
    onSetSelectedPedidos, onSetSelectedPedidosEnviado,
    onSetShopeeShopOptions, onSetSelectedShopeeShopId,
    onSetIsSyncModalOpen,
    printOrders, notPrintedOrders, printedOrders,
    getCompanyId,
  } = params;

  const navigate = useNavigate();

  const [isSyncing, setIsSyncing] = useState(false);
  const [xmlLoadingIds, setXmlLoadingIds] = useState<string[]>([]);
  const [arrangeLoadingIds, setArrangeLoadingIds] = useState<string[]>([]);

  // Loading sets are rebuilt new Set() each render — identity breaks feed rowViewModels deps.
  // This is intentional: do not memoize (preserves pre-existing behavior).
  const xmlLoadingSet = new Set(xmlLoadingIds);
  const arrangeLoadingSet = new Set(arrangeLoadingIds);

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

  const handleArrangeShipmentForPedido = useCallback(async (pedido: any) => {
    try {
      setArrangeLoadingIds(prev => Array.from(new Set([...prev, String(pedido.id)])));
      if (!organizationId) throw new Error('Organização não encontrada.');
      const companyId = await getCompanyId();
      if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
      const mk = String(pedido?.marketplace || '').toLowerCase();
      if (!mk.includes('shopee')) throw new Error('Apenas pedidos Shopee suportados.');
      const orderSn = String(pedido?.marketplaceOrderId ?? pedido?.platformId ?? '');
      if (!orderSn) throw new Error('order_sn ausente.');
      await arrangeShopeeShipment(organizationId, companyId, orderSn);
      toast({ title: "Organização de envio", description: "Planejamento de coleta/dropoff registrado." });
    } catch (e: any) {
      toast({ title: "Erro ao organizar envio", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setArrangeLoadingIds(prev => prev.filter(id => id !== String(pedido.id)));
    }
  }, [organizationId, getCompanyId]);

  const handleSyncOrders = useCallback(async () => {
    try {
      setIsSyncing(true);
      await syncMercadoLivreOrders(organizationId!);
      await onSyncComplete();
    } catch (e) {
      console.error('Falha ao sincronizar pedidos:', e);
    } finally {
      setIsSyncing(false);
      onClearSelections();
    }
  }, [organizationId, onSyncComplete, onClearSelections]);

  const loadShopeeShops = useCallback(async () => {
    try {
      if (!organizationId) return;
      const opts = await fetchShopeeShopsSvc(organizationId);
      onSetShopeeShopOptions(opts);
      if (opts.length > 0 && !selectedShopeeShopId) {
        onSetSelectedShopeeShopId(Number(opts[0].shop_id));
      }
    } catch { }
  }, [organizationId, selectedShopeeShopId, onSetShopeeShopOptions, onSetSelectedShopeeShopId]);

  const handleSyncShopeeOrders = useCallback(async () => {
    try {
      setIsSyncing(true);
      const opts: { orderSnList?: string[]; timeFrom?: number; timeTo?: number } = {};
      const orderSnText = String(shopeeOrderSnInput || "").trim();
      if (orderSnText) {
        const orderSnList = orderSnText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        if (orderSnList.length > 0) opts.orderSnList = orderSnList;
      }
      if (shopeeDateFrom) {
        opts.timeFrom = Math.floor(calendarStartOfDaySPEpochMs(new Date(shopeeDateFrom)) / 1000);
      }
      if (shopeeDateTo) {
        opts.timeTo = Math.floor(calendarEndOfDaySPEpochMs(new Date(shopeeDateTo)) / 1000);
      }
      await syncShopeeOrders(organizationId!, selectedShopeeShopId, opts);
      await onSyncComplete();
      onSetIsSyncModalOpen(false);
    } catch (e) {
      console.error('Falha ao sincronizar pedidos Shopee:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [
    organizationId, shopeeOrderSnInput, shopeeDateFrom, shopeeDateTo,
    selectedShopeeShopId, onSyncComplete, onSetIsSyncModalOpen,
  ]);

  const activeStatusRef = useRef(activeStatus);
  activeStatusRef.current = activeStatus;

  const handleSyncOrderByInternalId = useCallback(async (internalOrderId?: string) => {
    try {
      const id = String(internalOrderId || '').trim();
      if (!id) return;
      setIsSyncing(true);
      const { marketplace_order_id, marketplace } = await fetchOrderByInternalId(id);
      const marketplaceName = String(marketplace || '').toLowerCase();
      if (!marketplaceName.includes('mercado')) throw new Error('Pedido não é do Mercado Livre');
      const mlOrderId = String(marketplace_order_id || '').trim();
      if (!/^\d+$/.test(mlOrderId)) throw new Error('Pedido sem marketplace_order_id válido');
      await syncMercadoLivreOrders(organizationId!, [mlOrderId]);
      await onSyncComplete();
    } catch (e) {
      console.error('Falha ao sincronizar pedido por ID interno:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [organizationId, onSyncComplete]);

  const handleExportCSV = useCallback(() => {
    exportOrdersCsv(filteredOrders);
  }, [filteredOrders]);

  const handlePrintLabels = useCallback(async () => {
    try {
      const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
      if (pedidosToPrint.length === 0) return;
      const pdfs = pedidosToPrint
        .map(p => (p?.label as { pdf_base64?: string } | null)?.pdf_base64)
        .filter(Boolean) as string[];
      if (pdfs.length === 0) return;
      for (const base64 of pdfs) {
        const binStr = atob(base64);
        const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        window.open(URL.createObjectURL(blob), '_blank');
      }
      try {
        const ids = pedidosToPrint.map((p: any) => p.id);
        if (organizationId) await markOrdersPrinted(ids, organizationId);
      } catch { }
      onSetSelectedPedidosImpressao(() => []);
      onSetSelectedPedidosEmissao(() => []);
      onSetSelectedPedidos(() => []);
      onSetSelectedPedidosEnviado(() => []);
    } catch (err) {
      console.error('Erro ao imprimir etiquetas ML:', err);
    }
  }, [
    pedidos, selectedPedidosImpressao, organizationId,
    onSetSelectedPedidosImpressao, onSetSelectedPedidosEmissao,
    onSetSelectedPedidos, onSetSelectedPedidosEnviado,
  ]);

  const handleReprintLabel = useCallback(async (pedido: any) => {
    try {
      if (!pedido) return;
      const cachedPdf: string | null = pedido?.label?.pdf_base64 || null;
      const cachedContent: string | null = pedido?.label?.content_base64 || null;
      const contentType: string | null = pedido?.label?.content_type || null;
      if (cachedPdf) {
        const binStr = atob(String(cachedPdf));
        const bytes = new Uint8Array([...binStr].map(c => c.charCodeAt(0)));
        window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
      } else if (cachedContent) {
        const binStr = atob(String(cachedContent));
        const bytes = new Uint8Array([...binStr].map(c => c.charCodeAt(0)));
        window.open(URL.createObjectURL(new Blob([bytes], { type: contentType || 'application/pdf' })), '_blank');
      } else {
        toast({ title: "Etiqueta não encontrada", description: "Nenhuma etiqueta salva foi localizada para este pedido.", variant: "destructive" });
        return;
      }
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, impressoEtiqueta: true } : p));
      try {
        if (organizationId) await markOrdersPrinted([pedido.id], organizationId);
      } catch { }
    } catch (err) {
      console.error('Erro ao reimprimir etiqueta ML:', err);
    }
  }, [organizationId, setPedidos]);

  const handlePrintPickingList = useCallback(() => {
    const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
    const pdfUrl = generateFunctionalPickingListPDF(pedidosToPrint, printSettings);
    window.open(pdfUrl, '_blank');
    onSetSelectedPedidosImpressao(() => []);
    onSetSelectedPedidosEmissao(() => []);
    onSetSelectedPedidos(() => []);
    onSetSelectedPedidosEnviado(() => []);
  }, [
    pedidos, selectedPedidosImpressao, printSettings,
    onSetSelectedPedidosImpressao, onSetSelectedPedidosEmissao,
    onSetSelectedPedidos, onSetSelectedPedidosEnviado,
  ]);

  return {
    isSyncing,
    xmlLoadingSet,
    arrangeLoadingSet,
    handleEmitirNfe,
    handleSyncNfeForPedido,
    handleEnviarNfeForPedido,
    handleArrangeShipmentForPedido,
    handleSyncOrders,
    handleSyncShopeeOrders,
    handleSyncOrderByInternalId,
    handleExportCSV,
    handlePrintLabels,
    handleReprintLabel,
    handlePrintPickingList,
    loadShopeeShops,
    refreshNfeAuthorizedMapForList: refreshNfe,
  };
}
