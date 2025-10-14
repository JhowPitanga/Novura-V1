
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductFormData } from "@/types/products";
import { useCategories } from "@/hooks/useCategories";

interface ProductFormProps {
  formData: ProductFormData;
  onInputChange: (field: string, value: string) => void;
  includeSku?: boolean;
  errors?: Record<string, boolean>;
}

export function ProductForm({ formData, onInputChange, includeSku = true, errors = {} }: ProductFormProps) {
  const { categories, loading: categoriesLoading } = useCategories();

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <Label htmlFor="name">
          Nome do Produto <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => onInputChange("name", e.target.value)}
          placeholder="Nome do produto"
          className={`mt-2 ${errors.name ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          required
        />
        {errors.name && (
          <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
        )}
      </div>
      {includeSku && (
        <div>
          <Label htmlFor="sku">
            SKU <span className="text-red-500">*</span>
          </Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => onInputChange("sku", e.target.value)}
            placeholder="Código único do produto"
            className={`mt-2 ${errors.sku ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            required
          />
          {errors.sku && (
            <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
          )}
        </div>
      )}
      <div>
        <Label htmlFor="category">Categoria</Label>
        <Select value={formData.category} onValueChange={(value) => onInputChange("category", value)}>
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Selecione uma categoria" />
          </SelectTrigger>
          <SelectContent>
            {categoriesLoading ? (
              <SelectItem value="loading" disabled>Carregando...</SelectItem>
            ) : (
              categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="brand">Marca</Label>
        <Input
          id="brand"
          value={formData.brand}
          onChange={(e) => onInputChange("brand", e.target.value)}
          placeholder="Marca do produto"
          className="mt-2"
        />
      </div>
      <div className="col-span-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => onInputChange("description", e.target.value)}
          placeholder="Descreva o produto em detalhes"
          rows={4}
          className="mt-2"
        />
      </div>
    </div>
  );
}
