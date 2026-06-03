/**
 * Builds rowViewModels and stable per-row action callbacks using the
 * handlersRef pattern. Extracted from useOrdersPageController (lines 382-432).
 *
 * CRITICAL — handlersRef reassign-every-render contract:
 * The ref's .current is reassigned on EVERY render (not inside useEffect or
 * useCallback). This lets the stable onX callbacks (created once with empty
 * deps) always dispatch to the latest handler, so React.memo on OrderTableRow
 * can skip re-renders while still seeing fresh references. Do NOT wrap the
 * reassignment in useCallback or useEffect — doing so would break the contract.
 */
import { useCallback, useMemo, useRef } from "react";
import type { Order } from "@/types/orders";

interface HandlersSnapshot {
  openDetails: (p: any) => void;
  openVincular: (p: any) => void;
  handleReprintLabel: (p: any) => Promise<void>;
  handleEmitirNfe: (ps: any[], opts?: any) => Promise<void>;
  handleEnviarNfeForPedido: (p: any) => Promise<void>;
  handleSyncNfeForPedido: (p: any) => Promise<void>;
  handleArrangeShipmentForPedido: (p: any) => Promise<void>;
}

interface SelectionSnapshot {
  selectedPedidos: string[];
  selectedPedidosEmissao: string[];
  selectedPedidosImpressao: string[];
  selectedPedidosEnviado: string[];
}

interface UseOrdersRowViewModelsParams {
  paginatedOrders: Order[];
  activeStatus: string;
  selection: SelectionSnapshot;
  processingIdsSet: Set<string>;
  nfeAuthorizedByPedidoId: Record<string, boolean>;
  nfeFocusStatusByPedidoId: Record<string, string>;
  xmlLoadingSet: Set<string>;
  arrangeLoadingSet: Set<string>;
  toggleRow: (id: string) => void;
  handlers: HandlersSnapshot;
}

export function useOrdersRowViewModels({
  paginatedOrders,
  activeStatus,
  selection,
  processingIdsSet,
  nfeAuthorizedByPedidoId,
  nfeFocusStatusByPedidoId,
  xmlLoadingSet,
  arrangeLoadingSet,
  toggleRow,
  handlers,
}: UseOrdersRowViewModelsParams) {
  // handlersRef reassign-every-render: keeps stable onX callbacks up-to-date
  // without triggering re-renders on React.memo children. See module docblock.
  const handlersRef = useRef<HandlersSnapshot>(handlers);
  handlersRef.current = handlers;

  const onToggleRow = toggleRow;
  const onOpenDetails = useCallback((p: any) => handlersRef.current.openDetails(p), []);
  const onVincular = useCallback((p: any) => handlersRef.current.openVincular(p), []);
  const onReprintLabel = useCallback((p: any) => handlersRef.current.handleReprintLabel(p), []);
  const onEmitirNfe = useCallback((ps: any[], opts?: any) => handlersRef.current.handleEmitirNfe(ps, opts), []);
  const onSubirXml = useCallback((p: any) => handlersRef.current.handleEnviarNfeForPedido(p), []);
  const onSyncNfe = useCallback((p: any) => handlersRef.current.handleSyncNfeForPedido(p), []);
  const onArrangeShipment = useCallback((p: any) => handlersRef.current.handleArrangeShipmentForPedido(p), []);

  const rowViewModels = useMemo(
    () =>
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
        isXmlLoading: xmlLoadingSet.has(pedido.id),
        isArrangeLoading: arrangeLoadingSet.has(pedido.id),
      })),
    [
      paginatedOrders, activeStatus,
      selection.selectedPedidos, selection.selectedPedidosEmissao,
      selection.selectedPedidosImpressao, selection.selectedPedidosEnviado,
      processingIdsSet, nfeAuthorizedByPedidoId, nfeFocusStatusByPedidoId,
      xmlLoadingSet, arrangeLoadingSet,
    ],
  );

  return {
    rowViewModels,
    onToggleRow,
    onOpenDetails,
    onVincular,
    onReprintLabel,
    onEmitirNfe,
    onSubirXml,
    onSyncNfe,
    onArrangeShipment,
  };
}
