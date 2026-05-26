import { AllOrdersFilterBar } from "@/components/orders/AllOrdersFilterBar";
import { CanceledFilterBar } from "@/components/orders/CanceledFilterBar";
import { LinkFilterBar } from "@/components/orders/LinkFilterBar";
import { NfeFilterBar } from "@/components/orders/NfeFilterBar";
import { PrintFilterBar } from "@/components/orders/PrintFilterBar";
import { ShippedFilterBar } from "@/components/orders/ShippedFilterBar";
import { matchStatus } from "@/hooks/useOrderFiltering";
import type { Order } from "@/types/orders";
import { DateRange } from "react-day-picker";

interface BadgeCounts {
  emitir: number;
  processando: number;
  falha: number;
  subirXml: number;
}

interface StatusCounts {
  'a-vincular': number;
  'sem-estoque': number;
}

export interface OrdersFilterBarsProps {
  activeStatus: string;
  listReady: boolean;
  statusCounts: StatusCounts;

  // Vincular
  vincularBadgeFilter: 'para_vincular' | 'sem_estoque';
  onVincularBadgeFilterChange: (v: string) => void;

  // Todos
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSortKeyChange: (v: string) => void;
  onSortDirChange: (v: string) => void;
  isDatePopoverOpen: boolean;
  onDatePopoverOpenChange: (v: boolean) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (v: DateRange | undefined) => void;
  tempDateRange: DateRange | undefined;
  onTempDateRangeChange: (v: DateRange | undefined) => void;
  onExportCSV: () => void;
  isFilterDrawerOpen: boolean;
  onFilterDrawerOpenChange: (v: boolean) => void;
  onColumnsDrawerOpen: () => void;
  pageSize: number;
  onPageSizeChange: (v: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (v: number) => void;

  // NF-e
  nfBadgeFilter: string;
  onNfBadgeFilterChange: (v: string) => void;
  onNavigate: (path: string) => void;
  badgeCounts: BadgeCounts;
  filteredOrders: Order[];
  selectedPedidosEmissao: string[];
  processingIdsLocal: string[];
  onMassEmit: (pedidos: Order[]) => void;
  onSelectedEmit: (pedidos: Order[]) => void;
  emitEnvironment: string;
  onEmitEnvironmentChange: (v: string) => void;

  // Impressao / Enviado / Cancelado
  marketplaceFilters: Record<string, string>;
  onMarketplaceFilterChange: (status: string, v: string) => void;
  shippingTypeFilters: Record<string, string>;
  onShippingTypeFilterChange: (status: string, v: string) => void;
  baseFiltered: Order[];
  pedidos: Order[];
  selectedPedidosImpressao: string[];
  onPrintLabels: () => void;
}

export function OrdersFilterBars(props: OrdersFilterBarsProps) {
  const {
    activeStatus, listReady, statusCounts,
    vincularBadgeFilter, onVincularBadgeFilterChange,
    searchTerm, onSearchTermChange,
    sortKey, sortDir, onSortKeyChange, onSortDirChange,
    isDatePopoverOpen, onDatePopoverOpenChange,
    dateRange, onDateRangeChange, tempDateRange, onTempDateRangeChange,
    onExportCSV, isFilterDrawerOpen, onFilterDrawerOpenChange,
    onColumnsDrawerOpen, pageSize, onPageSizeChange,
    currentPage, totalPages, onPageChange,
    nfBadgeFilter, onNfBadgeFilterChange, onNavigate, badgeCounts,
    filteredOrders, selectedPedidosEmissao, processingIdsLocal,
    onMassEmit, onSelectedEmit, emitEnvironment, onEmitEnvironmentChange,
    marketplaceFilters, onMarketplaceFilterChange,
    shippingTypeFilters, onShippingTypeFilterChange,
    baseFiltered, pedidos, selectedPedidosImpressao, onPrintLabels,
  } = props;

  return (
    <>
      {activeStatus === "a-vincular" && (
        <LinkFilterBar
          vincularBadgeFilter={vincularBadgeFilter}
          onVincularBadgeFilterChange={onVincularBadgeFilterChange}
          paraVincularCount={listReady ? statusCounts['a-vincular'] : 0}
          semEstoqueCount={listReady ? statusCounts['sem-estoque'] : 0}
        />
      )}

      {activeStatus === "todos" && (
        <AllOrdersFilterBar
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortKeyChange={onSortKeyChange}
          onSortDirChange={onSortDirChange}
          isDatePopoverOpen={isDatePopoverOpen}
          onDatePopoverOpenChange={onDatePopoverOpenChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          tempDateRange={tempDateRange}
          onTempDateRangeChange={onTempDateRangeChange}
          onExportCSV={onExportCSV}
          isFilterDrawerOpen={isFilterDrawerOpen}
          onFilterDrawerOpenChange={onFilterDrawerOpenChange}
          onColumnsDrawerOpen={onColumnsDrawerOpen}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}

      {activeStatus === "emissao-nf" && (
        <NfeFilterBar
          nfBadgeFilter={nfBadgeFilter}
          onNfBadgeFilterChange={onNfBadgeFilterChange}
          onNavigate={navigate}
          badgeCounts={badgeCounts}
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          filteredPedidos={filteredOrders}
          selectedPedidosEmissao={selectedPedidosEmissao}
          onMassEmit={onMassEmit}
          onSelectedEmit={onSelectedEmit}
          emitEnvironment={emitEnvironment}
          onEmitEnvironmentChange={onEmitEnvironmentChange}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}

      {activeStatus === "impressao" && (
        <PrintFilterBar
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortKeyChange={onSortKeyChange}
          onSortDirChange={onSortDirChange}
          marketplaceFilter={marketplaceFilters['impressao']}
          onMarketplaceFilterChange={(v) => onMarketplaceFilterChange('impressao', v)}
          shippingTypeFilter={shippingTypeFilters['impressao']}
          onShippingTypeFilterChange={(v) => onShippingTypeFilterChange('impressao', v)}
          baseFiltered={baseFiltered}
          matchStatus={matchStatus}
          selectedPedidosImpressao={selectedPedidosImpressao}
          pedidos={pedidos}
          onPrintLabels={onPrintLabels}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}

      {activeStatus === "enviado" && (
        <ShippedFilterBar
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortKeyChange={onSortKeyChange}
          onSortDirChange={onSortDirChange}
          marketplaceFilter={marketplaceFilters['enviado']}
          onMarketplaceFilterChange={(v) => onMarketplaceFilterChange('enviado', v)}
          shippingTypeFilter={shippingTypeFilters['enviado']}
          onShippingTypeFilterChange={(v) => onShippingTypeFilterChange('enviado', v)}
          baseFiltered={baseFiltered}
          matchStatus={matchStatus}
        />
      )}

      {activeStatus === "cancelados" && (
        <CanceledFilterBar
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortKeyChange={onSortKeyChange}
          onSortDirChange={onSortDirChange}
          marketplaceFilter={marketplaceFilters['cancelado']}
          onMarketplaceFilterChange={(v) => onMarketplaceFilterChange('cancelado', v)}
        />
      )}
    </>
  );
}
