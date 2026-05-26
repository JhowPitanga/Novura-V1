import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNfeStatus } from "@/hooks/useNfeStatus";
import { useOrdersPageData } from "@/hooks/useOrdersPageData";
import { matchStatus, normStatus, useOrderFiltering } from "@/hooks/useOrderFiltering";
import { usePrintingSettings } from "@/hooks/usePrintingSettings";
import { useOrdersFiltersState } from "@/hooks/useOrdersFiltersState";
import { useOrdersSelection } from "@/hooks/useOrdersSelection";
import { useOrdersDialogs } from "@/hooks/useOrdersDialogs";
import { useOrdersActions } from "@/hooks/useOrdersActions";
import { createOrderColumns } from "@/components/orders/orderColumnDefs";
import {
  getCompanyIdForOrg,
  syncMercadoLivreOrders,
} from "@/services/orders.service";
import { isAbortLikeError } from "@/utils/orderUtils";

type ColumnPref = { id: string; enabled: boolean };

export function useOrdersPageController() {
  const navigate = useNavigate();
  const { user, organizationId } = useAuth();

  // --- Filters ---
  const { filters, filterActions } = useOrdersFiltersState();
  const {
    activeStatus, nfBadgeFilter, vincularBadgeFilter, searchTerm, dateRange,
    tempDateRange, isDatePopoverOpen, sortKey, sortDir,
    marketplaceFilters, shippingTypeFilters, pageSize, currentPage,
  } = filters;

  // --- Data ---
  const { pedidos, setPedidos, isLoading, listReady, totalPedidosCount, refetch: loadPedidos } =
    useOrdersPageData({ organizationId, user });

  // --- Dialogs ---
  const { dialogs, dialogActions } = useOrdersDialogs();

  // --- Printing ---
  const { printSettings, setPrintSettings, handleSavePrintSettings } = usePrintingSettings();

  // --- Column preferences ---
  const [columnPrefs, setColumnPrefs] = useState<ColumnPref[] | null>(() => {
    if (!organizationId) return null;
    try {
      const raw = localStorage.getItem(`pedidos_columns_${organizationId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ColumnPref[]) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (!organizationId) return;
    try {
      const raw = localStorage.getItem(`pedidos_columns_${organizationId}`);
      if (!raw) { setColumnPrefs(null); return; }
      const parsed = JSON.parse(raw);
      setColumnPrefs(Array.isArray(parsed) ? (parsed as ColumnPref[]) : null);
    } catch { /* silently ignore */ }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !columnPrefs) return;
    try {
      localStorage.setItem(`pedidos_columns_${organizationId}`, JSON.stringify(columnPrefs));
    } catch { /* silently ignore */ }
  }, [columnPrefs, organizationId]);

  // --- Emit environment (needed by useNfeStatus before useOrdersActions) ---
  const [emitEnvironment, setEmitEnvironmentState] = useState<'homologacao' | 'producao'>(() => {
    try {
      const v = localStorage.getItem('nfe_environment');
      return v === 'producao' ? 'producao' : 'homologacao';
    } catch { return 'homologacao'; }
  });
  const setEmitEnvironment = useCallback((v: string) => {
    setEmitEnvironmentState(v as 'homologacao' | 'producao');
  }, []);

  // --- Processing IDs ---
  const [processingIdsLocal, setProcessingIdsLocal] = useState<string[]>([]);
  const processingIdsSet = useMemo(() => {
    const s = new Set<string>();
    for (const id of processingIdsLocal) s.add(String(id));
    return s;
  }, [processingIdsLocal]);
  const addProcessingId = useCallback((id: string) => {
    setProcessingIdsLocal(prev => Array.from(new Set([...prev, id])));
  }, []);

  // --- Company ID (cached) ---
  const companyIdRef = useRef<string | null>(null);
  useEffect(() => { companyIdRef.current = null; }, [organizationId]);
  const getCompanyId = useCallback(async (): Promise<string | null> => {
    if (companyIdRef.current) return companyIdRef.current;
    if (!organizationId) return null;
    companyIdRef.current = await getCompanyIdForOrg(organizationId);
    return companyIdRef.current;
  }, [organizationId]);

  // --- NF-e status ---
  const {
    nfeAuthorizedByPedidoId,
    nfeFocusStatusByPedidoId,
    nfeErrorMessageByPedidoId,
    refreshNfeAuthorizedMapForList,
  } = useNfeStatus({
    organizationId,
    pedidos,
    emitEnvironment,
    activeStatus,
    nfBadgeFilter,
    getCompanyId,
  });

  // --- Filtering / pagination ---
  const {
    baseFiltered,
    filteredOrders,
    paginatedOrders,
    totalFiltered,
    totalPages,
    safeCurrentPage,
    showingFrom,
    showingTo,
    printOrders,
    notPrintedOrders,
    printedOrders,
    badgeCountEmitir,
    badgeCountFalha,
    badgeCountProcessando,
    badgeCountSubirXml,
  } = useOrderFiltering({
    orders: pedidos,
    searchTerm,
    dateRange,
    activeStatus,
    sortKey,
    sortDir,
    marketplaceFilters,
    shippingTypeFilters,
    nfBadgeFilter,
    vincularBadgeFilter,
    processingIdsSet,
    nfeFocusStatusByOrderId: nfeFocusStatusByPedidoId as any,
    pageSize,
    currentPage,
    totalPedidosCount,
  });

  // --- Selection ---
  const filteredOrderIds = useMemo(() => filteredOrders.map(p => p.id), [filteredOrders]);
  const paginatedOrderIds = useMemo(() => paginatedOrders.map(p => p.id), [paginatedOrders]);
  const { selection, selectionActions } = useOrdersSelection({
    activeStatus,
    filteredOrderIds,
    paginatedOrderIds,
  });

  // Validate page on total change
  useEffect(() => {
    const tf = totalPedidosCount ?? filteredOrders.length;
    const newTotal = Math.max(1, Math.ceil(tf / pageSize));
    if (currentPage > newTotal) filterActions.setCurrentPage(newTotal);
  }, [totalPedidosCount, filteredOrders.length, pageSize, currentPage, filterActions]);

  // --- Actions hook ---
  const orderActions = useOrdersActions(
    {
      organizationId,
      activeStatus,
      emitEnvironment,
      pedidos,
      setPedidos,
      filteredOrders,
      printSettings,
      selectedPedidosImpressao: selection.selectedPedidosImpressao,
      shopeeOrderSnInput: dialogs.shopeeOrderSnInput,
      shopeeDateFrom: dialogs.shopeeDateFrom,
      shopeeDateTo: dialogs.shopeeDateTo,
      selectedShopeeShopId: dialogs.selectedShopeeShopId,
      onSyncComplete: loadPedidos,
      onClearSelections: selectionActions.clearAll,
      onSetSelectedPedidosImpressao: selectionActions.setSelectedPedidosImpressao,
      onSetSelectedPedidosEmissao: selectionActions.setSelectedPedidosEmissao,
      onSetSelectedPedidos: selectionActions.setSelectedPedidos,
      onSetSelectedPedidosEnviado: selectionActions.setSelectedPedidosEnviado,
      onSetScannedPedido: dialogActions.setScannedPedido,
      onSetScannedSku: dialogActions.setScannedSku,
      onSetScannerOpen: dialogActions.setScannerOpen,
      onSetCompleteModalOpen: dialogActions.setCompleteModalOpen,
      onSetIsSyncModalOpen: dialogActions.closeSync,
      onSetShopeeShopOptions: dialogActions.setShopeeShopOptions,
      onSetSelectedShopeeShopId: dialogActions.setSelectedShopeeShopId,
      printOrders,
      notPrintedOrders,
      printedOrders,
    },
    refreshNfeAuthorizedMapForList,
  );

  // --- Cross-hook handlers (need data from multiple sub-hooks) ---
  const handleSaveVinculacoes = useCallback((vinculosOrPayload: any) => {
    const vinculos: Record<string, string> =
      vinculosOrPayload && Array.isArray(vinculosOrPayload.linkedItems)
        ? vinculosOrPayload.linkedItems.reduce((acc: any, li: any) => {
          acc[li.anuncioId] = li.productId;
          return acc;
        }, {})
        : (vinculosOrPayload || {});

    const pedidoParaVincular = dialogs.pedidoParaVincular;
    setPedidos(prev => {
      const target = prev.find(p => p.id === pedidoParaVincular?.id);
      if (!target) return prev;
      const novosItens = target.items.map((item: any) => {
        const produtoId = vinculos[item.id];
        return produtoId ? { ...item, linked: true } : item;
      });
      const todosVinculados = novosItens.every((item: any) => item.linked);
      return prev.map(p => {
        if (p.id !== target.id) return p;
        return todosVinculados
          ? { ...p, items: novosItens, status: 'Emissao NF' }
          : { ...p, items: novosItens };
      });
    });
  }, [dialogs.pedidoParaVincular, setPedidos]);

  const handleScan = useCallback(() => {
    const sku = dialogs.scannedSku;
    const found = printOrders.find(p =>
      p.items.some((item: any) => item.sku === sku),
    );
    if (found) {
      const updatedPedido = { ...found };
      const itemToBip = updatedPedido.items.find((item: any) => item.sku === sku);
      if (itemToBip) itemToBip.scanned = true;
      dialogActions.setScannedPedido(updatedPedido);
      dialogActions.setScannedSku("");
    } else {
      alert("SKU não encontrado! Tente novamente.");
    }
  }, [dialogs.scannedSku, printOrders, dialogActions]);

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
    dialogActions.setCompleteModalOpen(true);
    dialogActions.setScannerOpen(false);
  }, [printOrders, setPedidos, dialogActions]);

  const handleSyncSelectedOrders = useCallback(async () => {
    try {
      const { selectedPedidos, selectedPedidosEmissao, selectedPedidosImpressao } = selection;
      const selectedIds = (
        activeStatus === 'todos' ? selectedPedidos :
        activeStatus === 'emissao-nf' ? selectedPedidosEmissao :
        activeStatus === 'impressao' ? selectedPedidosImpressao :
        []
      ).map(String).filter(Boolean);

      const selectedOrderIds = pedidos
        .filter(p => selectedIds.includes(String(p.id)))
        .filter(p => String(p.marketplace || '').toLowerCase().includes('mercado'))
        .map(p => String(p.id))
        .filter(id => !!id && id !== '2000010000000000');

      if (selectedOrderIds.length === 0) return;
      await syncMercadoLivreOrders(organizationId!, selectedOrderIds);
      await loadPedidos();
    } catch (e) {
      console.error('Falha ao sincronizar pedidos selecionados:', e);
    }
  }, [activeStatus, selection, pedidos, organizationId, loadPedidos]);

  // --- Refs for layout tracking ---
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const columnsDrawerRef = useRef<HTMLDivElement | null>(null);
  const [listTopOffset, setListTopOffset] = useState<number>(64);

  useLayoutEffect(() => {
    const container = listContainerRef.current;
    const thead = theadRef.current;
    if (container && thead) {
      const cr = container.getBoundingClientRect();
      const tr = thead.getBoundingClientRect();
      setListTopOffset(Math.max(0, Math.round(tr.bottom - cr.top)));
    }
  }, [isLoading, activeStatus, sortKey, sortDir, marketplaceFilters, shippingTypeFilters]);

  // --- Global error listeners ---
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isAbortLikeError((e as any)?.error || (e as any)?.message || '')) return;
      console.error('[Pedidos] Erro não tratado:', e);
    };
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      if (isAbortLikeError((e as any)?.reason)) return;
      console.error('[Pedidos] Promessa rejeitada sem tratamento:', (e as any)?.reason);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  // --- Derived data ---
  const statusCounts = useMemo<Record<string, number>>(() => ({
    todos: baseFiltered.length,
    'a-vincular': baseFiltered.filter(p => matchStatus(p, 'a-vincular')).length,
    'emissao-nf': baseFiltered.filter(p => matchStatus(p, 'emissao-nf')).length,
    impressao: baseFiltered.filter(p => matchStatus(p, 'impressao')).length,
    'aguardando-coleta': baseFiltered.filter(p => matchStatus(p, 'aguardando-coleta')).length,
    enviado: baseFiltered.filter(p => matchStatus(p, 'enviado')).length,
    cancelado: baseFiltered.filter(p => matchStatus(p, 'cancelado')).length,
    'sem-estoque': baseFiltered.filter(p => normStatus(p.internalStatus) === 'sem_estoque').length,
  }), [baseFiltered]);

  const isPedidoAtrasado = useCallback((p: any) => {
    const shipLower = String(p?.shipmentStatus ?? '').toLowerCase();
    const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup', 'shipped', 'dropped_off'];
    const ns = normStatus(p?.internalStatus);
    const isCancelledOrReturn = ns === 'cancelado' || ns === 'devolucao' || ns === 'cancelled' || ns === 'returned';
    if (deliveredStatuses.includes(shipLower) || isCancelledOrReturn || ns === 'enviado' || ns === 'shipped') return false;
    const slaLower = String(p?.shippingSla?.status ?? '').toLowerCase();
    const ed = p?.shippingSla?.expectedDate;
    const expired = ed ? (new Date(ed).getTime() - new Date().getTime() <= 0) : false;
    return slaLower === 'delayed' || expired;
  }, []);

  const allowedTooltipBlocks = useMemo(() => new Set(['a-vincular', 'emissao-nf', 'impressao', 'aguardando-coleta']), []);
  const hasDelayedByBlock = useCallback((blockId: string) => {
    if (!allowedTooltipBlocks.has(blockId)) return false;
    return listReady ? baseFiltered.some(p => matchStatus(p, blockId) && isPedidoAtrasado(p)) : false;
  }, [allowedTooltipBlocks, listReady, baseFiltered, isPedidoAtrasado]);

  const statusBlocks = useMemo(() => [
    { id: 'todos', title: 'Todos os Pedidos', count: listReady ? statusCounts['todos'] : 0, description: 'Sincronizados com marketplaces' },
    { id: 'a-vincular', title: 'A Vincular', count: listReady ? statusCounts['a-vincular'] : 0, description: 'Pedidos sem vínculo de SKU' },
    { id: 'emissao-nf', title: 'Emissão de NFe', count: listReady ? statusCounts['emissao-nf'] : 0, description: 'Aguardando emissão' },
    { id: 'impressao', title: 'Impressão', count: listReady ? statusCounts['impressao'] : 0, description: 'NF e etiqueta' },
    { id: 'aguardando-coleta', title: 'Coleta', count: listReady ? statusCounts['aguardando-coleta'] : 0, description: 'Prontos para envio' },
    { id: 'enviado', title: 'Enviado', count: listReady ? statusCounts['enviado'] : 0, description: 'Pedidos em trânsito' },
    { id: 'cancelado', title: 'Cancelados', count: listReady ? statusCounts['cancelado'] : 0, description: 'Pedidos cancelados/devolvidos' },
  ], [listReady, statusCounts]);

  const columns = useMemo(() => {
    const freshCols = createOrderColumns({
      activeStatus, nfBadgeFilter, processingIdsSet,
      nfeErrorMessageByPedidoId, nfeFocusStatusByPedidoId,
    });
    if (!columnPrefs) return freshCols;
    const freshMap = new Map(freshCols.map(c => [c.id, c]));
    const seen = new Set<string>();
    const merged: typeof freshCols = [];
    for (const pref of columnPrefs) {
      const col = freshMap.get(pref.id);
      if (!col) continue;
      merged.push({ ...col, enabled: col.alwaysVisible ? true : pref.enabled });
      seen.add(pref.id);
    }
    for (const col of freshCols) {
      if (!seen.has(col.id)) merged.push(col);
    }
    return merged;
  }, [columnPrefs, activeStatus, nfBadgeFilter, processingIdsSet, nfeErrorMessageByPedidoId, nfeFocusStatusByPedidoId]);

  // Stable row callbacks using ref pattern so React.memo skips re-renders
  const handlersRef = useRef({
    openDetails: dialogActions.openDetails,
    openVincular: dialogActions.openVincular,
    handleReprintLabel: orderActions.handleReprintLabel,
    handleEmitirNfe: orderActions.handleEmitirNfe,
    handleEnviarNfeForPedido: orderActions.handleEnviarNfeForPedido,
    handleSyncNfeForPedido: orderActions.handleSyncNfeForPedido,
    handleArrangeShipmentForPedido: orderActions.handleArrangeShipmentForPedido,
  });
  handlersRef.current = {
    openDetails: dialogActions.openDetails,
    openVincular: dialogActions.openVincular,
    handleReprintLabel: orderActions.handleReprintLabel,
    handleEmitirNfe: orderActions.handleEmitirNfe,
    handleEnviarNfeForPedido: orderActions.handleEnviarNfeForPedido,
    handleSyncNfeForPedido: orderActions.handleSyncNfeForPedido,
    handleArrangeShipmentForPedido: orderActions.handleArrangeShipmentForPedido,
  };

  const onToggleRow = selectionActions.toggleRow;
  const onOpenDetails = useCallback((p: any) => handlersRef.current.openDetails(p), []);
  const onVincular = useCallback((p: any) => handlersRef.current.openVincular(p), []);
  const onReprintLabel = useCallback((p: any) => handlersRef.current.handleReprintLabel(p), []);
  const onEmitirNfe = useCallback((ps: any[], opts?: any) => handlersRef.current.handleEmitirNfe(ps, opts), []);
  const onSubirXml = useCallback((p: any) => handlersRef.current.handleEnviarNfeForPedido(p), []);
  const onSyncNfe = useCallback((p: any) => handlersRef.current.handleSyncNfeForPedido(p), []);
  const onArrangeShipment = useCallback((p: any) => handlersRef.current.handleArrangeShipmentForPedido(p), []);

  const rowViewModels = useMemo(() =>
    paginatedOrders.map(pedido => ({
      pedido,
      isChecked:
        (activeStatus === 'todos' && selection.selectedPedidos.includes(pedido.id)) ||
        (activeStatus === 'emissao-nf' && selection.selectedPedidosEmissao.includes(pedido.id)) ||
        (activeStatus === 'impressao' && selection.selectedPedidosImpressao.includes(pedido.id)) ||
        (activeStatus === 'enviado' && selection.selectedPedidosEnviado.includes(pedido.id)),
      isProcessing: processingIdsSet.has(pedido.id),
      isNfeAuthorized: !!nfeAuthorizedByPedidoId[pedido.id],
      nfeFocusStatus: nfeFocusStatusByPedidoId[pedido.id] ?? '',
      isXmlLoading: orderActions.xmlLoadingSet.has(pedido.id),
      isArrangeLoading: orderActions.arrangeLoadingSet.has(pedido.id),
    })),
    [
      paginatedOrders, activeStatus,
      selection.selectedPedidos, selection.selectedPedidosEmissao,
      selection.selectedPedidosImpressao, selection.selectedPedidosEnviado,
      processingIdsSet, nfeAuthorizedByPedidoId, nfeFocusStatusByPedidoId,
      orderActions.xmlLoadingSet, orderActions.arrangeLoadingSet,
    ],
  );

  const selectedCount = selection.selectedCount;

  return {
    // Data
    pedidos,
    setPedidos,
    isLoading,
    listReady,

    // Filters & pagination
    filters,
    filterActions,

    // Filtering results
    baseFiltered,
    filteredOrders,
    paginatedOrders,
    totalFiltered,
    totalPages,
    safeCurrentPage,
    showingFrom,
    showingTo,
    printOrders,
    notPrintedOrders,
    printedOrders,
    badgeCounts: {
      emitir: badgeCountEmitir,
      processando: badgeCountProcessando,
      falha: badgeCountFalha,
      subirXml: badgeCountSubirXml,
    },

    // Selection
    selection,
    selectionActions,
    selectedCount,

    // Dialogs
    dialogs,
    dialogActions,

    // Printing
    printSettings,
    setPrintSettings,
    handleSavePrintSettings,

    // Columns
    columns,
    columnPrefs,
    setColumnPrefs,
    columnsDrawerRef,

    // Derived
    statusCounts,
    statusBlocks,
    hasDelayedByBlock,
    rowViewModels,

    // Layout refs
    listContainerRef,
    theadRef,
    listTopOffset,

    // Row callbacks (stable)
    onToggleRow,
    onOpenDetails,
    onVincular,
    onReprintLabel,
    onEmitirNfe,
    onSubirXml,
    onSyncNfe,
    onArrangeShipment,
    addProcessingId,
    processingIdsLocal,

    // Emit environment
    emitEnvironment,
    setEmitEnvironment,

    // Actions
    orderActions,

    // Cross-hook actions
    handleSaveVinculacoes,
    handleScan,
    handleCompleteBipagem,
    handleSyncSelectedOrders,

    // Navigation
    navigate,
  };
}
