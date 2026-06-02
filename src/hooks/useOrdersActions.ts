/**
 * Thin facade composing useNfeActions + useOrderSyncActions + usePrintActions.
 * The public UseOrdersActionsResult interface is intentionally preserved so the
 * controller sees no change. Extracted domain hooks own all stateful logic.
 *
 * Dead handlers removed in Commit B1 (handleScan, handleCompleteBipagem,
 * handleSaveVinculacoes, handleSyncSelectedOrders, handleGerarNovaNfeForPedido,
 * internal processingIds/getCompanyId duplicates).
 */
import { useNfeActions } from "@/hooks/useNfeActions";
import { useOrderSyncActions } from "@/hooks/useOrderSyncActions";
import { usePrintActions } from "@/hooks/usePrintActions";
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
    organizationId, activeStatus, emitEnvironment,
    pedidos, setPedidos, filteredOrders, printSettings,
    selectedPedidosImpressao, shopeeOrderSnInput,
    shopeeDateFrom, shopeeDateTo, selectedShopeeShopId,
    onSyncComplete, onClearSelections,
    onSetSelectedPedidosImpressao, onSetSelectedPedidosEmissao,
    onSetSelectedPedidos, onSetSelectedPedidosEnviado,
    onSetIsSyncModalOpen, onSetShopeeShopOptions, onSetSelectedShopeeShopId,
    getCompanyId,
  } = params;

  const { xmlLoadingSet, handleEmitirNfe, handleSyncNfeForPedido, handleEnviarNfeForPedido } =
    useNfeActions({ organizationId, emitEnvironment, getCompanyId, refreshNfe });

  const {
    isSyncing, arrangeLoadingSet, loadShopeeShops,
    handleSyncOrders, handleSyncShopeeOrders,
    handleSyncOrderByInternalId, handleArrangeShipmentForPedido,
  } = useOrderSyncActions({
    organizationId, getCompanyId, activeStatus,
    shopeeOrderSnInput, shopeeDateFrom, shopeeDateTo, selectedShopeeShopId,
    onSyncComplete, onClearSelections, onSetIsSyncModalOpen,
    onSetShopeeShopOptions, onSetSelectedShopeeShopId,
  });

  const { handleExportCSV, handlePrintLabels, handleReprintLabel, handlePrintPickingList } =
    usePrintActions({
      organizationId, pedidos, setPedidos, filteredOrders, printSettings,
      selectedPedidosImpressao,
      onSetSelectedPedidosImpressao, onSetSelectedPedidosEmissao,
      onSetSelectedPedidos, onSetSelectedPedidosEnviado,
    });

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
