
import { Label } from "@/components/ui/label";
import { ProductFormData } from "@/types/products";
import { BrIntegerInput } from "@/components/products/create/BrIntegerInput";

interface DimensionsFormProps {
  formData: ProductFormData;
  onInputChange: (field: string, value: string) => void;
  errors?: Record<string, boolean>;
}

export function DimensionsForm({ formData, onInputChange, errors = {} }: DimensionsFormProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Dimensões e peso da embalagem</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label htmlFor="height">Altura (cm) *</Label>
            <BrIntegerInput
              id="height"
              value={formData.height}
              onChange={(v) => onInputChange("height", v)}
              placeholder="0"
              className={`mt-2 ${errors.height ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              aria-invalid={errors.height}
            />
            {errors.height && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="width">Largura (cm) *</Label>
            <BrIntegerInput
              id="width"
              value={formData.width}
              onChange={(v) => onInputChange("width", v)}
              placeholder="0"
              className={`mt-2 ${errors.width ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              aria-invalid={errors.width}
            />
            {errors.width && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="length">Comprimento (cm) *</Label>
            <BrIntegerInput
              id="length"
              value={formData.length}
              onChange={(v) => onInputChange("length", v)}
              placeholder="0"
              className={`mt-2 ${errors.length ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              aria-invalid={errors.length}
            />
            {errors.length && (
              <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
            )}
          </div>
          <div>
            <Label htmlFor="weight">Peso da embalagem (g) *</Label>
            <BrIntegerInput
              id="weight"
              value={formData.weight}
              onChange={(v) => onInputChange("weight", v)}
              placeholder="0"
              className={`mt-2 ${errors.weight ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              aria-invalid={errors.weight}
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
