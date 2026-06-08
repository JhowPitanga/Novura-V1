// §1 SIZE EXCEPTION (ENGINEERING_STANDARDS.md): ~440 LOC thin compositor retaining
// full drawer markup for adjust/transfer form modes; hooks own validation and stock writes.
// Follow-up: extract <AdjustForm> and <TransferForm> as sub-components to reach ≤200.
import { useState, useEffect, useId, useRef } from "react";
import { Minus, Package, Plus, Settings, ArrowRightLeft, Info } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useStorage } from "@/hooks/useStorage";
import { useAuth } from "@/hooks/useAuth";
import { useStockAdjustment } from "@/hooks/useStockAdjustment";
import { useStockTransfer } from "@/hooks/useStockTransfer";

interface EstoqueProduct {
  id: string;
  produto: string;
  sku: string;
  galpao?: string;
  estoque: number;
  reservado: number;
  disponivel: number;
  status: string;
  valor?: number;
  stock_by_location?: Array<{
    storage_id: string;
    storage_name: string;
    current: number;
    reserved: number;
    available: number;
  }>;
}

interface EstoqueManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: EstoqueProduct | null;
  onUpdateStock: (productId: string, newStock: number) => void;
  onStockAdjusted?: () => void;
}

type OperationType = "entrada" | "saida" | "transferencia";

