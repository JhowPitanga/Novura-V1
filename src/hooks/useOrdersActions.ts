import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  arrangeShopeeShipment,
  emitNfeQueue,
  fetchOrderByInternalId,
  fetchShopeeShops as fetchShopeeShopsSvc,
  getCompanyIdForOrg,
  markOrdersPrinted,
  submitXmlSend,
  syncMercadoLivreOrders,
  syncNfeForOrder,
  syncShopeeOrders,
  updateOrdersInternalStatus,
} from "@/services/orders.service";
import { generateFunctionalPickingListPDF } from "@/utils/pdfGenerators";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs, formatDateTimeSP } from "@/lib/datetime";
import { mapTipoEnvioLabel } from "@/utils/orderUtils";
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
}

export interface UseOrdersActionsResult {
  isSyncing: boolean;
  processingIdsLocal: string[];
  processingIdsSet: Set<string>;
  xmlLoadingSet: Set<string>;
  arrangeLoadingSet: Set<string>;
  getCompanyId: () => Promise<string | null>;
  handleEmitirNfe: (pedidosToEmit: any[], opts?: { forceNewNumber?: boolean; forceNewRef?: boolean }) => Promise<void>;
  handleSyncNfeForPedido: (pedido: any) => Promise<void>;
  handleEnviarNfeForPedido: (pedido: any) => Promise<void>;
  handleArrangeShipmentForPedido: (pedido: any) => Promise<void>;
  handleGerarNovaNfeForPedido: (pedido: any) => Promise<void>;
  handleSyncOrders: () => Promise<void>;
  handleSyncShopeeOrders: () => Promise<void>;
  handleSyncSelectedOrders: () => Promise<void>;
  handleSyncOrderByInternalId: (id?: string) => Promise<void>;
  handleSaveVinculacoes: (payload: any) => void;
  handleExportCSV: () => void;
  handlePrintLabels: () => Promise<void>;
  handleReprintLabel: (pedido: any) => Promise<void>;
  handlePrintPickingList: () => void;
  handleScan: () => void;
  handleCompleteBipagem: () => void;
  loadShopeeShops: () => Promise<void>;
  addProcessingId: (id: string) => void;
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
    onSetScannedPedido, onSetScannedSku, onSetScannerOpen, onSetCompleteModalOpen,
    onSetIsSyncModalOpen, onSetShopeeShopOptions, onSetSelectedShopeeShopId,
    printOrders, notPrintedOrders, printedOrders,
  } = params;

  const navigate = useNavigate();

  const [isSyncing, setIsSyncing] = useState(false);
  const [processingIdsLocal, setProcessingIdsLocal] = useState<string[]>([]);
  const [xmlLoadingIds, setXmlLoadingIds] = useState<string[]>([]);
  const [arrangeLoadingIds, setArrangeLoadingIds] = useState<string[]>([]);

  const processingIdsSet = new Set(processingIdsLocal.map(String));
  const xmlLoadingSet = new Set(xmlLoadingIds);
  const arrangeLoadingSet = new Set(arrangeLoadingIds);

  const companyIdRef = useRef<string | null>(null);

  const getCompanyId = useCallback(async (): Promise<string | null> => {
    if (companyIdRef.current) return companyIdRef.current;
    if (!organizationId) return null;
    companyIdRef.current = await getCompanyIdForOrg(organizationId);
    return companyIdRef.current;
  }, [organizationId]);

  const addProcessingId = useCallback((id: string) => {
    setProcessingIdsLocal(prev => Array.from(new Set([...prev, id])));
  }, []);

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
      // silent
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

  const handleGerarNovaNfeForPedido = useCallback(async (pedido: any) => {
    try {
      if (!organizationId) throw new Error('Organização não encontrada.');
      const companyId = await getCompanyId();
      if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
      await emitNfeQueue(organizationId, companyId, [String(pedido.id)], emitEnvironment, {
        forceNewNumber: true, forceNewRef: true,
      });
      navigate('/pedidos/emissao_nfe/processando');
    } catch { }
  }, [organizationId, getCompanyId, emitEnvironment, navigate]);

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
  const pedidosRef = useRef(pedidos);
  pedidosRef.current = pedidos;

  const handleSyncSelectedOrders = useCallback(async () => {
    try {
      const status = activeStatusRef.current;
      const allPedidos = pedidosRef.current;
      // We can't directly read selected state here — caller must pass selected IDs
      // This is kept as a placeholder; actual invocation passes pre-resolved IDs
      console.warn('[handleSyncSelectedOrders] Called without selected IDs context');
    } catch (e) {
      console.error('Falha ao sincronizar pedidos selecionados:', e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

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

  const handleSaveVinculacoes = useCallback((vinculosOrPayload: any) => {
    const vinculos: { [anuncioId: string]: string } =
      vinculosOrPayload && Array.isArray(vinculosOrPayload.linkedItems)
        ? vinculosOrPayload.linkedItems.reduce((acc: any, li: any) => {
          acc[li.anuncioId] = li.productId;
          return acc;
        }, {})
        : (vinculosOrPayload || {});

    setPedidos(prev => {
      const pedidoParaVincular = prev.find(p => {
        const anunciosDoPedido = Array.isArray(p.items) ? p.items : [];
        return anunciosDoPedido.some((item: any) => vinculos[item.id] !== undefined);
      });
      if (!pedidoParaVincular) return prev;

      const novosItens = pedidoParaVincular.items.map((item: any) => {
        const produtoIdVinculado = vinculos[item.id];
        return produtoIdVinculado ? { ...item, linked: true } : item;
      });
      const todosItensVinculados = novosItens.every((item: any) => item.linked);
      return prev.map(p => {
        if (p.id !== pedidoParaVincular.id) return p;
        return todosItensVinculados
          ? { ...p, items: novosItens, status: 'Emissao NF' }
          : { ...p, items: novosItens };
      });
    });
  }, [setPedidos]);

  const handleExportCSV = useCallback(() => {
    const headers = ["ID", "Marketplace", "Produto", "SKU", "Cliente", "Valor", "Data", "Status", "Tipo de Envio"];
    const data = filteredOrders.map(p => [
      p.id,
      p.marketplace,
      p.productTitle,
      p.sku || "N/A",
      p.customerName,
      `R$ ${p.totalAmount.toFixed(2)}`,
      (() => {
        const base = (p as any).paidAt || (p as any).createdAt;
        if (!base) return "";
        try { return formatDateTimeSP(base); } catch { return String(base); }
      })(),
      p.status,
      mapTipoEnvioLabel((p as any).shippingType),
    ]);
    const csvContent = [headers.join(";"), ...data.map(row => row.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pedidos_${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
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

  const handleScan = useCallback(() => {
    const found = printOrders.find(p =>
      p.items.some((item: any) => item.sku === params.printOrders[0]?.items[0]?.sku),
    );
    if (found) {
      const updatedPedido = { ...found };
      const itemToBip = updatedPedido.items.find((item: any) => item.sku === '');
      if (itemToBip) itemToBip.scanned = true;
      onSetScannedPedido(updatedPedido);
      onSetScannedSku("");
    } else {
      alert("SKU não encontrado! Tente novamente.");
    }
  }, [printOrders, onSetScannedPedido, onSetScannedSku, params.printOrders]);

  const handleCompleteBipagem = useCallback(() => {
    const pedidosParaAtualizar = printOrders.filter(p =>
      p.items.every((item: any) => item.scanned),
    );
    if (pedidosParaAtualizar.length > 0) {
      setPedidos(prev => prev.map(p =>
        pedidosParaAtualizar.some(pa => pa.id === p.id)
          ? { ...p, status: 'Aguardando Coleta' }
          : p,
      ));
    }
    onSetCompleteModalOpen(true);
    onSetScannerOpen(false);
  }, [printOrders, setPedidos, onSetCompleteModalOpen, onSetScannerOpen]);

  return {
    isSyncing,
    processingIdsLocal,
    processingIdsSet,
    xmlLoadingSet,
    arrangeLoadingSet,
    getCompanyId,
    handleEmitirNfe,
    handleSyncNfeForPedido,
    handleEnviarNfeForPedido,
    handleArrangeShipmentForPedido,
    handleGerarNovaNfeForPedido,
    handleSyncOrders,
    handleSyncShopeeOrders,
    handleSyncSelectedOrders,
    handleSyncOrderByInternalId,
    handleSaveVinculacoes,
    handleExportCSV,
    handlePrintLabels,
    handleReprintLabel,
    handlePrintPickingList,
    handleScan,
    handleCompleteBipagem,
    loadShopeeShops,
    addProcessingId,
    refreshNfeAuthorizedMapForList: refreshNfe,
  };
}
