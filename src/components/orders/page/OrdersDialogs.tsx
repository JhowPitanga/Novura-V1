import { AdvancedFiltersDrawer } from "@/components/orders/AdvancedFiltersDrawer";
import { ColumnsManagementPanel } from "@/components/orders/ColumnsManagementPanel";
import { LinkOrderModal } from "@/components/orders/LinkOrderModal";
import { OrderDetailsDrawer } from "@/components/orders/OrderDetailsDrawer";
import { PrintConfigModal } from "@/components/orders/PrintConfigModal";
import { ScannerCheckoutModal } from "@/components/orders/ScannerCheckoutModal";
import { SyncOrdersModal } from "@/components/orders/SyncOrdersModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ColumnDef {
  id: string;
  name: string;
  enabled: boolean;
  alwaysVisible?: boolean;
  render: (pedido: any) => React.ReactNode;
}

interface ColumnPref {
  id: string;
  enabled: boolean;
}

interface PrintSettings {
  [key: string]: any;
}

export interface OrdersDialogsProps {
  // Sync modal
  isSyncModalOpen: boolean;
  onSyncModalOpenChange: (v: boolean) => void;
  syncMarketplace: 'mercado_livre' | 'shopee';
  onSyncMarketplaceChange: (v: string) => void;
  isSyncing: boolean;
  selectedCount: number;
  onSyncAll: () => void;
  onSyncSelected: () => void;
  onSyncByInternalId: (id?: string) => void;
  shopeeShopOptions: Array<{ id: string; shop_id: number; label: string }>;
  selectedShopeeShopId: number | null;
  onSelectedShopeeShopIdChange: (v: number | null) => void;
  shopeeOrderSnInput: string;
  onShopeeOrderSnInputChange: (v: string) => void;
  shopeeDateFrom: string;
  onShopeeDateFromChange: (v: string) => void;
  shopeeDateTo: string;
  onShopeeDateToChange: (v: string) => void;
  onSyncShopee: () => void;

  // Details drawer
  selectedPedido: any;
  isDetailsDrawerOpen: boolean;
  onDetailsDrawerOpenChange: (v: boolean) => void;
  onArrangeShipment: (pedido: any) => void;

  // Filters drawer
  isFilterDrawerOpen: boolean;
  onFilterDrawerOpenChange: (v: boolean) => void;

  // Columns panel
  isColumnsDrawerOpen: boolean;
  onColumnsDrawerOpenChange: (v: boolean) => void;
  columnsPanelAnimatedOpen: boolean;
  columns: ColumnDef[];
  columnsDrawerRef: React.RefObject<HTMLDivElement | null>;
  onColumnsChange: (cols: ColumnPref[]) => void;

  // Link/vincular modal
  isVincularModalOpen: boolean;
  onVincularModalOpenChange: (v: boolean) => void;
  pedidoParaVincular: any;
  anunciosParaVincular: any[];
  onSaveVinculacoes: (payload: any) => void;

  // Scanner modal
  isScannerOpen: boolean;
  onScannerOpenChange: (v: boolean) => void;
  scannedSku: string;
  onScannedSkuChange: (v: string) => void;
  onScan: () => void;
  scannedPedido: any;
  scannerTab: string;
  onScannerTabChange: (v: string) => void;
  notPrintedOrders: any[];
  printedOrders: any[];
  onCompleteBipagem: () => void;

  // Bipagem complete dialog
  isCompleteModalOpen: boolean;
  onCompleteModalOpenChange: (v: boolean) => void;

  // Print config modal
  isPrintConfigOpen: boolean;
  onPrintConfigOpenChange: (v: boolean) => void;
  activePrintTab: string;
  onActivePrintTabChange: (v: string) => void;
  printSettings: PrintSettings;
  onPrintSettingsChange: (v: PrintSettings) => void;
  selectedPedidosImpressao: any[];
  onSavePrintSettings: () => void;
  onPrintPickingList: () => void;
}

