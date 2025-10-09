
import { useState } from "react";
import { ProductVariation, VariationType, VariationStep } from "@/types/products";
import { VariationTypeSelector } from "@/components/produtos/criar/VariationTypeSelector";
import { VariationOptionsForm } from "@/components/produtos/criar/VariationOptionsForm";
import { VariationDetailsForm } from "@/components/produtos/criar/VariationDetailsForm";
import { BulkVariationStockDrawer } from "@/components/produtos/criar/BulkVariationStockDrawer";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { VariationImageUpload } from "@/components/produtos/criar/VariationImageUpload";

interface VariationFormProps {
  variations: ProductVariation[];
  onVariationsChange: (variations: ProductVariation[]) => void;
  currentStep: VariationStep;
  onStepChange: (step: VariationStep) => void;
  variationTypes: VariationType[];
  onVariationTypesChange: (types: VariationType[]) => void;
  showErrors?: boolean;
  disableStock?: boolean;
}

export function VariationForm({
  variations,
  onVariationsChange,
  currentStep,
  onStepChange,
  variationTypes,
  onVariationTypesChange,
  showErrors = false,
  disableStock = false,
}: VariationFormProps) {
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  // Convert between English and Portuguese types for compatibility with existing components
  const convertVariationsToPT = (variations: ProductVariation[]) => {
    return variations.map(variation => ({
      id: variation.id,
      nome: variation.name,
      cor: variation.color,
      tamanho: variation.size,
      voltagem: variation.voltage,
      tipoPersonalizado: variation.customType,
      valorPersonalizado: variation.customValue,
      sku: variation.sku,
      ean: variation.ean,
      precoCusto: variation.costPrice,
      imagens: variation.images,
      altura: variation.height,
      largura: variation.width,
      comprimento: variation.length,
      peso: variation.weight,
      ncm: variation.ncm,
      cest: variation.cest,
      codigoBarras: variation.barcode,
      unidade: variation.unit,
      origem: variation.origin,
      estoque: variation.stock,
      armazem: variation.storage,
    }));
  };

  const convertVariationsFromPT = (variations: any[]) => {
    return variations.map(variation => ({
      id: variation.id,
      name: variation.nome,
      color: variation.cor,
      size: variation.tamanho,
      voltage: variation.voltagem,
      customType: variation.tipoPersonalizado,
      customValue: variation.valorPersonalizado,
      sku: variation.sku,
      ean: variation.ean,
      costPrice: variation.precoCusto,
      images: variation.imagens,
      height: variation.altura,
      width: variation.largura,
      length: variation.comprimento,
      weight: variation.peso,
      ncm: variation.ncm,
      cest: variation.cest,
      barcode: variation.codigoBarras,
      unit: variation.unidade,
      origin: variation.origem,
      stock: variation.estoque,
      storage: variation.armazem,
    }));
  };

  const convertTypesToPT = (types: VariationType[]) => {
    return types.map(type => ({
      id: type.id,
      nome: type.name,
      icon: type.icon,
      opcoes: type.options,
    }));
  };

  const convertTypesFromPT = (types: any[]) => {
    return types.map(type => ({
      id: type.id,
      name: type.nome,
      icon: type.icon,
      options: type.opcoes,
    }));
  };

  const handleVariationUpdate = (variacaoId: string, field: string, value: string) => {
    const updatedVariations = variations.map(variation => {
      if (variation.id === variacaoId) {
        return { ...variation, [field]: value };
      }
      return variation;
    });
    onVariationsChange(updatedVariations);
  };

  const handleImageUpload = (variacaoId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const allowed = ["image/jpeg", "image/png"]; // JPG, JPEG, PNG
    const validFile = files.find(f => allowed.includes(f.type) && f.size <= 2 * 1024 * 1024);
    if (!validFile) return;
    const updated = variations.map(v => (v.id === variacaoId ? { ...v, images: [validFile as any] } : v));
    onVariationsChange(updated);
  };

  const removeImage = (variacaoId: string, _index: number) => {
    const updated = variations.map(v => (v.id === variacaoId ? { ...v, images: [] } : v));
    onVariationsChange(updated);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Variações do Produto</h3>
        
        {currentStep === "types" && (
          <VariationTypeSelector
            tiposSelecionados={convertTypesToPT(variationTypes)}
            onTiposChange={(types) => onVariationTypesChange(convertTypesFromPT(types))}
          />
        )}

        {currentStep === "options" && (
          <VariationOptionsForm
            tiposVariacao={convertTypesToPT(variationTypes)}
            onTiposChange={(types) => onVariationTypesChange(convertTypesFromPT(types))}
            onVariacoesGenerate={() => {
              // Generate variations logic would go here
              console.log("Generate variations");
            }}
          />
        )}

        {currentStep === "configuration" && (
          <div className="space-y-6">
            {/* Aviso de controle de estoque por variação */}
            <div className="rounded-md border border-blue-200 bg-blue-50 text-blue-900 p-4">
              <p className="text-sm">
                Para produtos com variações, o controle de estoque é feito individualmente por cada variação.
                Ao salvar, cada variação será criada como um produto único com seu próprio estoque.
              </p>
            </div>
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                onClick={() => setBulkDrawerOpen(true)}
                className="flex items-center gap-2"
              >
                <Package className="h-4 w-4" />
                Atualização em Massa
              </Button>
            </div>
            
            {variations.map((variation) => (
              <div key={variation.id} className="border rounded-lg p-4 mb-4">
                <h4 className="font-medium mb-4">{variation.name}</h4>
                {/* Slot de foto de capa abaixo do nome da variação */}
                <VariationImageUpload
                  variacao={convertVariationsToPT([variation])[0]}
                  onImageUpload={handleImageUpload}
                  onRemoveImage={removeImage}
                />
                <VariationDetailsForm
                  variacao={convertVariationsToPT([variation])[0]}
                  onUpdate={(variacaoId, field, value) => {
                    // Convert field names back to English
                    const fieldMap: Record<string, string> = {
                      sku: 'sku',
                      ean: 'ean',
                      precoCusto: 'costPrice',
                      estoque: 'stock',
                      armazem: 'storage'
                    };
                    const englishField = fieldMap[field] || field;
                    handleVariationUpdate(variacaoId, englishField, value);
                  }}
                  onImageUpload={handleImageUpload}
                  showErrors={showErrors}
                  disableStock={disableStock}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      
      <BulkVariationStockDrawer
        open={bulkDrawerOpen}
        onOpenChange={setBulkDrawerOpen}
        variacoes={convertVariationsToPT(variations)}
        onUpdate={(updatedVariacoes) => onVariationsChange(convertVariationsFromPT(updatedVariacoes))}
      />
    </div>
  );
}
