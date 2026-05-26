
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductForm } from "@/components/products/create/ProductForm";
import { ImageUpload } from "@/components/products/create/ImageUpload";
import { KitForm } from "@/components/products/create/KitForm";
import { ProductAdLinker } from "@/components/products/ProductAdLinker";

interface EditKitAccordionProps {
  productId: string | null;
  formData: any;
  onInputChange: (field: string, value: string) => void;
  selectedImages: File[];
  onImagesChange: (images: File[]) => void;
  kitEtapa: "info" | "produtos";
  onKitEtapaChange: (etapa: "info" | "produtos") => void;
  kitItems: any[];
  onKitItemsChange: (items: any[]) => void;
  availableProducts: any[];
  productsLoading: boolean;
  organizationId: string;
}

export function EditKitAccordion({
  productId,
  formData,
  onInputChange,
  selectedImages,
  onImagesChange,
  kitEtapa,
  onKitEtapaChange,
  kitItems,
  onKitItemsChange,
  availableProducts,
  productsLoading,
  organizationId,
}: EditKitAccordionProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <Accordion type="single" collapsible defaultValue="informacoes-basicas" className="w-full">
          {/* Step 1 - Basic Information */}
          <AccordionItem value="informacoes-basicas">
            <AccordionTrigger>
              <div className="flex items-center space-x-2">
                <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">1</span>
                <span className="font-medium">Informações Básicas</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ProductForm 
                formData={formData} 
                onInputChange={onInputChange} 
                includeSku={true} 
              />
            </AccordionContent>
          </AccordionItem>

          {/* Step 2 - Photos */}
          <AccordionItem value="fotos">
            <AccordionTrigger>
              <div className="flex items-center space-x-2">
                <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">2</span>
                <span className="font-medium">Fotos do Kit</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ImageUpload 
                selectedImages={selectedImages} 
                onImagesChange={onImagesChange} 
              />
            </AccordionContent>
          </AccordionItem>

          {/* Step 3 - Kit Products */}
          <AccordionItem value="produtos-kit">
            <AccordionTrigger>
              <div className="flex items-center space-x-2">
                <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">3</span>
                <span className="font-medium">Produtos do Kit</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <KitForm 
                formData={formData} 
                onInputChange={onInputChange}
                currentStep="products"
                onStepChange={() => onKitEtapaChange("produtos")}
                kitItems={kitItems}
                onKitItemsChange={onKitItemsChange}
                selectedImages={selectedImages}
                onImagesChange={onImagesChange}
                availableProducts={availableProducts}
                productsLoading={productsLoading}
                organizationId={organizationId}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Step 4 - Link Ads */}
          <AccordionItem value="vinculos">
            <AccordionTrigger>
              <div className="flex items-center space-x-2">
                <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">4</span>
                <span className="font-medium">Vincular Anúncios</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ProductAdLinker productId={productId} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
