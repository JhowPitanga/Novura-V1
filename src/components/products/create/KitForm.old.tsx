
import { ProductFormData, KitItem, KitStep } from "@/types/products";
import { ProductForm } from "@/components/produtos/criar/ProductForm";
import { ImageUpload } from "@/components/produtos/criar/ImageUpload";

interface KitFormProps {
  formData: ProductFormData;
  onInputChange: (field: string, value: string) => void;
  currentStep: KitStep;
  onStepChange: (step: KitStep) => void;
  kitItems: KitItem[];
  onKitItemsChange: (items: KitItem[]) => void;
  selectedImages?: File[];
  onImagesChange?: (images: File[]) => void;
}

export function KitForm({
  formData,
  onInputChange,
  currentStep,
  onStepChange,
  kitItems,
  onKitItemsChange,
  selectedImages = [],
  onImagesChange = () => {}
}: KitFormProps) {
  // Convert between English and Portuguese types for compatibility
  const convertKitItemsToPT = (items: KitItem[]) => {
    return items.map(item => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      type: item.type === "single" ? "unico" : "variacao",
      quantidade: item.quantity,
      image: item.image,
    }));
  };

  const convertKitItemsFromPT = (items: any[]) => {
    return items.map(item => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      type: item.type === "unico" ? "single" : "variation",
      quantity: item.quantidade,
      image: item.image,
    }));
  };

  const convertStepToPT = (step: KitStep) => {
    switch (step) {
      case "info": return "info";
      case "products": return "produtos";
      default: return "info";
    }
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
            <p className="text-gray-600">Select products to include in this kit.</p>
            {/* Kit products selection will be implemented here */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <p className="text-gray-500">Kit product selection coming soon...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
