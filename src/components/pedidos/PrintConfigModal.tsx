
import { useState } from "react";
import { Settings, FileText, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PrintConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintConfigModal({ open, onOpenChange }: PrintConfigModalProps) {
  const [etiquetaFormat, setEtiquetaFormat] = useState("pdf");
  const [etiquetaPdfOption, setEtiquetaPdfOption] = useState("danfe");
  const [etiquetaZebraOption, setEtiquetaZebraOption] = useState("danfe");
  const [zebraProductInfo, setZebraProductInfo] = useState("produto");
  const [listOrder, setListOrder] = useState("sku");

  const handleSave = () => {
    // Save configurations
    console.log("Salvando configurações:", {
      etiquetaFormat,
      etiquetaPdfOption,
      etiquetaZebraOption,
      zebraProductInfo,
      listOrder
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] bg-white rounded-2xl overflow-hidden" aria-describedby="print-config-desc" aria-labelledby="print-config-title">
        <DialogHeader className="p-6 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <Settings className="w-6 h-6 text-novura-primary" />
            <DialogTitle id="print-config-title" className="text-2xl">Configurações de Impressão</DialogTitle>
          </div>
          <DialogDescription id="print-config-desc" className="mt-2">Defina as preferências de impressão para etiquetas e listas de separação.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="etiquetas" className="h-full">
            <div className="border-b border-gray-100">
              <TabsList className="grid w-full grid-cols-2 bg-transparent h-16 rounded-none">
                <TabsTrigger 
                  value="etiquetas" 
                  className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:bg-transparent"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Etiquetas
                </TabsTrigger>
                <TabsTrigger 
                  value="lista-separacao"
                  className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:bg-transparent"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Lista de Separação
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="etiquetas" className="p-6">
              <div className="grid grid-cols-2 gap-8">
                {/* Configuration Panel */}
                <div className="space-y-6">
                  <div>
                    <Label className="text-base font-semibold mb-4 block">Formato da Etiqueta</Label>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          id="pdf-format"
                          name="etiqueta-format"
                          value="pdf"
                          checked={etiquetaFormat === "pdf"}
                          onChange={() => setEtiquetaFormat("pdf")}
                          className="w-4 h-4 text-novura-primary"
                        />
                        <Label htmlFor="pdf-format" className="text-sm font-medium">
                          Impressão comum PDF
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          id="zebra-format"
                          name="etiqueta-format"
                          value="zebra"
                          checked={etiquetaFormat === "zebra"}
                          onChange={() => setEtiquetaFormat("zebra")}
                          className="w-4 h-4 text-novura-primary"
                        />
                        <Label htmlFor="zebra-format" className="text-sm font-medium">
                          Impressão Zebra
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* PDF Options */}
                  {etiquetaFormat === "pdf" && (
                    <div className="pl-7 space-y-3">
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          id="danfe-pdf"
                          name="pdf-option"
                          value="danfe"
                          checked={etiquetaPdfOption === "danfe"}
                          onChange={() => setEtiquetaPdfOption("danfe")}
                          className="w-4 h-4 text-novura-primary"
                        />
                        <Label htmlFor="danfe-pdf" className="text-sm">
                          Imprimir etiqueta com DANFE SIMPLIFICADA
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          id="casada-pdf"
                          name="pdf-option"
                          value="casada"
                          checked={etiquetaPdfOption === "casada"}
                          onChange={() => setEtiquetaPdfOption("casada")}
                          className="w-4 h-4 text-novura-primary"
                        />
                        <Label htmlFor="casada-pdf" className="text-sm">
                          Imprimir etiqueta casada
                        </Label>
                      </div>
                    </div>
                  )}

                  {/* Zebra Options */}
                  {etiquetaFormat === "zebra" && (
                    <div className="pl-7 space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            id="danfe-zebra"
                            name="zebra-option"
                            value="danfe"
                            checked={etiquetaZebraOption === "danfe"}
                            onChange={() => setEtiquetaZebraOption("danfe")}
                            className="w-4 h-4 text-novura-primary"
                          />
                          <Label htmlFor="danfe-zebra" className="text-sm">
                            Imprimir etiqueta com DANFE SIMPLIFICADA
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            id="casada-zebra"
                            name="zebra-option"
                            value="casada"
                            checked={etiquetaZebraOption === "casada"}
                            onChange={() => setEtiquetaZebraOption("casada")}
                            className="w-4 h-4 text-novura-primary"
                          />
                          <Label htmlFor="casada-zebra" className="text-sm">
                            Imprimir etiqueta casada
                          </Label>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-2 block">
                          Informações do Produto
                        </Label>
                        <Select value={zebraProductInfo} onValueChange={setZebraProductInfo}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border shadow-lg">
                            <SelectItem value="produto">Nome do produto</SelectItem>
                            <SelectItem value="cliente">Nome do cliente</SelectItem>
                            <SelectItem value="nenhuma">Nenhuma (segurança no envio)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview Panel */}
                <div>
                  <Label className="text-base font-semibold mb-4 block">Visualização da Etiqueta</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 h-80 flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                      <Printer className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 font-medium">
                        Pré-visualização da Etiqueta
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Formato: {etiquetaFormat === "pdf" ? "PDF" : "Zebra"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Opção: {etiquetaFormat === "pdf" ? 
                          (etiquetaPdfOption === "danfe" ? "DANFE Simplificada" : "Etiqueta Casada") :
                          (etiquetaZebraOption === "danfe" ? "DANFE Simplificada" : "Etiqueta Casada")
                        }
                      </p>
                      {etiquetaFormat === "zebra" && (
                        <p className="text-sm text-gray-500">
                          Info: {zebraProductInfo === "produto" ? "Nome do produto" : 
                                zebraProductInfo === "cliente" ? "Nome do cliente" : "Sem informações"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="lista-separacao" className="p-6">
              <div className="max-w-md">
                <Label className="text-base font-semibold mb-4 block">
                  Ordem de Impressão da Lista
                </Label>
                <Select value={listOrder} onValueChange={setListOrder}>
                  <SelectTrigger className="w-full h-12 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border shadow-lg">
                    <SelectItem value="sku">Ordem de SKU</SelectItem>
                    <SelectItem value="localizacao">Ordem de localização dos produtos</SelectItem>
                    <SelectItem value="alfabetica">Ordem alfabética</SelectItem>
                    <SelectItem value="prioridade">Ordem de prioridade</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-600 mt-2">
                  Esta configuração define como os itens aparecerão na lista de separação impressa.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="p-6 border-t border-gray-100">
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 px-6 rounded-2xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              className="h-12 px-6 rounded-2xl bg-novura-primary"
            >
              Salvar Configurações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
