
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Package } from "lucide-react";
import { Variacao } from "./types";

interface BulkDimensionsDrawerProps {
  variacoes: Variacao[];
  onVariacoesChange: (variacoes: Variacao[]) => void;
}

export function BulkDimensionsDrawer({ variacoes, onVariacoesChange }: BulkDimensionsDrawerProps) {
  const [bulkData, setBulkData] = useState({
    altura: "",
    largura: "",
    comprimento: "",
    peso: ""
  });

  const handleBulkInputChange = (field: string, value: string) => {
    setBulkData(prev => ({ ...prev, [field]: value }));
  };

  const applyBulkData = () => {
    const updatedVariacoes = variacoes.map(variacao => ({
      ...variacao,
      ...(bulkData.altura && { altura: bulkData.altura }),
      ...(bulkData.largura && { largura: bulkData.largura }),
      ...(bulkData.comprimento && { comprimento: bulkData.comprimento }),
      ...(bulkData.peso && { peso: bulkData.peso })
    }));
    
    onVariacoesChange(updatedVariacoes);
    
    setBulkData({
      altura: "",
      largura: "",
      comprimento: "",
      peso: ""
    });
  };

  const clearBulkData = () => {
    setBulkData({
      altura: "",
      largura: "",
      comprimento: "",
      peso: ""
    });
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" className="mb-6">
          <Package className="w-4 h-4 mr-2" />
          Aplicar Dimensões em Massa
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh] w-[45%]">
        <DrawerHeader>
          <DrawerTitle>Aplicar Dimensões em Massa</DrawerTitle>
          <DrawerDescription>
            Preencha os campos abaixo para aplicar as mesmas dimensões a todas as {variacoes.length} variações
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="p-6 overflow-y-auto">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label htmlFor="bulk-altura">Altura (cm)</Label>
                <Input
                  id="bulk-altura"
                  type="number"
                  step="0.01"
                  value={bulkData.altura}
                  onChange={(e) => handleBulkInputChange("altura", e.target.value)}
                  placeholder="0,00"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="bulk-largura">Largura (cm)</Label>
                <Input
                  id="bulk-largura"
                  type="number"
                  step="0.01"
                  value={bulkData.largura}
                  onChange={(e) => handleBulkInputChange("largura", e.target.value)}
                  placeholder="0,00"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="bulk-comprimento">Comprimento (cm)</Label>
                <Input
                  id="bulk-comprimento"
                  type="number"
                  step="0.01"
                  value={bulkData.comprimento}
                  onChange={(e) => handleBulkInputChange("comprimento", e.target.value)}
                  placeholder="0,00"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="bulk-peso">Peso (kg)</Label>
                <Input
                  id="bulk-peso"
                  type="number"
                  step="0.01"
                  value={bulkData.peso}
                  onChange={(e) => handleBulkInputChange("peso", e.target.value)}
                  placeholder="0,00"
                  className="mt-2"
                />
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