export function InventoryManagementDrawer({
  isOpen,
  onClose,
  product,
  onUpdateStock: _onUpdateStock,
  onStockAdjusted,
}: EstoqueManagementDrawerProps) {
  const [operationType, setOperationType] = useState<OperationType>("entrada");
  const { storageLocations, loading: storageLoading } = useStorage();
  const { toast } = useToast();
  const { organizationId } = useAuth();

  const onAdjusted = () => {
    onStockAdjusted?.();
    handleCloseDrawer();
  };

  const adjust = useStockAdjustment(product, organizationId, toast, onAdjusted);
  const transfer = useStockTransfer(
    product,
    organizationId,
    adjust.adjustmentQuantity,
    toast,
    onAdjusted
  );

  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const currentStorageId =
    adjust.selectedStorageId || product?.stock_by_location?.[0]?.storage_id;

  const currentStorageMeta = storageLocations.find(
    (s) => String(s.id) === String(currentStorageId || "")
  ) as (typeof storageLocations[0] & { type?: string; readonly?: boolean }) | undefined;

  const isFulfillmentStorage =
    (currentStorageMeta as { type?: string })?.type === "fulfillment" ||
    (currentStorageMeta as { readonly?: boolean })?.readonly === true;

  const physicalStorages = storageLocations.filter(
    (s) =>
      (s as { type?: string }).type !== "fulfillment" &&
      !(s as { readonly?: boolean }).readonly
  );

  useEffect(() => {
    if (isOpen && product) {
      const defaultStorage = product.stock_by_location?.[0]?.storage_id;
      adjust.reset(defaultStorage);
      transfer.reset(defaultStorage);
      setOperationType("entrada");

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && !contentRef.current?.contains(activeEl)) {
        activeEl.blur();
      }
      setTimeout(() => {
        const autofocusEl = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        const firstFocusable =
          autofocusEl ||
          contentRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
        if (firstFocusable) firstFocusable.focus();
        else contentRef.current?.focus();
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when drawer opens
  }, [isOpen, product]);

  if (!product) return null;

  const handleCloseDrawer = () => {
    const defaultStorage = product.stock_by_location?.[0]?.storage_id;
    adjust.reset(defaultStorage);
    transfer.reset(defaultStorage);
    setOperationType("entrada");
    onClose();
  };

  const loading = adjust.loading || transfer.loading;
  const isTransferMode = operationType === "transferencia";

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }} direction="right">
      <DrawerContent
        ref={contentRef}
        className="fixed inset-y-0 right-0 flex h-full w-full sm:w-[90%] md:w-[60%] lg:w-[42%] xl:w-[35%] flex-col"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DrawerHeader className="border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <DrawerTitle id={titleId} className="text-lg">Ajustar Estoque</DrawerTitle>
          </div>
          <DrawerDescription id={descriptionId}>
            {product.produto} ({product.sku})
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Informações do Produto</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Nome</Label>
                  <p className="font-medium">{product.produto}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SKU</Label>
                  <p className="font-medium">{product.sku}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Estoque Atual</h3>
              <div className="rounded-lg border bg-white overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-muted text-[11px] font-semibold text-muted-foreground">
                  <span>Armazém</span>
                  <span className="text-right">Disponível</span>
                  <span className="text-right">Reservado</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="divide-y">
                  {(product.stock_by_location || []).map((loc) => (
                    <div key={loc.storage_id} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm">
                      <span>{loc.storage_name}</span>
                      <span className="text-right font-semibold text-green-600">{loc.available}</span>
                      <span className="text-right font-semibold text-orange-600">{loc.reserved}</span>
                      <span className="text-right font-semibold text-primary">{loc.current}</span>
                    </div>
                  ))}
                  {(product.stock_by_location || []).length === 0 && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Sem estoque distribuído por armazém.</div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {isFulfillmentStorage ? (
              <div className="rounded-md border border-violet-200 bg-violet-50 p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-violet-800">Estoque Full — somente leitura</p>
                  <p className="text-xs text-violet-700 mt-0.5">
                    Este estoque é sincronizado automaticamente pela API do marketplace. Nenhuma operação manual é permitida.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Operação</h3>

                <div className="flex gap-2">
                  <Button
                    variant={operationType === "entrada" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setOperationType("entrada");
                      adjust.setOperationType("entrada");
                    }}
                    className="flex-1"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Entrada
                  </Button>
                  <Button
                    variant={operationType === "saida" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setOperationType("saida");
                      adjust.setOperationType("saida");
                    }}
                    className="flex-1"
                  >
                    <Minus className="w-4 h-4 mr-1" />
                    Saída
                  </Button>
                  <Button
                    variant={operationType === "transferencia" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperationType("transferencia")}
                    className="flex-1"
                  >
                    <ArrowRightLeft className="w-4 h-4 mr-1" />
                    Transferir
                  </Button>
                </div>

                {!isTransferMode ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="adjust-storage" className="text-xs text-muted-foreground">Armazém</Label>
                      <select
                        id="adjust-storage"
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={adjust.selectedStorageId || ""}
                        onChange={(e) => adjust.setSelectedStorageId(e.target.value || undefined)}
                      >
                        <option value="" disabled>Selecione o armazém</option>
                        {storageLocations
                          .filter(
                            (s) =>
                              (s as { type?: string }).type !== "fulfillment" &&
                              !(s as { readonly?: boolean }).readonly
                          )
                          .map((s) => {
                            const available = adjust.getStorageAvailable(String(s.id));
                            return (
                              <option key={s.id} value={s.id}>
                                {s.name} ({available} disp.)
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="adjustment-quantity" className="text-xs text-muted-foreground">
                        Quantidade
                      </Label>
                      <Input
                        id="adjustment-quantity"
                        type="number"
                        min="0"
                        value={adjust.adjustmentQuantity || ""}
                        onChange={(e) => adjust.setAdjustmentQuantity(Number(e.target.value))}
                        placeholder="Digite a quantidade"
                        data-autofocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adjust-note" className="text-xs text-muted-foreground">
                        Observação (opcional)
                      </Label>
                      <Input
                        id="adjust-note"
                        value={adjust.adjustmentNote}
                        onChange={(e) => adjust.setAdjustmentNote(e.target.value)}
                        placeholder="Ex: Ajuste de inventário"
                      />
                    </div>

                    {adjust.adjustmentQuantity > 0 && (
                      <div
                        className={`p-3 rounded-lg space-y-1 ${
                          adjust.isPreviewNegative ? "bg-red-50 border border-red-200" : "bg-muted"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-muted-foreground">Novo estoque após ajuste:</p>
                        </div>
                        <p
                          className={`text-lg font-bold ${
                            adjust.isPreviewNegative ? "text-red-600" : "text-primary"
                          }`}
                        >
                          {adjust.previewStock} unidades
                        </p>
                        {adjust.isPreviewNegative && (
                          <p className="text-xs text-red-600">
                            Não é possível deduzir mais que o estoque disponível no armazém.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="rounded-md border-2 border-[#FF6400] bg-[#FF6400]/12 p-3 text-xs flex items-start gap-2 shadow-sm">
                      <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#FF6400]" aria-hidden />
                      <span className="font-medium leading-snug text-gray-900">
                        Transferências só são permitidas entre armazéns físicos. Destinos Full não são aceitos.
                      </span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-from" className="text-xs text-muted-foreground">Origem</Label>
                      <select
                        id="transfer-from"
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={transfer.transferFromId || ""}
                        onChange={(e) => transfer.setTransferFromId(e.target.value || undefined)}
                      >
                        <option value="" disabled>Selecione o armazém de origem</option>
                        {physicalStorages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-to" className="text-xs text-muted-foreground">Destino</Label>
                      <select
                        id="transfer-to"
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={transfer.transferToId || ""}
                        onChange={(e) => transfer.setTransferToId(e.target.value || undefined)}
                      >
                        <option value="" disabled>Selecione o armazém de destino</option>
                        {physicalStorages
                          .filter((s) => s.id !== transfer.transferFromId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-qty" className="text-xs text-muted-foreground">
                        Quantidade
                      </Label>
                      <Input
                        id="transfer-qty"
                        type="number"
                        min="1"
                        value={adjust.adjustmentQuantity || ""}
                        onChange={(e) => adjust.setAdjustmentQuantity(Number(e.target.value))}
                        placeholder="Quantidade a transferir"
                      />
                    </div>

                    <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
                      <p className="text-xs text-violet-800">
                        Disponível na origem:{" "}
                        <span className="font-semibold">
                          {adjust.getStorageAvailable(transfer.transferFromId)} un.
                        </span>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-note" className="text-xs text-muted-foreground">
                        Observação (opcional)
                      </Label>
                      <Input
                        id="transfer-note"
                        value={transfer.transferNote}
                        onChange={(e) => transfer.setTransferNote(e.target.value)}
                        placeholder="Ex: Reabastecimento filial"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {!isFulfillmentStorage && (
          <div className="border-t border-border p-6 flex-shrink-0">
            <Button
              onClick={isTransferMode ? transfer.handleSaveTransfer : adjust.handleSaveAdjustment}
              className="w-full"
              disabled={
                loading ||
                storageLoading ||
                (!isTransferMode && adjust.isAdjustmentInvalid) ||
                (isTransferMode && transfer.isTransferInvalid)
              }
            >
              <Settings className="w-4 h-4 mr-2" />
              {loading
                ? "Salvando..."
                : isTransferMode
                ? "Confirmar Transferência"
                : "Salvar Ajuste"}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