export function OrdersDialogs({
  isSyncModalOpen, onSyncModalOpenChange,
  syncMarketplace, onSyncMarketplaceChange, isSyncing, selectedCount,
  onSyncAll, onSyncSelected, onSyncByInternalId,
  shopeeShopOptions, selectedShopeeShopId, onSelectedShopeeShopIdChange,
  shopeeOrderSnInput, onShopeeOrderSnInputChange,
  shopeeDateFrom, onShopeeDateFromChange, shopeeDateTo, onShopeeDateToChange,
  onSyncShopee,
  selectedPedido, isDetailsDrawerOpen, onDetailsDrawerOpenChange, onArrangeShipment,
  isFilterDrawerOpen, onFilterDrawerOpenChange,
  isColumnsDrawerOpen, onColumnsDrawerOpenChange, columnsPanelAnimatedOpen,
  columns, columnsDrawerRef, onColumnsChange,
  isVincularModalOpen, onVincularModalOpenChange, pedidoParaVincular,
  anunciosParaVincular, onSaveVinculacoes,
  isScannerOpen, onScannerOpenChange, scannedSku, onScannedSkuChange,
  onScan, scannedPedido, scannerTab, onScannerTabChange,
  notPrintedOrders, printedOrders, onCompleteBipagem,
  isCompleteModalOpen, onCompleteModalOpenChange,
  isPrintConfigOpen, onPrintConfigOpenChange,
  activePrintTab, onActivePrintTabChange,
  printSettings, onPrintSettingsChange,
  selectedPedidosImpressao, onSavePrintSettings, onPrintPickingList,
}: OrdersDialogsProps) {
  return (
    <>
      <SyncOrdersModal
        open={isSyncModalOpen}
        onOpenChange={onSyncModalOpenChange}
        syncMarketplace={syncMarketplace}
        onSyncMarketplaceChange={(v) => onSyncMarketplaceChange(v)}
        isSyncing={isSyncing}
        selectedCount={selectedCount}
        onSyncAll={onSyncAll}
        onSyncSelected={onSyncSelected}
        onSyncByInternalId={onSyncByInternalId}
        shopeeShopOptions={shopeeShopOptions}
        selectedShopeeShopId={selectedShopeeShopId}
        onSelectedShopeeShopIdChange={onSelectedShopeeShopIdChange}
        shopeeOrderSnInput={shopeeOrderSnInput}
        onShopeeOrderSnInputChange={onShopeeOrderSnInputChange}
        shopeeDateFrom={shopeeDateFrom}
        onShopeeDateFromChange={onShopeeDateFromChange}
        shopeeDateTo={shopeeDateTo}
        onShopeeDateToChange={onShopeeDateToChange}
        onSyncShopee={onSyncShopee}
      />

      <OrderDetailsDrawer
        pedido={selectedPedido}
        open={isDetailsDrawerOpen}
        onOpenChange={(open) => {
          onDetailsDrawerOpenChange(open);
          if (!open) {
            document.querySelector<HTMLButtonElement>('button[data-details-trigger]')?.focus();
          }
        }}
        onArrangeShipment={onArrangeShipment}
      />

      <AdvancedFiltersDrawer
        open={isFilterDrawerOpen}
        onOpenChange={onFilterDrawerOpenChange}
      />

      <ColumnsManagementPanel
        open={isColumnsDrawerOpen}
        onOpenChange={onColumnsDrawerOpenChange}
        animatedOpen={columnsPanelAnimatedOpen}
        columns={columns}
        onColumnsChange={(cols) => onColumnsChange(cols.map(({ id, enabled }) => ({ id, enabled })))}
        panelRef={columnsDrawerRef}
      />

      <LinkOrderModal
        isOpen={isVincularModalOpen}
        onClose={() => onVincularModalOpenChange(false)}
        onSave={onSaveVinculacoes}
        pedidoId={pedidoParaVincular?.id || ""}
        anunciosParaVincular={anunciosParaVincular}
      />

      <ScannerCheckoutModal
        open={isScannerOpen}
        onOpenChange={onScannerOpenChange}
        scannedSku={scannedSku}
        onScannedSkuChange={onScannedSkuChange}
        onScan={onScan}
        scannedPedido={scannedPedido}
        scannerTab={scannerTab}
        onScannerTabChange={onScannerTabChange}
        pedidosNaoImpressos={notPrintedOrders}
        pedidosImpressos={printedOrders}
        onCompleteBipagem={onCompleteBipagem}
      />

      <Dialog open={isCompleteModalOpen} onOpenChange={onCompleteModalOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Bipagem Concluída!</DialogTitle>
            <DialogDescription>
              Os pedidos bipados foram enviados para a lista "Aguardando Coleta" e estão prontos para envio.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onCompleteModalOpenChange(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintConfigModal
        open={isPrintConfigOpen}
        onOpenChange={onPrintConfigOpenChange}
        activePrintTab={activePrintTab}
        onActivePrintTabChange={onActivePrintTabChange}
        printSettings={printSettings}
        onPrintSettingsChange={onPrintSettingsChange}
        selectedPedidos={selectedPedidosImpressao}
        onSave={onSavePrintSettings}
        onPrintPickingList={onPrintPickingList}
      />
    </>
  );
}
