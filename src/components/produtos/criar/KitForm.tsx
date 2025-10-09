
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Minus, Trash2 } from "lucide-react";
import { FormData } from "./types";

interface KitItem {
  id: string;
  name: string;
  sku: string;
  type: "unico" | "variacao";
  quantidade: number;
  image?: string;
}

interface KitFormProps {
  formData: FormData;
  onInputChange: (field: string, value: string) => void;
  etapaAtual: "info" | "produtos";
  onEtapaChange: (etapa: "info" | "produtos") => void;
  kitItems: KitItem[];
  onKitItemsChange: (items: KitItem[]) => void;
  editMode?: boolean;
}

const mockProdutos = [
  { id: "1", name: "iPhone 15 Pro", sku: "IPH15P-001", type: "unico" as const, image: "/placeholder.svg" },
  { id: "2", name: "Camiseta Basic - P - Azul", sku: "CB-001-P-AZ", type: "variacao" as const, image: "/placeholder.svg" },
  { id: "3", name: "MacBook Air M2", sku: "MBA-M2-002", type: "unico" as const, image: "/placeholder.svg" },
  { id: "4", name: "Tênis Esportivo - 38 - Preto", sku: "TE-002-38-PT", type: "variacao" as const, image: "/placeholder.svg" },
];

export function KitForm({ 
  formData, 
  onInputChange, 
  etapaAtual, 
  onEtapaChange, 
  kitItems, 
  onKitItemsChange,
  editMode = false
}: KitFormProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const filteredProducts = mockProdutos.filter(produto =>
    produto.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    produto.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleProductSelection = (productId: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, productId]);
    } else {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    }
  };

  const handleSaveProducts = () => {
    const newItems = selectedProducts.map(productId => {
      const product = mockProdutos.find(p => p.id === productId);
      return {
        id: productId,
        name: product?.name || "",
        sku: product?.sku || "",
        type: product?.type || "unico",
        quantidade: 1,
        image: product?.image
      } as KitItem;
    });
    
    onKitItemsChange([...kitItems, ...newItems]);
    setSelectedProducts([]);
  };

  const updateQuantity = (itemId: string, quantidade: number) => {
    if (quantidade < 1) return;
    onKitItemsChange(
      kitItems.map(item => 
        item.id === itemId ? { ...item, quantidade } : item
      )
    );
  };

  const removeItem = (itemId: string) => {
    onKitItemsChange(kitItems.filter(item => item.id !== itemId));
  };

  if (etapaAtual === "info") {
    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-xl font-semibold mb-6">Informações do KIT</h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="nome">
                  Nome do KIT <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => onInputChange("nome", e.target.value)}
                  placeholder="Nome do seu KIT"
                  className="mt-2"
                  required
                />
              </div>
              <div>
                <Label htmlFor="sku">
                  SKU <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => onInputChange("sku", e.target.value)}
                  placeholder="Código único do produto"
                  className="mt-2"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="categoria">Categoria</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={(value) => onInputChange("categoria", value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kits">Kits</SelectItem>
                    <SelectItem value="combos">Combos</SelectItem>
                    <SelectItem value="promocoes">Promoções</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="descricao">Descrição</Label>
                <Input
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => onInputChange("descricao", e.target.value)}
                  placeholder="Descrição do KIT"
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <Label>Foto de Capa do KIT</Label>
          <div className="mt-2 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
            <div className="space-y-4">
              <div className="text-gray-500">
                <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-gray-600">Clique para adicionar ou arraste a foto aqui</p>
                <p className="text-sm text-gray-500 mt-1">PNG, JPG até 10MB</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-2">Produtos do KIT</h3>
        <p className="text-gray-600">Adicione os produtos que farão parte deste KIT</p>
      </div>

      <Drawer>
        <DrawerTrigger asChild>
          <Button className="bg-novura-primary hover:bg-novura-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Produtos
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh] w-[45%]">
          <DrawerHeader>
            <DrawerTitle>Selecionar Produtos</DrawerTitle>
            <DrawerDescription>
              Escolha os produtos únicos ou variações que farão parte do KIT
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="p-6 overflow-y-auto">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar produtos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredProducts.map((produto) => (
                  <div key={produto.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                    <Checkbox
                      checked={selectedProducts.includes(produto.id)}
                      onCheckedChange={(checked) => handleProductSelection(produto.id, !!checked)}
                    />
                    <img
                      src={produto.image}
                      alt={produto.name}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="flex-1">
                      <p className="font-medium">{produto.name}</p>
                      <div className="flex items-center space-x-2">
                        <p className="text-sm text-gray-500">SKU: {produto.sku}</p>
                        <span className={`text-xs px-2 py-1 rounded ${
                          produto.type === 'unico' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {produto.type === 'unico' ? 'Único' : 'Variação'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 p-6 border-t">
            <DrawerClose asChild>
              <Button variant="outline" className="flex-1">
                Cancelar
              </Button>
            </DrawerClose>
            <DrawerClose asChild>
              <Button 
                onClick={handleSaveProducts}
                className="flex-1 bg-novura-primary hover:bg-novura-primary/90"
                disabled={selectedProducts.length === 0}
              >
                Salvar ({selectedProducts.length})
              </Button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>

      {kitItems.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium">Produtos Selecionados ({kitItems.length})</h4>
          <div className="space-y-3">
            {kitItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={item.image || "/placeholder.svg"}
                        alt={item.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.quantidade - 1)}
                          disabled={item.quantidade <= 1}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center">{item.quantidade}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.quantidade + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
