import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { DateRange } from "react-day-picker";

export interface OrdersFiltersState {
  activeStatus: string;
  nfBadgeFilter: 'emitir' | 'processando' | 'falha' | 'subir_xml';
  vincularBadgeFilter: 'para_vincular' | 'sem_estoque';
  searchTerm: string;
  dateRange: DateRange | undefined;
  tempDateRange: DateRange | undefined;
  isDatePopoverOpen: boolean;
  sortKey: 'recent' | 'sku' | 'items' | 'shipping' | 'sla';
  sortDir: 'asc' | 'desc';
  marketplaceFilters: Record<string, string>;
  shippingTypeFilters: Record<string, 'all' | 'full' | 'flex' | 'envios' | 'correios' | 'no_shipping'>;
  pageSize: number;
  currentPage: number;
  isFilterDrawerOpen: boolean;
}

export interface OrdersFiltersActions {
  setActiveStatus: (v: string) => void;
  setNfBadgeFilter: (v: string) => void;
  setVincularBadgeFilter: (v: string) => void;
  setSearchTerm: (v: string) => void;
  setDateRange: (v: DateRange | undefined) => void;
  setTempDateRange: (v: DateRange | undefined) => void;
  setIsDatePopoverOpen: (v: boolean) => void;
  setSortKey: (v: string) => void;
  setSortDir: (v: string) => void;
  setMarketplaceFilter: (tab: string, v: string) => void;
  setShippingTypeFilter: (tab: string, v: string) => void;
  setPageSize: (v: number) => void;
  setCurrentPage: (v: number) => void;
  setIsFilterDrawerOpen: (v: boolean) => void;
  resetPage: () => void;
}

export interface UseOrdersFiltersStateResult {
  filters: OrdersFiltersState;
  filterActions: OrdersFiltersActions;
}

export function useOrdersFiltersState(): UseOrdersFiltersStateResult {
  const location = useLocation();

  const [activeStatus, setActiveStatus] = useState("todos");
  const [nfBadgeFilter, setNfBadgeFilterState] = useState<'emitir' | 'processando' | 'falha' | 'subir_xml'>('emitir');
  const [vincularBadgeFilter, setVincularBadgeFilterState] = useState<'para_vincular' | 'sem_estoque'>('para_vincular');
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(undefined);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [sortKey, setSortKeyState] = useState<'recent' | 'sku' | 'items' | 'shipping' | 'sla'>('recent');
  const [sortDir, setSortDirState] = useState<'asc' | 'desc'>('desc');
  const [marketplaceFilters, setMarketplaceFilters] = useState<Record<string, string>>({
    impressao: 'all', enviado: 'all', cancelado: 'all',
  });
  const [shippingTypeFilters, setShippingTypeFilters] = useState<Record<string, 'all' | 'full' | 'flex' | 'envios' | 'correios' | 'no_shipping'>>({
    impressao: 'all', enviado: 'all',
  });
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Sync active status and nfBadgeFilter from URL path
  useEffect(() => {
    const path = String(location?.pathname || '');
    if (path.startsWith('/pedidos/emissao_nfe')) {
      if (activeStatus !== 'emissao-nf') setActiveStatus('emissao-nf');
      if (path.endsWith('/emitir')) {
        if (nfBadgeFilter !== 'emitir') setNfBadgeFilterState('emitir');
      } else if (path.endsWith('/processando')) {
        if (nfBadgeFilter !== 'processando') setNfBadgeFilterState('processando');
      } else if (path.endsWith('/falha_emissao')) {
        if (nfBadgeFilter !== 'falha') setNfBadgeFilterState('falha');
      } else if (path.endsWith('/subir_xml')) {
        if (nfBadgeFilter !== 'subir_xml') setNfBadgeFilterState('subir_xml');
      } else {
        if (nfBadgeFilter !== 'emitir') setNfBadgeFilterState('emitir');
      }
    }
  }, [location.pathname, activeStatus, nfBadgeFilter]);

  // Sync activeStatus from URL search params
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const statusParam = sp.get('status') || '';
    const allowed = new Set(['todos', 'a-vincular', 'emissao-nf', 'impressao', 'aguardando-coleta', 'enviado']);
    if (allowed.has(statusParam) && activeStatus !== statusParam) {
      setActiveStatus(statusParam);
    }
  }, [location.search, activeStatus]);

  // Adjust sort defaults when switching tabs
  useEffect(() => {
    if (activeStatus === 'impressao') {
      setSortKeyState('shipping');
      setSortDirState('asc');
    } else if (activeStatus === 'todos') {
      setSortKeyState('recent');
      setSortDirState('desc');
    }
  }, [activeStatus]);

  // Reset vincularBadgeFilter when entering 'a-vincular'
  useEffect(() => {
    if (activeStatus === 'a-vincular') setVincularBadgeFilterState('para_vincular');
  }, [activeStatus]);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeStatus, dateRange, nfBadgeFilter, vincularBadgeFilter, sortKey, sortDir, marketplaceFilters, shippingTypeFilters]);

  const setNfBadgeFilter = useCallback((v: string) => {
    setNfBadgeFilterState(v as 'emitir' | 'processando' | 'falha' | 'subir_xml');
  }, []);

  const setVincularBadgeFilter = useCallback((v: string) => {
    setVincularBadgeFilterState(v as 'para_vincular' | 'sem_estoque');
  }, []);

  const setSortKey = useCallback((v: string) => {
    setSortKeyState(v as 'recent' | 'sku' | 'items' | 'shipping' | 'sla');
  }, []);

  const setSortDir = useCallback((v: string) => {
    setSortDirState(v as 'asc' | 'desc');
  }, []);

  const setMarketplaceFilter = useCallback((tab: string, v: string) => {
    setMarketplaceFilters(prev => ({ ...prev, [tab]: v }));
  }, []);

  const setShippingTypeFilter = useCallback((tab: string, v: string) => {
    setShippingTypeFilters(prev => ({
      ...prev,
      [tab]: v as 'all' | 'full' | 'flex' | 'envios' | 'correios' | 'no_shipping',
    }));
  }, []);

  const resetPage = useCallback(() => setCurrentPage(1), []);

  return {
    filters: {
      activeStatus,
      nfBadgeFilter,
      vincularBadgeFilter,
      searchTerm,
      dateRange,
      tempDateRange,
      isDatePopoverOpen,
      sortKey,
      sortDir,
      marketplaceFilters,
      shippingTypeFilters,
      pageSize,
      currentPage,
      isFilterDrawerOpen,
    },
    filterActions: {
      setActiveStatus,
      setNfBadgeFilter,
      setVincularBadgeFilter,
      setSearchTerm,
      setDateRange,
      setTempDateRange,
      setIsDatePopoverOpen,
      setSortKey,
      setSortDir,
      setMarketplaceFilter,
      setShippingTypeFilter,
      setPageSize,
      setCurrentPage,
      setIsFilterDrawerOpen,
      resetPage,
    },
  };
}
