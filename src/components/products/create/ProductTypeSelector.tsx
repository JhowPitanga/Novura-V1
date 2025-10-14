
import { Package, Layers, Package2 } from "lucide-react";
import { ProductType } from "@/types/products";

interface ProductTypeSelectorProps {
  productType: ProductType | "";
  onProductTypeChange: (type: ProductType) => void;
}

export function ProductTypeSelector({ productType, onProductTypeChange }: ProductTypeSelectorProps) {
  const productTypes = [
    {
      id: "single" as ProductType,
      icon: Package,
      title: "Produto Simples",
      description: "Produto simples sem variações"
    },
    {
      id: "variation" as ProductType, 
      icon: Layers,
      title: "Com Variações",
      description: "Produto com cores, tamanhos etc."
    },
    {
      id: "kit" as ProductType,
      icon: Package2,
      title: "Kit",
      description: "Conjunto de produtos vendidos juntos"
    }
  ];

  const handleTypeSelect = (typeId: ProductType) => {
    console.log("Product type selected:", typeId);
    onProductTypeChange(typeId);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Selecione o Tipo de Produto</h3>
        <div className="grid grid-cols-3 gap-6">
          {productTypes.map((type) => {
            const IconComponent = type.icon;
            return (
              <div
                key={type.id}
                className={`p-8 border-2 rounded-lg cursor-pointer transition-all ${
                  productType === type.id
                    ? "border-novura-primary bg-novura-primary/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => handleTypeSelect(type.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTypeSelect(type.id);
                  }
                }}
              >
                <IconComponent className="w-10 h-10 text-novura-primary mb-4" />
                <h4 className="font-semibold mb-2 text-lg">{type.title}</h4>
                <p className="text-sm text-gray-600">{type.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
