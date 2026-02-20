
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductFormData } from "@/types/products";
import { useStorage } from "@/hooks/useStorage";

interface StockFormProps {
  formData: ProductFormData;
  onInputChange: (field: string, value: string) => void;
  errors?: Record<string, boolean>;
}

export function StockForm({ formData, onInputChange, errors = {} }: StockFormProps) {
  const { storageLocations, loading: storageLoading } = useStorage();

  // Define automaticamente um galpão padrão ao carregar a lista de storage
  useEffect(() => {
    if (!storageLoading && storageLocations.length > 0 && !formData.warehouse) {
      onInputChange("warehouse", storageLocations[0].id);
    }
  }, [storageLoading, storageLocations, formData.warehouse, onInputChange]);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Preço e Estoque</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label htmlFor="costPrice">
              Preço de Custo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="costPrice"
              type="number"
              step="0.01"
              value={formData.costPrice}
              onChange={(e) => onInputChange("costPrice", e.target.value)}
              placeholder="0,00"
              className={`mt-2 ${errors.costPrice ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              required
            />
            {errors.costPrice && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="sellPrice">Preço de Venda</Label>
            <Input
              id="sellPrice"
              type="number"
              step="0.01"
              value={formData.sellPrice}
              onChange={(e) => onInputChange("sellPrice", e.target.value)}
              placeholder="0,00"
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="stock">Quantidade em Estoque</Label>
            <Input
              id="stock"
              type="number"
              value={formData.stock}
              onChange={(e) => onInputChange("stock", e.target.value)}
              placeholder="0"
              className={`mt-2 ${errors.stock ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {errors.stock && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="warehouse">Armazém</Label>
            <Select value={formData.warehouse} onValueChange={(value) => onInputChange("warehouse", value)}>
              <SelectTrigger className={`mt-2 ${errors.warehouse ? 'border-red-500 focus-visible:ring-red-500' : ''}`}>
                <SelectValue placeholder="Selecione o armazém" />
              </SelectTrigger>
              <SelectContent>
                {storageLoading ? (
                  <SelectItem value="loading" disabled>Carregando...</SelectItem>
                ) : (
                  storageLocations.map((storage) => (
                    <SelectItem key={storage.id} value={storage.id}>
                      {storage.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.warehouse && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
