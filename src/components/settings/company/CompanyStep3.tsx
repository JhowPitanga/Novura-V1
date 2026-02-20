import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface EmpresaData {
  lojas_associadas: string[];
}

interface EmpresaStep3Props {
  data: EmpresaData;
  updateData: (data: Partial<EmpresaData>) => void;
  connectedStores?: { id: string; name: string; marketplace: string; logo?: string }[];
  loadingStores?: boolean;
}

export function CompanyStep3({ data, updateData, connectedStores = [], loadingStores = false }: EmpresaStep3Props) {
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
    const byConn = connectedStores.find(s => s.id === storeId);
    if (byConn) return `${byConn.name} (${byConn.marketplace})`;
    return storeId;
  };

  const getStoreLogo = (storeId: string) => {
    const byConn = connectedStores.find(s => s.id === storeId);
    if (byConn?.logo) return byConn.logo;
    return "🏪";
  };

  const storesToDisplay = connectedStores.map(s => ({ id: s.id, name: `${s.name} (${s.marketplace})`, logo: s.logo }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Associações de Lojas</h3>
        <p className="text-gray-600 mb-6">
          Selecione as lojas integradas que estarão associadas a esta empresa
        </p>
        
        <div className="space-y-4">
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="right">
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
            
            <DrawerContent className="h-full w-[45vw] fixed right-0" aria-labelledby="empresa-step3-dialog-title">
              <DrawerHeader>
                <DrawerTitle id="empresa-step3-title">Selecionar Lojas Integradas</DrawerTitle>
                <DialogTitle id="empresa-step3-dialog-title" className="sr-only">Selecionar Lojas Integradas</DialogTitle>
              </DrawerHeader>
              
              <div className="p-6 space-y-4">
                {loadingStores ? (
                  <div className="text-sm text-gray-600">Carregando lojas conectadas...</div>
                ) : connectedStores.length === 0 ? (
                  <div className="text-sm text-gray-600">
                    Nenhuma loja conectada encontrada. Conecte pela aba "Aplicativos".
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {storesToDisplay.map((store) => (
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
                          {store.logo && store.logo.startsWith('http') ? (
                            <img src={store.logo} alt={store.name} className="h-5 w-5 rounded" />
                          ) : (
                            <span className="text-xl">{store.logo || '🏪'}</span>
                          )}
                          <span className="text-sm font-medium">{store.name}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                
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
                    {(() => {
                      const logo = getStoreLogo(storeId);
                      return logo && logo.startsWith('http')
                        ? <img src={logo} alt="logo" className="h-4 w-4 rounded" />
                        : <span>{logo}</span>;
                    })()}
                    <span className="truncate max-w-[220px]">{getStoreName(storeId)}</span>
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