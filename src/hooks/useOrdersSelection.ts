import { useCallback, useEffect, useRef, useState } from "react";

export interface OrdersSelectionState {
  selectedPedidos: string[];
  selectedPedidosEmissao: string[];
  selectedPedidosImpressao: string[];
  selectedPedidosEnviado: string[];
  selectedCount: number;
}

export interface OrdersSelectionActions {
  toggleRow: (id: string) => void;
  selectAll: () => void;
  clearAll: () => void;
  togglePageSelection: () => void;
  setSelectedPedidos: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedPedidosEmissao: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedPedidosImpressao: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedPedidosEnviado: React.Dispatch<React.SetStateAction<string[]>>;
}

interface UseOrdersSelectionParams {
  activeStatus: string;
  filteredOrderIds: string[];
  paginatedOrderIds: string[];
}

export interface UseOrdersSelectionResult {
  selection: OrdersSelectionState;
  selectionActions: OrdersSelectionActions;
  isPageFullySelected: boolean;
}

export function useOrdersSelection({
  activeStatus,
  filteredOrderIds,
  paginatedOrderIds,
}: UseOrdersSelectionParams): UseOrdersSelectionResult {
  const [selectedPedidos, setSelectedPedidos] = useState<string[]>([]);
  const [selectedPedidosEmissao, setSelectedPedidosEmissao] = useState<string[]>([]);
  const [selectedPedidosImpressao, setSelectedPedidosImpressao] = useState<string[]>([]);
  const [selectedPedidosEnviado, setSelectedPedidosEnviado] = useState<string[]>([]);

  // Clear all selections when switching tabs
  useEffect(() => {
    setSelectedPedidos([]);
    setSelectedPedidosEmissao([]);
    setSelectedPedidosImpressao([]);
    setSelectedPedidosEnviado([]);
  }, [activeStatus]);

  const activeStatusRef = useRef(activeStatus);
  activeStatusRef.current = activeStatus;

  const getActiveList = useCallback((): string[] => {
    const status = activeStatusRef.current;
    if (status === 'todos') return selectedPedidos;
    if (status === 'emissao-nf') return selectedPedidosEmissao;
    if (status === 'impressao') return selectedPedidosImpressao;
    if (status === 'enviado') return selectedPedidosEnviado;
    return [];
  }, [selectedPedidos, selectedPedidosEmissao, selectedPedidosImpressao, selectedPedidosEnviado]);

  const setActiveList = useCallback((
    updater: (prev: string[]) => string[],
  ) => {
    const status = activeStatusRef.current;
    if (status === 'todos') setSelectedPedidos(updater);
    else if (status === 'emissao-nf') setSelectedPedidosEmissao(updater);
    else if (status === 'impressao') setSelectedPedidosImpressao(updater);
    else if (status === 'enviado') setSelectedPedidosEnviado(updater);
  }, []);

  const toggleRow = useCallback((id: string) => {
    const status = activeStatusRef.current;
    const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
      setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    if (status === 'todos') toggle(setSelectedPedidos);
    else if (status === 'emissao-nf') toggle(setSelectedPedidosEmissao);
    else if (status === 'impressao') toggle(setSelectedPedidosImpressao);
    else if (status === 'enviado') toggle(setSelectedPedidosEnviado);
  }, []);

  const filteredOrderIdsRef = useRef(filteredOrderIds);
  filteredOrderIdsRef.current = filteredOrderIds;

  const selectAll = useCallback(() => {
    const current = getActiveList();
    const all = filteredOrderIdsRef.current;
    if (current.length === all.length) {
      setActiveList(() => []);
    } else {
      setActiveList(() => [...all]);
    }
  }, [getActiveList, setActiveList]);

  const clearAll = useCallback(() => {
    setSelectedPedidos([]);
    setSelectedPedidosEmissao([]);
    setSelectedPedidosImpressao([]);
    setSelectedPedidosEnviado([]);
  }, []);

  const paginatedOrderIdsRef = useRef(paginatedOrderIds);
  paginatedOrderIdsRef.current = paginatedOrderIds;

  const togglePageSelection = useCallback(() => {
    const pageIds = paginatedOrderIdsRef.current;
    setActiveList(prev => {
      const isFullySelected = pageIds.length > 0 && pageIds.every(id => prev.includes(id));
      if (isFullySelected) {
        return prev.filter(id => !pageIds.includes(id));
      }
      return Array.from(new Set([...prev, ...pageIds]));
    });
  }, [setActiveList]);

  const selectedCount =
    activeStatus === 'todos' ? selectedPedidos.length :
    activeStatus === 'emissao-nf' ? selectedPedidosEmissao.length :
    activeStatus === 'impressao' ? selectedPedidosImpressao.length :
    activeStatus === 'enviado' ? selectedPedidosEnviado.length :
    0;

  const isPageFullySelected =
    paginatedOrderIds.length > 0 &&
    paginatedOrderIds.every(id => getActiveList().includes(id));

  return {
    selection: {
      selectedPedidos,
      selectedPedidosEmissao,
      selectedPedidosImpressao,
      selectedPedidosEnviado,
      selectedCount,
    },
    selectionActions: {
      toggleRow,
      selectAll,
      clearAll,
      togglePageSelection,
      setSelectedPedidos,
      setSelectedPedidosEmissao,
      setSelectedPedidosImpressao,
      setSelectedPedidosEnviado,
    },
    isPageFullySelected,
  };
}
