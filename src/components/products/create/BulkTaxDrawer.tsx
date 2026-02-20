
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Package } from "lucide-react";
import { Variacao } from "./types";

interface BulkTaxDrawerProps {
  variacoes: Variacao[];
  onVariacoesChange: (variacoes: Variacao[]) => void;
}

export function BulkTaxDrawer({ variacoes, onVariacoesChange }: BulkTaxDrawerProps) {
  const [bulkData, setBulkData] = useState({
    ncm: "",
    cest: "",
    unidade: "",
    origem: ""
  });

  const handleBulkInputChange = (field: string, value: string) => {
    setBulkData(prev => ({ ...prev, [field]: value }));
  };

  const applyBulkData = () => {
    const updatedVariacoes = variacoes.map(variacao => ({
      ...variacao,
      ...(bulkData.ncm && { ncm: bulkData.ncm }),
      ...(bulkData.cest && { cest: bulkData.cest }),
      ...(bulkData.unidade && { unidade: bulkData.unidade }),
      ...(bulkData.origem && { origem: bulkData.origem })
    }));
    
    onVariacoesChange(updatedVariacoes);
    
    setBulkData({
      ncm: "",
      cest: "",
      unidade: "",
      origem: ""
    });
  };

  const clearBulkData = () => {
    setBulkData({
      ncm: "",
      cest: "",
      unidade: "",
      origem: ""
    });
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" className="mb-6">
          <Package className="w-4 h-4 mr-2" />
          Aplicar Dados em Massa
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh] w-[45%]">
        <DrawerHeader>
          <DrawerTitle>Aplicar Informações Fiscais em Massa</DrawerTitle>
          <DrawerDescription>
            Preencha os campos abaixo para aplicar as mesmas informações fiscais a todas as {variacoes.length} variações
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="p-6 overflow-y-auto">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label htmlFor="bulk-ncm">NCM</Label>
                <Input
                  id="bulk-ncm"
                  value={bulkData.ncm}
                  onChange={(e) => handleBulkInputChange("ncm", e.target.value)}
                  placeholder="00000000"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="bulk-cest">CEST</Label>
                <Input
                  id="bulk-cest"
                  value={bulkData.cest}
                  onChange={(e) => handleBulkInputChange("cest", e.target.value)}
                  placeholder="0000000"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="bulk-unidade">Unidade de Medida</Label>
                <Select
                  value={bulkData.unidade}
                  onValueChange={(value) => handleBulkInputChange("unidade", value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione a unidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UN">Unidade (UN)</SelectItem>
                    <SelectItem value="KG">Quilograma (KG)</SelectItem>
                    <SelectItem value="PAR">Par (PAR)</SelectItem>
                    <SelectItem value="KIT">Kit (KIT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="bulk-origem">Origem</Label>
                <Select
                  value={bulkData.origem}
                  onValueChange={(value) => handleBulkInputChange("origem", value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 - Nacional</SelectItem>
                    <SelectItem value="1">1 - Estrangeira - Importação direta</SelectItem>
                    <SelectItem value="2">2 - Estrangeira - Adquirida no mercado interno</SelectItem>
                    <SelectItem value="3">3 - Nacional - Conteúdo de importação superior a 40%</SelectItem>
                    <SelectItem value="4">4 - Nacional - Produção em conformidade com processos produtivos básicos</SelectItem>
                    <SelectItem value="5">5 - Nacional - Conteúdo de importação inferior ou igual a 40%</SelectItem>
                    <SelectItem value="6">6 - Estrangeira - Importação direta sem similar nacional</SelectItem>
                    <SelectItem value="7">7 - Estrangeira - Adquirida no mercado interno sem similar nacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-gray-700">
                Variações que serão afetadas ({variacoes.length}):
              </h4>
              <div className="max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-2">
                  {variacoes.slice(0, 6).map((variacao) => (
                    <div key={variacao.id} className="flex items-center space-x-2 text-sm">
                      {variacao.cor && (
                        <div
                          className="w-3 h-3 rounded-full border border-gray-300"
                          style={{ backgroundColor: variacao.cor.toLowerCase() }}
                        />
                      )}
                      <span className="truncate">{variacao.nome}</span>
                    </div>
                  ))}
                  {variacoes.length > 6 && (
                    <div className="text-xs text-gray-500 col-span-2">
                      ... e mais {variacoes.length - 6} variações
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t">
          <Button variant="outline" onClick={clearBulkData} className="flex-1">
            Limpar Campos
          </Button>
          <DrawerClose asChild>
            <Button onClick={applyBulkData} className="flex-1 bg-novura-primary hover:bg-novura-primary/90">
              Aplicar a Todas
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
