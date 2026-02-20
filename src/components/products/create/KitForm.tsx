import { useState } from "react";
import { ProductFormData, KitItem, KitStep } from "@/types/products";
import { ProductForm } from "@/components/produtos/criar/ProductForm";
import { ImageUpload } from "@/components/produtos/criar/ImageUpload";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, X } from "lucide-react";

interface KitFormProps {
  formData: ProductFormData;
  onInputChange: (field: string, value: string) => void;
  currentStep: KitStep;
  onStepChange: (step: KitStep) => void;
  kitItems: KitItem[];
  onKitItemsChange: (items: KitItem[]) => void;
  selectedImages?: File[];
  onImagesChange?: (images: File[]) => void;
  availableProducts?: any[];
  productsLoading?: boolean;
}

export function KitForm({
  formData,
  onInputChange,
  currentStep,
  onStepChange,
  kitItems,
  onKitItemsChange,
  selectedImages = [],
  onImagesChange = () => {},
  availableProducts = [],
  productsLoading = false,
}: KitFormProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const addProductToKit = (p: any) => {
    const existsIndex = kitItems.findIndex(i => (i.id ?? (i as any).product_id) === p.id);
    const newItem: KitItem = {
      id: p.id,
      name: p.name,
      sku: p.sku,
      quantity: (existsIndex >= 0 ? (kitItems[existsIndex] as any).quantity : 1) || 1,
    } as any;
    if (existsIndex >= 0) {
      const updated = [...kitItems];
      updated[existsIndex] = { ...updated[existsIndex], ...newItem };
      onKitItemsChange(updated);
    } else {
      onKitItemsChange([...kitItems, newItem]);
    }
  };

  const removeProductFromKit = (id: string) => {
    onKitItemsChange(kitItems.filter(i => (i.id ?? (i as any).product_id) !== id));
  };

  const setQuantity = (id: string, value: number) => {
    const qty = Math.max(1, Math.floor(Number(value) || 1));
    const updated = kitItems.map((i: any) => {
      if ((i.id ?? i.product_id) === id) {
        return { ...i, quantity: qty };
      }
      return i;
    });
    onKitItemsChange(updated);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Kit Configuration</h3>

        {currentStep === "info" && (
          <div className="space-y-6">
            <ProductForm 
              formData={formData} 
              onInputChange={onInputChange} 
              includeSku={true} 
            />
            <ImageUpload 
              selectedImages={selectedImages} 
              onImagesChange={onImagesChange} 
            />
          </div>
        )}

        {currentStep === "products" && (
          <div className="space-y-6">
            {/* Quadro para abrir o Drawer */}
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DrawerTrigger asChild>
                <div
                  className="relative border rounded-xl p-6 cursor-pointer group flex items-center justify-center gap-4 transition-colors bg-white hover:bg-novura-primary hover:border-novura-primary"
                  onClick={() => setDrawerOpen(true)}
                  role="button"
                >
                  {/* Ícone 2D estilizado de KIT */}
                  <svg width="48" height="48" viewBox="0 0 24 24" className="text-novura-primary group-hover:text-white transition-colors">
                    <rect x="3" y="8" width="8" height="8" rx="2" fill="currentColor" opacity="0.2" />
                    <rect x="13" y="6" width="8" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <path d="M5 6h6l2 2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <path d="M4 16l2 2h4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                  <span className="font-medium text-gray-900 group-hover:text-white transition-colors">Adicionar produto ao kit</span>
                </div>
              </DrawerTrigger>
              <DrawerContent>
                <div className="relative">
                  {/* Botão X para fechar */}
                  <button
                    className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <DrawerHeader>
                    <DrawerTitle>Selecionar produtos</DrawerTitle>
                  </DrawerHeader>
                </div>
                <div className="p-4 space-y-4">
                  {/* Barra de pesquisa */}
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Buscar por nome ou SKU..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  {productsLoading ? (
                    <p className="text-gray-500">Carregando produtos...</p>
                  ) : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {(availableProducts || [])
                        .filter((p: any) => {
                          const term = searchTerm.trim().toLowerCase();
                          if (!term) return true;
                          return (
                            String(p.name || '').toLowerCase().includes(term) ||
                            String(p.sku || '').toLowerCase().includes(term)
                          );
                        })
                        .map((p: any) => {
                          const imgSrc = Array.isArray(p.image_urls) && p.image_urls.length > 0
                            ? p.image_urls[0]
                            : "/placeholder.svg";
                          const tipoLabel = p.type === 'UNICO' ? 'Único' : 'Variação';
                          const alreadyAdded = kitItems.some((i: any) => (i.id ?? i.product_id) === p.id);
                          return (
                            <div key={p.id} className="border rounded-lg p-3 flex items-center gap-3">
                              <img
                                src={imgSrc}
                                alt={p.name}
                                className="w-12 h-12 rounded object-cover border"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{p.name}</div>
                                <div className="text-sm text-gray-500 truncate">SKU: {p.sku}</div>
                              </div>
                              {alreadyAdded ? (
                                <button
                                  className="px-3 py-1 rounded bg-novura-primary/10 text-novura-primary border border-novura-primary flex items-center gap-2 ml-2"
                                  disabled
                                >
                                  Adicionado
                                </button>
                              ) : (
                                <button
                                  className="px-3 py-1 rounded bg-novura-primary text-white hover:bg-novura-primary/90 flex items-center gap-2 ml-2"
                                  title={`Adicionar (${tipoLabel})`}
                                  onClick={() => addProductToKit(p)}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                  <div className="flex justify-end pt-2">
                    <button
                      className="px-4 py-2 rounded bg-novura-primary text-white hover:bg-novura-primary/90"
                      onClick={() => setDrawerOpen(false)}
                    >
                      Pronto
                    </button>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>

            {/* Listagem dos produtos escolhidos com coluna de quantidade à direita */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold">Itens do KIT</h4>
              {kitItems.length === 0 ? (
                <p className="text-gray-500">Nenhum item selecionado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {kitItems.map((item: any) => (
                    <div key={(item.id ?? item.product_id)} className="border rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <img
                          src={(item.image_url ?? (availableProducts?.find((ap: any) => ap.id === (item.id ?? item.product_id))?.image_urls?.[0]) ?? "/placeholder.svg")}
                          alt={item.name}
                          className="w-12 h-12 rounded object-cover border"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.name}</div>
                          <div className="text-sm text-gray-500 truncate">SKU: {item.sku}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Qtd</label>
                        <input
                          type="number"
                          min={1}
                          className="w-24 border rounded px-2 py-1"
                          value={item.quantity}
                          onChange={(e) => setQuantity(item.id ?? item.product_id, Number(e.target.value))}
                        />
                        <button
                          className="px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 flex items-center gap-2"
                          onClick={() => removeProductFromKit(item.id ?? item.product_id)}
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}