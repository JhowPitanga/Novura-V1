import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { OrderStatusCards } from "@/components/orders/OrderStatusCards";
import { OrdersDialogs } from "@/components/orders/page/OrdersDialogs";
import { OrdersFilterBars } from "@/components/orders/page/OrdersFilterBars";
import { OrdersHeader } from "@/components/orders/page/OrdersHeader";
import { OrdersTable } from "@/components/orders/page/OrdersTable";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useOrdersPageController } from "@/hooks/useOrdersPageController";

function Pedidos() {
  const ctl = useOrdersPageController();
  const { filters, filterActions, dialogs, dialogActions, selection, orderActions } = ctl;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto p-6 relative">
            <OrdersHeader
              isSyncing={orderActions.isSyncing}
              onOpenSyncModal={() => {
                dialogActions.openSync();
                orderActions.loadShopeeShops();
              }}
            />

            <OrderStatusCards
              statusBlocks={ctl.statusBlocks}
              activeStatus={filters.activeStatus}
              onStatusChange={(id) => {
                filterActions.setActiveStatus(id);
                if (id === 'emissao-nf') {
                  ctl.navigate('/pedidos/emissao_nfe');
                } else {
                  ctl.navigate('/pedidos');
                }
              }}
              hasDelayedByBlock={ctl.hasDelayedByBlock}
            />

            <OrdersFilterBars
              activeStatus={filters.activeStatus}
              listReady={ctl.listReady}
              statusCounts={ctl.statusCounts as any}
              vincularBadgeFilter={filters.vincularBadgeFilter}
              onVincularBadgeFilterChange={filterActions.setVincularBadgeFilter}
              searchTerm={filters.searchTerm}
              onSearchTermChange={filterActions.setSearchTerm}
              sortKey={filters.sortKey}
              sortDir={filters.sortDir}
              onSortKeyChange={filterActions.setSortKey}
              onSortDirChange={filterActions.setSortDir}
              isDatePopoverOpen={filters.isDatePopoverOpen}
              onDatePopoverOpenChange={filterActions.setIsDatePopoverOpen}
              dateRange={filters.dateRange}
              onDateRangeChange={filterActions.setDateRange}
              tempDateRange={filters.tempDateRange}
              onTempDateRangeChange={filterActions.setTempDateRange}
              onExportCSV={orderActions.handleExportCSV}
              isFilterDrawerOpen={filters.isFilterDrawerOpen}
              onFilterDrawerOpenChange={filterActions.setIsFilterDrawerOpen}
              onColumnsDrawerOpen={dialogActions.openColumnsDrawer}
              pageSize={filters.pageSize}
              onPageSizeChange={filterActions.setPageSize}
              currentPage={ctl.safeCurrentPage}
              totalPages={ctl.totalPages}
              onPageChange={filterActions.setCurrentPage}
              nfBadgeFilter={filters.nfBadgeFilter}
              onNfBadgeFilterChange={filterActions.setNfBadgeFilter}
              onNavigate={ctl.navigate}
              badgeCounts={ctl.badgeCounts}
              filteredOrders={ctl.filteredOrders}
              selectedPedidosEmissao={selection.selectedPedidosEmissao}
              processingIdsLocal={ctl.processingIdsLocal}
              onMassEmit={(toEmit) => {
                const ids = toEmit.map((p: any) => p.id).filter(Boolean);
                if (!ids.length) return;
                ids.forEach((id: string) => ctl.addProcessingId(String(id)));
                orderActions.handleEmitirNfe(toEmit);
              }}
              onSelectedEmit={(toEmit) => {
                const ids = toEmit.map((p: any) => p.id).filter(Boolean);
                if (!ids.length) return;
                ids.forEach((id: string) => ctl.addProcessingId(String(id)));
                orderActions.handleEmitirNfe(toEmit);
              }}
              emitEnvironment={ctl.emitEnvironment}
              onEmitEnvironmentChange={ctl.setEmitEnvironment}
              marketplaceFilters={filters.marketplaceFilters}
              onMarketplaceFilterChange={filterActions.setMarketplaceFilter}
              shippingTypeFilters={filters.shippingTypeFilters}
              onShippingTypeFilterChange={filterActions.setShippingTypeFilter}
              baseFiltered={ctl.baseFiltered}
              pedidos={ctl.pedidos}
              selectedPedidosImpressao={selection.selectedPedidosImpressao}
              onPrintLabels={orderActions.handlePrintLabels}
            />

            <OrdersTable
              isLoading={ctl.isLoading}
              listTopOffset={ctl.listTopOffset}
              columns={ctl.columns}
              rowViewModels={ctl.rowViewModels}
              activeStatus={filters.activeStatus}
              nfBadgeFilter={filters.nfBadgeFilter}
              selectionCounts={{
                todos: selection.selectedPedidos.length,
                'emissao-nf': selection.selectedPedidosEmissao.length,
                impressao: selection.selectedPedidosImpressao.length,
                enviado: selection.selectedPedidosEnviado.length,
              }}
              filteredCount={ctl.filteredOrders.length}
              pagination={{
                currentPage: ctl.safeCurrentPage,
                totalPages: ctl.totalPages,
                showingFrom: ctl.showingFrom,
                showingTo: ctl.showingTo,
                totalFiltered: ctl.totalFiltered,
              }}
              listContainerRef={ctl.listContainerRef}
              theadRef={ctl.theadRef}
              onToggleRow={ctl.onToggleRow}
              onOpenDetails={ctl.onOpenDetails}
              onVincular={ctl.onVincular}
              onReprintLabel={ctl.onReprintLabel}
              onEmitirNfe={ctl.onEmitirNfe}
              onSubirXml={ctl.onSubirXml}
              onSyncNfe={ctl.onSyncNfe}
              onArrangeShipment={ctl.onArrangeShipment}
              addProcessingId={ctl.addProcessingId}
              onSelectAll={ctl.selectionActions.selectAll}
              onPageChange={filterActions.setCurrentPage}
            />
          </main>
        </div>
      </div>

      <OrdersDialogs
        isSyncModalOpen={dialogs.isSyncModalOpen}
        onSyncModalOpenChange={(v) => v ? dialogActions.openSync() : dialogActions.closeSync()}
        syncMarketplace={dialogs.syncMarketplace}
        onSyncMarketplaceChange={(v) => dialogActions.setSyncMarketplace(v as any)}
        isSyncing={orderActions.isSyncing}
        selectedCount={ctl.selectedCount}
        onSyncAll={orderActions.handleSyncOrders}
        onSyncSelected={ctl.handleSyncSelectedOrders}
        onSyncByInternalId={orderActions.handleSyncOrderByInternalId}
        shopeeShopOptions={dialogs.shopeeShopOptions}
        selectedShopeeShopId={dialogs.selectedShopeeShopId}
        onSelectedShopeeShopIdChange={dialogActions.setSelectedShopeeShopId}
        shopeeOrderSnInput={dialogs.shopeeOrderSnInput}
        onShopeeOrderSnInputChange={dialogActions.setShopeeOrderSnInput}
        shopeeDateFrom={dialogs.shopeeDateFrom}
        onShopeeDateFromChange={dialogActions.setShopeeDateFrom}
        shopeeDateTo={dialogs.shopeeDateTo}
        onShopeeDateToChange={dialogActions.setShopeeDateTo}
        onSyncShopee={orderActions.handleSyncShopeeOrders}
        selectedPedido={dialogs.selectedPedido}
        isDetailsDrawerOpen={dialogs.isDetailsDrawerOpen}
        onDetailsDrawerOpenChange={(v) => v ? undefined : dialogActions.closeDetails()}
        onArrangeShipment={orderActions.handleArrangeShipmentForPedido}
        isFilterDrawerOpen={dialogs.isFilterDrawerOpen}
        onFilterDrawerOpenChange={dialogActions.setFilterDrawerOpen}
        isColumnsDrawerOpen={dialogs.isColumnsDrawerOpen}
        onColumnsDrawerOpenChange={(v) => v ? dialogActions.openColumnsDrawer() : dialogActions.closeColumnsDrawer()}
        columnsPanelAnimatedOpen={dialogs.columnsPanelAnimatedOpen}
        columns={ctl.columns}
        columnsDrawerRef={ctl.columnsDrawerRef}
        onColumnsChange={(cols) => ctl.setColumnPrefs(cols)}
        isVincularModalOpen={dialogs.isVincularModalOpen}
        onVincularModalOpenChange={(v) => v ? undefined : dialogActions.closeVincular()}
        pedidoParaVincular={dialogs.pedidoParaVincular}
        anunciosParaVincular={dialogs.anunciosParaVincular}
        onSaveVinculacoes={ctl.handleSaveVinculacoes}
        isScannerOpen={dialogs.isScannerOpen}
        onScannerOpenChange={dialogActions.setScannerOpen}
        scannedSku={dialogs.scannedSku}
        onScannedSkuChange={dialogActions.setScannedSku}
        onScan={ctl.handleScan}
        scannedPedido={dialogs.scannedPedido}
        scannerTab={dialogs.scannerTab}
        onScannerTabChange={dialogActions.setScannerTab}
        notPrintedOrders={ctl.notPrintedOrders}
        printedOrders={ctl.printedOrders}
        onCompleteBipagem={ctl.handleCompleteBipagem}
        isCompleteModalOpen={dialogs.isCompleteModalOpen}
        onCompleteModalOpenChange={dialogActions.setCompleteModalOpen}
        isPrintConfigOpen={dialogs.isPrintConfigOpen}
        onPrintConfigOpenChange={dialogActions.setPrintConfigOpen}
        activePrintTab={dialogs.activePrintTab}
        onActivePrintTabChange={dialogActions.setActivePrintTab}
        printSettings={ctl.printSettings}
        onPrintSettingsChange={ctl.setPrintSettings}
        selectedPedidosImpressao={ctl.pedidos.filter(p => selection.selectedPedidosImpressao.includes(p.id))}
        onSavePrintSettings={ctl.handleSavePrintSettings}
        onPrintPickingList={orderActions.handlePrintPickingList}
      />
    </SidebarProvider>
  );
}

export default Pedidos;
