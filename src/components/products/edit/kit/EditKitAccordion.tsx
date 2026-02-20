
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductForm } from "@/components/produtos/criar/ProductForm";
import { ImageUpload } from "@/components/produtos/criar/ImageUpload";
import { KitForm } from "@/components/produtos/criar/KitForm";
import { Button } from "@/components/ui/button";

interface EditKitAccordionProps {
  formData: any;
  onInputChange: (field: string, value: string) => void;
  selectedImages: File[];
  onImagesChange: (images: File[]) => void;
  kitEtapa: "info" | "produtos";
  onKitEtapaChange: (etapa: "info" | "produtos") => void;
  kitItems: any[];
  onKitItemsChange: (items: any[]) => void;
}

export function EditKitAccordion({
  formData,
  onInputChange,
  selectedImages,
  onImagesChange,
  kitEtapa,
  onKitEtapaChange,
  kitItems,
  onKitItemsChange
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
                etapaAtual={kitEtapa}
                onEtapaChange={onKitEtapaChange}
                kitItems={kitItems}
                onKitItemsChange={onKitItemsChange}
                editMode={true}
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
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">Funcionalidade de vínculo em desenvolvimento</p>
                <Button variant="outline" disabled>
                  Gerenciar Vínculos
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
