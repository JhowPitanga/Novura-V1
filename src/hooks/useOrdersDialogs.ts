import { useCallback, useEffect, useState } from "react";

export interface OrdersDialogsState {
  isSyncModalOpen: boolean;
  isDetailsDrawerOpen: boolean;
  isVincularModalOpen: boolean;
  isColumnsDrawerOpen: boolean;
  isScannerOpen: boolean;
  isPrintConfigOpen: boolean;
  isPickingListModalOpen: boolean;
  isCompleteModalOpen: boolean;
  isFilterDrawerOpen: boolean;
  selectedPedido: any;
  anunciosParaVincular: any[];
  pedidoParaVincular: any;
  columnsPanelAnimatedOpen: boolean;
  scannerTab: string;
  scannedSku: string;
  scannedPedido: any;
  activePrintTab: string;
  syncMarketplace: 'mercado_livre' | 'shopee';
  shopeeShopOptions: Array<{ id: string; shop_id: number; label: string }>;
  selectedShopeeShopId: number | null;
  shopeeOrderSnInput: string;
  shopeeDateFrom: string;
  shopeeDateTo: string;
}

export interface OrdersDialogsActions {
  openSync: () => void;
  closeSync: () => void;
  openDetails: (pedido: any) => void;
  closeDetails: () => void;
  openVincular: (pedido: any) => void;
  closeVincular: () => void;
  openColumnsDrawer: () => void;
  closeColumnsDrawer: () => void;
  setScannerOpen: (v: boolean) => void;
  setPrintConfigOpen: (v: boolean) => void;
  setPickingListModalOpen: (v: boolean) => void;
  setCompleteModalOpen: (v: boolean) => void;
  setFilterDrawerOpen: (v: boolean) => void;
  setSyncMarketplace: (v: 'mercado_livre' | 'shopee') => void;
  setShopeeShopOptions: (v: Array<{ id: string; shop_id: number; label: string }>) => void;
  setSelectedShopeeShopId: (v: number | null) => void;
  setShopeeOrderSnInput: (v: string) => void;
  setShopeeDateFrom: (v: string) => void;
  setShopeeDateTo: (v: string) => void;
  setScannerTab: (v: string) => void;
  setScannedSku: (v: string) => void;
  setScannedPedido: (v: any) => void;
  setActivePrintTab: (v: string) => void;
}

export interface UseOrdersDialogsResult {
  dialogs: OrdersDialogsState;
  dialogActions: OrdersDialogsActions;
}

export function useOrdersDialogs(): UseOrdersDialogsResult {
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false);
  const [isVincularModalOpen, setIsVincularModalOpen] = useState(false);
  const [isColumnsDrawerOpen, setIsColumnsDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPrintConfigOpen, setIsPrintConfigOpen] = useState(false);
  const [isPickingListModalOpen, setIsPickingListModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<any>(null);
  const [anunciosParaVincular, setAnunciosParaVincular] = useState<any[]>([]);
  const [pedidoParaVincular, setPedidoParaVincular] = useState<any>(null);
  const [columnsPanelAnimatedOpen, setColumnsPanelAnimatedOpen] = useState(false);
  const [scannerTab, setScannerTab] = useState("nao-impressos");
  const [scannedSku, setScannedSku] = useState("");
  const [scannedPedido, setScannedPedido] = useState<any>(null);
  const [activePrintTab, setActivePrintTab] = useState("label");
  const [syncMarketplace, setSyncMarketplace] = useState<'mercado_livre' | 'shopee'>('mercado_livre');
  const [shopeeShopOptions, setShopeeShopOptions] = useState<Array<{ id: string; shop_id: number; label: string }>>([]);
  const [selectedShopeeShopId, setSelectedShopeeShopId] = useState<number | null>(null);
  const [shopeeOrderSnInput, setShopeeOrderSnInput] = useState<string>("");
  const [shopeeDateFrom, setShopeeDateFrom] = useState<string>("");
  const [shopeeDateTo, setShopeeDateTo] = useState<string>("");

  // Animate columns panel open
  useEffect(() => {
    if (isColumnsDrawerOpen) {
      const t = setTimeout(() => setColumnsPanelAnimatedOpen(true), 20);
      return () => clearTimeout(t);
    }
    setColumnsPanelAnimatedOpen(false);
  }, [isColumnsDrawerOpen]);

  const openSync = useCallback(() => setIsSyncModalOpen(true), []);
  const closeSync = useCallback(() => setIsSyncModalOpen(false), []);

  const openDetails = useCallback((pedido: any) => {
    setSelectedPedido(pedido);
    setIsDetailsDrawerOpen(true);
  }, []);

  const closeDetails = useCallback(() => setIsDetailsDrawerOpen(false), []);

  const openVincular = useCallback((pedido: any) => {
    setAnunciosParaVincular(Array.isArray(pedido.items) ? pedido.items : []);
    setPedidoParaVincular(pedido);
    setIsVincularModalOpen(true);
  }, []);

  const closeVincular = useCallback(() => setIsVincularModalOpen(false), []);
  const openColumnsDrawer = useCallback(() => setIsColumnsDrawerOpen(true), []);
  const closeColumnsDrawer = useCallback(() => setIsColumnsDrawerOpen(false), []);

  return {
    dialogs: {
      isSyncModalOpen,
      isDetailsDrawerOpen,
      isVincularModalOpen,
      isColumnsDrawerOpen,
      isScannerOpen,
      isPrintConfigOpen,
      isPickingListModalOpen,
      isCompleteModalOpen,
      isFilterDrawerOpen,
      selectedPedido,
      anunciosParaVincular,
      pedidoParaVincular,
      columnsPanelAnimatedOpen,
      scannerTab,
      scannedSku,
      scannedPedido,
      activePrintTab,
      syncMarketplace,
      shopeeShopOptions,
      selectedShopeeShopId,
      shopeeOrderSnInput,
      shopeeDateFrom,
      shopeeDateTo,
    },
    dialogActions: {
      openSync,
      closeSync,
      openDetails,
      closeDetails,
      openVincular,
      closeVincular,
      openColumnsDrawer,
      closeColumnsDrawer,
      setScannerOpen: setIsScannerOpen,
      setPrintConfigOpen: setIsPrintConfigOpen,
      setPickingListModalOpen: setIsPickingListModalOpen,
      setCompleteModalOpen: setIsCompleteModalOpen,
      setFilterDrawerOpen: setIsFilterDrawerOpen,
      setSyncMarketplace,
      setShopeeShopOptions,
      setSelectedShopeeShopId,
      setShopeeOrderSnInput,
      setShopeeDateFrom,
      setShopeeDateTo,
      setScannerTab,
      setScannedSku,
      setScannedPedido,
      setActivePrintTab,
    },
  };
}
