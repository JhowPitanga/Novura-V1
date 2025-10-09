
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductFormData } from "@/types/products";

interface DimensionsFormProps {
  formData: ProductFormData;
  onInputChange: (field: string, value: string) => void;
  errors?: Record<string, boolean>;
}

export function DimensionsForm({ formData, onInputChange, errors = {} }: DimensionsFormProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Dimensões e Peso da Embalagem</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label htmlFor="height">Altura (cm) *</Label>
            <Input
              id="height"
              type="number"
              step="0.1"
              value={formData.height}
              onChange={(e) => onInputChange("height", e.target.value)}
              placeholder="0,0"
              className={`mt-2 ${errors.height ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {errors.height && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="width">Largura (cm) *</Label>
            <Input
              id="width"
              type="number"
              step="0.1"
              value={formData.width}
              onChange={(e) => onInputChange("width", e.target.value)}
              placeholder="0,0"
              className={`mt-2 ${errors.width ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {errors.width && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="length">Comprimento (cm) *</Label>
            <Input
              id="length"
              type="number"
              step="0.1"
              value={formData.length}
              onChange={(e) => onInputChange("length", e.target.value)}
              placeholder="0,0"
              className={`mt-2 ${errors.length ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {errors.length && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="weight">Peso da Embalagem (gramas) *</Label>
            <Input
              id="weight"
              type="number"
              step="1"
              value={formData.weight}
              onChange={(e) => onInputChange("weight", e.target.value)}
              placeholder="0"
              className={`mt-2 ${errors.weight ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {errors.weight && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
