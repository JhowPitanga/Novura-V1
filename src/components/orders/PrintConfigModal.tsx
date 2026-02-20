import { Settings, FileBadge, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox as CustomCheckbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PickingListPDFMockup } from "./PickingListPDFMockup";
import { LabelPDFMockup } from "./LabelPDFMockup";

interface PrintSettings {
  labelPrinter: string;
  labelSize: string;
  separateLabelPerItem: boolean;
  groupByProduct: boolean;
  includeBarcode: boolean;
  includeOrderNumber: boolean;
}

interface PrintConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePrintTab: string;
  onActivePrintTabChange: (v: string) => void;
  printSettings: PrintSettings;
  onPrintSettingsChange: (s: PrintSettings) => void;
  selectedPedidos: any[];
  onSave: () => void;
  onPrintPickingList: () => void;
}

export function PrintConfigModal({
  open,
  onOpenChange,
  activePrintTab,
  onActivePrintTabChange,
  printSettings,
  onPrintSettingsChange,
  selectedPedidos,
  onSave,
  onPrintPickingList,
}: PrintConfigModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px] h-[90vh] p-0 flex">
        <div className="w-1/4 p-6 border-r flex flex-col items-start">
          <DialogHeader className="w-full">
            <DialogTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Configurações</span>
            </DialogTitle>
            <DialogDescription>
              Ajuste as configurações de impressão.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={activePrintTab} onValueChange={onActivePrintTabChange} orientation="vertical" className="flex-1 w-full mt-4">
            <TabsList className="flex flex-col items-start p-0 h-auto space-y-1 w-full">
              <TabsTrigger value="label" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-white">
                <FileBadge className="w-4 h-4 mr-2" />
                Etiqueta de Envio
              </TabsTrigger>
              <TabsTrigger value="picking-list" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-white">
                <ListChecks className="w-4 h-4 mr-2" />
                Lista de Separação
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <Tabs value={activePrintTab} onValueChange={onActivePrintTabChange} className="flex-1 flex flex-col h-full">
            <div className="flex-1 p-6 grid grid-cols-2 gap-8 overflow-y-auto">
              <div className="col-span-1">
                <TabsContent value="label" className="mt-0">
                  <section className="space-y-4">
                    <h3 className="font-semibold text-lg flex items-center space-x-2">
                      <FileBadge className="h-5 w-5" />
                      <span>Etiqueta de Envio</span>
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Impressora de Etiquetas</label>
                        <Select value={printSettings.labelPrinter} onValueChange={(value) => onPrintSettingsChange({ ...printSettings, labelPrinter: value })}>
                          <SelectTrigger className="w-full mt-1">
                            <SelectValue placeholder="Selecione a impressora" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="zebra">Zebra ZT410</SelectItem>
                            <SelectItem value="elgin">Elgin L42 Pro</SelectItem>
                            <SelectItem value="argox">Argox OS-214 Plus</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Tamanho da Etiqueta</label>
                        <Select value={printSettings.labelSize} onValueChange={(value) => onPrintSettingsChange({ ...printSettings, labelSize: value })}>
                          <SelectTrigger className="w-full mt-1">
                            <SelectValue placeholder="Selecione o tamanho" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10x15">10x15 cm</SelectItem>
                            <SelectItem value="A4">A4 (com 4 etiquetas)</SelectItem>
                            <SelectItem value="10x10">10x10 cm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <CustomCheckbox
                          checked={printSettings.separateLabelPerItem}
                          onChange={(e) => onPrintSettingsChange({ ...printSettings, separateLabelPerItem: (e.target as HTMLInputElement).checked })}
                        />
                        <span className="text-sm text-gray-700">Imprimir uma etiqueta por item</span>
                      </label>
                    </div>
                  </section>
                </TabsContent>
                <TabsContent value="picking-list" className="mt-0">
                  <section className="space-y-4">
                    <h3 className="font-semibold text-lg flex items-center space-x-2">
                      <ListChecks className="h-5 w-5" />
                      <span>Lista de Separação</span>
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <CustomCheckbox
                          checked={printSettings.groupByProduct}
                          onChange={(e) => onPrintSettingsChange({ ...printSettings, groupByProduct: (e.target as HTMLInputElement).checked })}
                        />
                        <span className="text-sm text-gray-700">Agrupar por produto (Picking List)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <CustomCheckbox
                          checked={printSettings.includeBarcode}
                          onChange={(e) => onPrintSettingsChange({ ...printSettings, includeBarcode: (e.target as HTMLInputElement).checked })}
                        />
                        <span className="text-sm text-gray-700">Incluir código de barras no SKU</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <CustomCheckbox
                          checked={printSettings.includeOrderNumber}
                          onChange={(e) => onPrintSettingsChange({ ...printSettings, includeOrderNumber: (e.target as HTMLInputElement).checked })}
                        />
                        <span className="text-sm text-gray-700">Incluir número do pedido</span>
                      </label>
                    </div>
                  </section>
                </TabsContent>
              </div>
              <div className="col-span-1 border-l pl-8 h-full flex flex-col">
                <div className="flex-1 overflow-y-auto">
                  {activePrintTab === "label" ? (
                    <LabelPDFMockup settings={printSettings} pedidos={selectedPedidos} />
                  ) : (
                    <PickingListPDFMockup settings={printSettings} pedidos={selectedPedidos} onPrint={onPrintPickingList} />
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="p-4 border-t">
              <Button onClick={() => { onSave(); onOpenChange(false); }}>Salvar Configurações</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
