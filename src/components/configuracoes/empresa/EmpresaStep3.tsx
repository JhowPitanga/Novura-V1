import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";

interface EmpresaData {
  lojas_associadas: string[];
}

interface EmpresaStep3Props {
  data: EmpresaData;
  updateData: (data: Partial<EmpresaData>) => void;
}

const availableStores = [
  { id: "mercado-livre", name: "Mercado Livre", logo: "🛒" },
  { id: "shopee", name: "Shopee", logo: "🛍️" },
  { id: "magalu", name: "Magazine Luiza", logo: "🏪" },
  { id: "amazon", name: "Amazon", logo: "📦" },
  { id: "americanas", name: "Americanas", logo: "🏬" },
  { id: "casas-bahia", name: "Casas Bahia", logo: "🏠" },
  { id: "extra", name: "Extra", logo: "🛒" },
  { id: "submarino", name: "Submarino", logo: "🌊" }
];

export function EmpresaStep3({ data, updateData }: EmpresaStep3Props) {
  const [selectedStores, setSelectedStores] = useState<string[]>(data.lojas_associadas);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleStoreToggle = (storeId: string) => {
    setSelectedStores(prev => 
      prev.includes(storeId) 
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };

  const handleConfirm = () => {
    updateData({ lojas_associadas: selectedStores });
    setDrawerOpen(false);
  };

  const removeStore = (storeId: string) => {
    const newStores = data.lojas_associadas.filter(id => id !== storeId);
    updateData({ lojas_associadas: newStores });
    setSelectedStores(newStores);
  };

  const getStoreName = (storeId: string) => {
    return availableStores.find(store => store.id === storeId)?.name || storeId;
  };

  const getStoreLogo = (storeId: string) => {
    return availableStores.find(store => store.id === storeId)?.logo || "🏪";
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Associações de Lojas</h3>
        <p className="text-gray-600 mb-6">
          Selecione as lojas integradas que estarão associadas a esta empresa
        </p>
        
        <div className="space-y-4">
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full border-dashed border-2 border-gray-300 hover:border-gray-400"
                onClick={() => setSelectedStores(data.lojas_associadas)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Loja
              </Button>
            </DrawerTrigger>
            
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Selecionar Lojas Integradas</DrawerTitle>
              </DrawerHeader>
              
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableStores.map((store) => (
                    <div key={store.id} className="flex items-center space-x-3">
                      <Checkbox 
                        id={store.id}
                        checked={selectedStores.includes(store.id)}
                        onCheckedChange={() => handleStoreToggle(store.id)}
                      />
                      <label 
                        htmlFor={store.id} 
                        className="flex items-center space-x-2 cursor-pointer"
                      >
                        <span className="text-xl">{store.logo}</span>
                        <span className="text-sm font-medium">{store.name}</span>
                      </label>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => setDrawerOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleConfirm}
                    className="bg-novura-primary hover:bg-novura-primary/90"
                  >
                    Confirmar Seleção
                  </Button>
                </div>
              </div>
            </DrawerContent>
          </Drawer>

          {data.lojas_associadas.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">Lojas Selecionadas:</h4>
              <div className="flex flex-wrap gap-2">
                {data.lojas_associadas.map((storeId) => (
                  <Badge 
                    key={storeId} 
                    variant="secondary" 
                    className="flex items-center gap-2 px-3 py-1"
                  >
                    <span>{getStoreLogo(storeId)}</span>
                    <span>{getStoreName(storeId)}</span>
                    <button
                      onClick={() => removeStore(storeId)}
                      className="ml-1 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Informação:</strong> As lojas selecionadas poderão emitir notas fiscais através desta empresa.
        </p>
      </div>
    </div>
  );
}