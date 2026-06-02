/**
 * §1 SIZE EXCEPTION — useOrdersPageController: ~425 lines (limit 150).
 *
 * Irreducible coordinator wiring breakdown:
 *   - 4 cross-hook callbacks that genuinely need data from 3+ sub-hooks
 *     (handleSaveVinculacoes, handleScan, handleCompleteBipagem,
 *      handleSyncSelectedOrders) — ~74 lines. Cannot be extracted without
 *     prop-drilling or changing the public contract.
 *   - useOrdersActions invocation: 30 params × ~1.2 lines = ~36 lines.
 *     Params are wiring, not logic; factoring them out adds indirection.
 *   - Flat ~50-field return invariant (preserves Orders.tsx zero-churn) = ~52 lines.
 *   - 12 sub-hook invocations + destructuring = ~100 lines.
 *   - emitEnvironment + processingIds inline state = ~20 lines.
 *     (Single-caller, extracting would be premature abstraction per §1.2)
 *   - layout refs + layoutEffect + global error listeners = ~32 lines.
 *
 * Follow-up: a dedicated "Orders.tsx API redesign" phase could namespace the
 * flat return into groups (data/actions/columns/…) and reduce the return block,
 * but that phase must update Orders.tsx and is out of scope for this refactor.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNfeStatus } from "@/hooks/useNfeStatus";
import { useOrdersPageData } from "@/hooks/useOrdersPageData";
import { useOrderFiltering } from "@/hooks/useOrderFiltering";
import { usePrintingSettings } from "@/hooks/usePrintingSettings";
import { useOrdersFiltersState } from "@/hooks/useOrdersFiltersState";
import { useOrdersSelection } from "@/hooks/useOrdersSelection";
import { useOrdersDialogs } from "@/hooks/useOrdersDialogs";
import { useOrdersActions } from "@/hooks/useOrdersActions";
import { useCompanyIdCache } from "@/hooks/useCompanyIdCache";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { useOrdersDerived } from "@/hooks/useOrdersDerived";
import { useOrdersRowViewModels } from "@/hooks/useOrdersRowViewModels";
import { createOrderColumns } from "@/components/orders/orderColumnDefs";
import { syncMercadoLivreOrders } from "@/services/orders.service";
import { isAbortLikeError } from "@/utils/orderUtils";
import { columnPrefsMerge } from "@/utils/orderColumnUtils";

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
  const { columnPrefs, setColumnPrefs } = useColumnPreferences(organizationId);

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
  const { getCompanyId } = useCompanyIdCache(organizationId);

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
      getCompanyId,
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
  const { statusCounts, statusBlocks, isPedidoAtrasado, hasDelayedByBlock } =
    useOrdersDerived({ baseFiltered, listReady });

  const columns = useMemo(() => {
    const freshCols = createOrderColumns({
      activeStatus, nfBadgeFilter, processingIdsSet,
      nfeErrorMessageByPedidoId, nfeFocusStatusByPedidoId,
    });
    return columnPrefsMerge(freshCols, columnPrefs);
  }, [columnPrefs, activeStatus, nfBadgeFilter, processingIdsSet, nfeErrorMessageByPedidoId, nfeFocusStatusByPedidoId]);

  // --- Row view models (stable ref pattern preserved in useOrdersRowViewModels) ---
  const {
    rowViewModels,
    onToggleRow,
    onOpenDetails,
    onVincular,
    onReprintLabel,
    onEmitirNfe,
    onSubirXml,
    onSyncNfe,
    onArrangeShipment,
  } = useOrdersRowViewModels({
    paginatedOrders,
    activeStatus,
    selection,
    processingIdsSet,
    nfeAuthorizedByPedidoId,
    nfeFocusStatusByPedidoId,
    xmlLoadingSet: orderActions.xmlLoadingSet,
    arrangeLoadingSet: orderActions.arrangeLoadingSet,
    toggleRow: selectionActions.toggleRow,
    handlers: {
      openDetails: dialogActions.openDetails,
      openVincular: dialogActions.openVincular,
      handleReprintLabel: orderActions.handleReprintLabel,
      handleEmitirNfe: orderActions.handleEmitirNfe,
      handleEnviarNfeForPedido: orderActions.handleEnviarNfeForPedido,
      handleSyncNfeForPedido: orderActions.handleSyncNfeForPedido,
      handleArrangeShipmentForPedido: orderActions.handleArrangeShipmentForPedido,
    },
  });

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
