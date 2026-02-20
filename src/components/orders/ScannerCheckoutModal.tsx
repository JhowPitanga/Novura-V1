import { Search, Printer, Check, X, CheckCircle2, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { mapTipoEnvioLabel } from "@/utils/orderUtils";

interface ScannerCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scannedSku: string;
  onScannedSkuChange: (v: string) => void;
  onScan: () => void;
  scannedPedido: any;
  scannerTab: string;
  onScannerTabChange: (v: string) => void;
  pedidosNaoImpressos: any[];
  pedidosImpressos: any[];
  onCompleteBipagem: () => void;
}

export function ScannerCheckoutModal({
  open,
  onOpenChange,
  scannedSku,
  onScannedSkuChange,
  onScan,
  scannedPedido,
  scannerTab,
  onScannerTabChange,
  pedidosNaoImpressos,
  pedidosImpressos,
  onCompleteBipagem,
}: ScannerCheckoutModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 border-b border-gray-200 flex-row items-center justify-between">
          <div className="flex items-center space-x-2">
            <Scan className="w-6 h-6" />
            <DialogTitle className="text-2xl">
              Checkout por produto
            </DialogTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Printer className="w-5 h-5 text-gray-500" />
            <Select>
              <SelectTrigger className="w-[180px] h-10">
                <SelectValue placeholder="Impressora Ativa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zebra">Zebra ZT410</SelectItem>
                <SelectItem value="elgin">Elgin L42 Pro</SelectItem>
                <SelectItem value="argox">Argox OS-214 Plus</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogDescription className="sr-only">Configurações e ações de bipagem e impressão.</DialogDescription>
        </DialogHeader>

        <div className="flex-shrink-0 p-6 flex flex-col space-y-4">
          <div className="flex space-x-2">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Escanear ou Inserir SKU/Código..."
                className="h-12 w-full pl-10 pr-4 rounded-xl"
                value={scannedSku}
                onChange={(e) => onScannedSkuChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onScan();
                }}
              />
            </div>
            <Button className="h-12 px-6 rounded-xl" onClick={onScan}>
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-4 bg-gray-50 flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-4 space-y-4">
                <h3 className="text-lg font-semibold mb-2">Pedido Localizado</h3>
                {scannedPedido ? (
                  <>
                    <div className="flex flex-col space-y-1 text-sm text-gray-700">
                      <p><strong>Nº do Pedido:</strong> {scannedPedido.id}</p>
                      <p><strong>Marketplace:</strong> {scannedPedido.marketplace}</p>
                      <p><strong>Cliente:</strong> {scannedPedido.cliente}</p>
                      <p><strong>Tipo de Envio:</strong> {mapTipoEnvioLabel(scannedPedido.tipoEnvio)}</p>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold pt-2 border-t">Itens do Pedido ({scannedPedido.itens.length})</h4>
                      {scannedPedido.itens.map((item: any, itemIndex: number) => (
                        <div key={itemIndex} className="flex items-center space-x-3 bg-gray-100 p-2 rounded-lg">
                          <img src={item.imagem} alt={item.nome} className="w-10 h-10 rounded object-cover" loading="lazy" decoding="async" width="40" height="40" />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.nome}</div>
                            <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold">{item.bipado ? '1/1' : '0/1'}</span>
                            {item.bipado ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <X className="h-5 w-5 text-gray-400" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-gray-500">Nenhum pedido localizado ainda.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-4">
                <h3 className="text-lg font-semibold mb-2">Produtos Bipados</h3>
                {scannedPedido?.itens.filter((item: any) => item.bipado).length > 0 ? (
                  scannedPedido.itens.filter((item: any) => item.bipado).map((item: any, index: number) => (
                    <div key={index} className="flex items-center space-x-3 bg-gray-100 p-2 rounded-lg">
                      <img src={item.imagem} alt={item.nome} className="w-10 h-10 rounded object-cover" loading="lazy" decoding="async" width="40" height="40" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.nome}</div>
                        <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                      </div>
                      <div className="text-sm font-bold">1/1</div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500">Nenhum produto bipado neste pedido.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex-shrink-0 p-6 border-t border-gray-200">
          <Tabs value={scannerTab} onValueChange={onScannerTabChange}>
            <div className="flex items-center space-x-4 mb-4">
              <TabsList className="grid flex-1 grid-cols-2">
                <TabsTrigger value="nao-impressos">Não Impressos ({pedidosNaoImpressos.length})</TabsTrigger>
                <TabsTrigger value="impressos">Impressos ({pedidosImpressos.length})</TabsTrigger>
              </TabsList>
              <div className="relative w-1/2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input placeholder="Buscar pedido..." className="h-10 rounded-lg pl-10" />
              </div>
            </div>
            <TabsContent value="nao-impressos" className="max-h-[250px] overflow-y-auto pr-2">
              <div className="space-y-3">
                {pedidosNaoImpressos.map((pedido, index) => (
                  <Card key={index} className="bg-white hover:bg-gray-50 cursor-pointer">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="text-sm font-medium">Pedido #{pedido.id}</div>
                      <div className="text-xs text-gray-500">{pedido.marketplace} - {mapTipoEnvioLabel(pedido.tipoEnvio)}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="impressos" className="max-h-[250px] overflow-y-auto pr-2">
              <div className="space-y-3">
                {pedidosImpressos.map((pedido, index) => (
                  <Card key={index} className="bg-white hover:bg-gray-50 cursor-pointer">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="text-sm font-medium">Pedido #{pedido.id}</div>
                      <div className="text-xs text-gray-500">{pedido.marketplace} - {mapTipoEnvioLabel(pedido.tipoEnvio)}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter className="p-4 bg-gray-100 border-t border-gray-200">
          <Button className="w-full h-12 text-lg font-semibold" onClick={onCompleteBipagem}>
            <Check className="w-5 h-5 mr-2" />
            Completar Bipagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
