
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

// Import components
import { StepIndicator } from "@/components/products/create/StepIndicator";
import { ProductTypeSelector } from "./ProductTypeSelector";
import { ProductForm } from "@/components/products/create/ProductForm";
import { VariationForm } from "./VariationForm";
import { KitForm } from "./KitForm";
import { VariationDimensionsForm } from "./VariationDimensionsForm";
import { VariationTaxForm } from "./VariationTaxForm";
import { ProductLinkingSection } from "./ProductLinkingSection";
import { StockForm } from "@/components/products/create/StockForm";
import { DimensionsForm } from "@/components/products/create/DimensionsForm";
import { TaxForm } from "@/components/products/create/TaxForm";
import { NavigationButtons } from "@/components/products/create/NavigationButtons";
import { CloseConfirmationDialog } from "@/components/products/create/CloseConfirmationDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Import constants and hooks
import { stepsUnico, stepsVariacoes, stepsKit } from "@/components/products/create/constants";
import { useProductForm } from "@/hooks/useProductForm";
import { useProducts } from "@/hooks/useProducts";
import { ProductImageUploader } from "@/components/products/ProductImageUploader";
import { useAuth } from "@/hooks/useAuth";
import { validateEanChecksum } from "@/utils/eanChecksum";

export function CreateProductPage() {
  const navigate = useNavigate();
  const { organizationId } = useAuth();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showCreateAdConfirm, setShowCreateAdConfirm] = useState(false);
  const { products, loading: productsLoading } = useProducts();
  const [showVariationConfigErrors, setShowVariationConfigErrors] = useState(false);
  const [showVariationTaxErrors, setShowVariationTaxErrors] = useState(false);

  const {
    currentStep,
    productType,
    selectedImages,
    productSaved,
    variations,
    variationStep,
    variationTypes,
    kitStep,
    kitItems,
    formData,
    createLoading,
    errors,
    setSelectedImages,
    setVariations,
    setVariationStep,
    setVariationTypes,
    setKitStep,
    setKitItems,
    nextStep,
    backStep,
    handleInputChange,
    handleProductTypeChange,
    handleCreateProduct,
    getMaxSteps,
  } = useProductForm({
    onSuccess: () => navigate('/produtos')
  });

  const getCurrentSteps = () => {
    if (productType === "variation") return stepsVariacoes;
    if (productType === "kit") return stepsKit;
    return stepsUnico;
  };

  const handleSave = () => {
    void handleCreateProduct();
  };

  const handleConfirmCreateAd = () => {
    setShowCreateAdConfirm(false);
    void handleCreateProduct({
      onSuccess: () => navigate("/anuncios"),
    });
  };

  const handleCloseRequest = () => {
    setShowCloseDialog(true);
  };

  const handleConfirmClose = () => {
    navigate('/produtos');
  };

  // Variation navigation handlers
  const handleVariationNext = () => {
    if (variationStep === "types") {
      if (variationTypes.length > 0) {
        setVariationStep("options");
      }
    } else if (variationStep === "options") {
      const hasOptions = variationTypes.some(tipo => tipo.options.length > 0);
      if (hasOptions) {
        generateVariations();
        setVariationStep("configuration");
      }
    } else if (variationStep === "configuration") {
      // Validar campos obrigatórios das variações antes de avançar
      const nameInvalid = !formData.name || !String(formData.name).trim();
      const variationsInvalid = variations.some(v => {
        const skuInvalid = !v.sku || !String(v.sku).trim();
        const eanInvalid = !v.ean || !String(v.ean).trim();
        const stockInvalid = !v.stock || String(v.stock).trim() === "";
        const storageInvalid = !v.storage || String(v.storage).trim() === "";
        return skuInvalid || eanInvalid || stockInvalid || storageInvalid;
      });
      if (nameInvalid || variationsInvalid) {
        setShowVariationConfigErrors(true);
        return;
      }
      setShowVariationConfigErrors(false);
      nextStep();
    }
  };

  const handleVariationBack = () => {
    if (variationStep === "options") {
      setVariationStep("types");
    } else if (variationStep === "configuration") {
      setVariationStep("options");
    } else if (variationStep === "types") {
      backStep();
    }
  };

  const generateVariations = () => {
    const tiposComOpcoes = variationTypes.filter(tipo => tipo.options.length > 0);
    if (tiposComOpcoes.length === 0) return;

    const gerarCombinacoes = (arrays: string[][]): string[][] => {
      if (arrays.length === 0) return [[]];
      if (arrays.length === 1) return arrays[0].map(item => [item]);
      const [first, ...rest] = arrays;
      const restCombinations = gerarCombinacoes(rest);
      return first.flatMap(item => restCombinations.map(combination => [item, ...combination]));
    };

    const buildKey = (v: any) => {
      const parts: string[] = [];
      if (v.color) parts.push(`cor=${v.color}`);
      if (v.size) parts.push(`tamanho=${v.size}`);
      if (v.voltage) parts.push(`voltagem=${v.voltage}`);
      if (v.customType && v.customValue) parts.push(`${v.customType}=${v.customValue}`);
      return parts.join("|");
    };

    // Mapa das variações existentes para preservar dados ao voltar etapas
    const existingMap = new Map<string, any>();
    variations.forEach(v => existingMap.set(buildKey(v), v));

    const opcoesPorTipo = tiposComOpcoes.map(tipo => tipo.options);
    const combinacoes = gerarCombinacoes(opcoesPorTipo);

    const newVariations = combinacoes.map((combinacao, index) => {
      const variationName = combinacao.join(" - ");
      const base: any = {
        id: `var_${Date.now()}_${index}`,
        name: variationName,
        sku: "",
        ean: "",
        costPrice: "",
        sellPrice: "",
        stock: "",
        storage: "",
        height: "",
        width: "",
        length: "",
        weight: "",
        unit: "",
        origin: "",
        ncm: "",
        cest: "",
        images: [],
      };

      tiposComOpcoes.forEach((tipo, tipoIndex) => {
        const valor = combinacao[tipoIndex];
        switch (tipo.id) {
          case "cor":
            base.color = valor;
            break;
          case "tamanho":
            base.size = valor;
            break;
          case "voltagem":
            base.voltage = valor;
            break;
          default:
            base.customType = tipo.name;
            base.customValue = valor;
            break;
        }
      });

      const key = buildKey(base);
      const prev = existingMap.get(key);
      const merged = {
        ...base,
        sku: prev?.sku ?? base.sku,
        ean: prev?.ean ?? base.ean,
        costPrice: prev?.costPrice ?? base.costPrice,
        sellPrice: prev?.sellPrice ?? base.sellPrice,
        stock: prev?.stock ?? base.stock,
        storage: prev?.storage ?? base.storage,
        height: prev?.height ?? base.height,
        width: prev?.width ?? base.width,
        length: prev?.length ?? base.length,
        weight: prev?.weight ?? base.weight,
        unit: prev?.unit ?? base.unit,
        origin: prev?.origin ?? base.origin,
        ncm: prev?.ncm ?? base.ncm,
        cest: prev?.cest ?? base.cest,
        images: prev?.images ?? base.images,
        description: prev?.description ?? base.description,
      };

      return merged;
    });

    setVariations(newVariations);
  };

  const canProceedVariation = () => {
    if (variationStep === "types") {
      return variationTypes.length > 0;
    }
    if (variationStep === "options") {
      return variationTypes.some(tipo => tipo.options.length > 0);
    }
    if (variationStep === "configuration") {
      // Na configuração, exigir pelo menos uma variação e armazém definido
      return (
        variations.length > 0 &&
        variations.every(v => v.storage && v.storage !== "")
      );
    }
    return true;
  };

  const currentSteps = getCurrentSteps();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header with Close Button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cadastrar Novo Produto</h1>
            <p className="text-gray-600 text-lg">Siga os passos para registrar seu produto</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCloseRequest}>
            <X className="w-5 h-5 mr-2" />
            Close
          </Button>
        </div>

        {/* Stepper */}
        <StepIndicator steps={currentSteps} currentStep={currentStep} />

        {/* Step Content */}
        <Card className="shadow-lg">
          <CardContent className="p-10">
            {currentStep === 1 && (
              <ProductTypeSelector 
                productType={productType} 
                onProductTypeChange={handleProductTypeChange} 
              />
            )}

            {currentStep === 2 && productType === "single" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-semibold mb-6">Main Information</h3>
                  <ProductForm 
                    formData={formData} 
                    onInputChange={handleInputChange} 
                    includeSku={true} 
                    errors={errors}
                  />
                  <ProductImageUploader
                    organizationId={organizationId || "__pending_org__"}
                    onPendingFilesChange={setSelectedImages}
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && productType === "variation" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-semibold mb-6">Informações Básicas</h3>
                  <ProductForm 
                    formData={formData} 
                    onInputChange={handleInputChange} 
                    includeSku={false} 
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && productType === "kit" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-semibold mb-6">Informações do Kit</h3>
                  <ProductForm 
                    formData={formData} 
                    onInputChange={handleInputChange} 
                    includeSku={true} 
                  />
                  <ProductImageUploader
                    organizationId={organizationId || "__pending_org__"}
                    onPendingFilesChange={setSelectedImages}
                  />
                </div>
              </div>
            )}

            {currentStep === 3 && productType === "single" && (
              <StockForm formData={formData} onInputChange={handleInputChange} errors={errors} />
            )}

            {currentStep === 3 && productType === "variation" && (
              <VariationForm 
                variations={variations} 
                onVariationsChange={setVariations}
                currentStep={variationStep}
                onStepChange={setVariationStep}
                variationTypes={variationTypes}
                onVariationTypesChange={setVariationTypes}
                showErrors={showVariationConfigErrors}
              />
            )}

            {currentStep === 3 && productType === "kit" && (
              <KitForm 
                formData={formData} 
                onInputChange={handleInputChange}
                currentStep={kitStep}
                onStepChange={setKitStep}
                kitItems={kitItems}
                onKitItemsChange={setKitItems}
                selectedImages={selectedImages}
                onImagesChange={setSelectedImages}
                availableProducts={(products || [])}
                productsLoading={productsLoading}
                organizationId={organizationId || ""}
              />
            )}

            {currentStep === 4 && productType === "single" && (
              <DimensionsForm formData={formData} onInputChange={handleInputChange} errors={errors} />
            )}

            {currentStep === 4 && productType === "variation" && (
              <VariationDimensionsForm variations={variations} onVariationsChange={setVariations} showErrors />
            )}

            {currentStep === 5 && productType === "single" && (
              <TaxForm formData={formData} onInputChange={handleInputChange} errors={errors} />
            )}

            {currentStep === 5 && productType === "variation" && (
              <VariationTaxForm variations={variations} onVariationsChange={setVariations} showErrors={showVariationTaxErrors} />
            )}

            {((currentStep === 6 && productType !== "kit") || (currentStep === 4 && productType === "kit")) && (
              <ProductLinkingSection 
                productType={productType} 
                variations={variations}
                onCreateAdRequest={() => setShowCreateAdConfirm(true)}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <NavigationButtons
          currentStep={currentStep}
          maxSteps={getMaxSteps()}
          productType={productType as string}
          variationEtapa={variationStep}
          canProceedVariation={canProceedVariation}
          loading={createLoading}
          onNext={
            currentStep === 3 && productType === "variation"
              ? handleVariationNext
              : currentStep === 5 && productType === "variation"
                ? () => {
                    // Validar NCM e Origem em todas as variações antes de avançar
                    const invalid = variations.some((v) => {
                      const ncmOk = String(v.ncm || "").replace(/\D/g, "").length === 8;
                      const eanRaw = String(v.ean || (v as any).barcode || "").replace(/\D/g, "");
                      const eanOk =
                        eanRaw.length > 0 &&
                        eanRaw.length === 13 &&
                        validateEanChecksum(eanRaw);
                      const originOk = !!(v.origin && String(v.origin).trim());
                      return !ncmOk || !eanOk || !originOk;
                    });
                    if (invalid) {
                      setShowVariationTaxErrors(true);
                      return;
                    }
                    setShowVariationTaxErrors(false);
                    nextStep();
                  }
                : nextStep
          }
          onBack={currentStep === 3 && productType === "variation" ? handleVariationBack : backStep}
          kitEtapa={kitStep}
          onSave={handleSave}
          saveLabel="Salvar produto"
        />

        {/* Close Confirmation Dialog */}
        <CloseConfirmationDialog
          open={showCloseDialog}
          onOpenChange={setShowCloseDialog}
          onConfirm={handleConfirmClose}
        />

        <AlertDialog open={showCreateAdConfirm} onOpenChange={setShowCreateAdConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Criar anúncio</AlertDialogTitle>
              <AlertDialogDescription>
                Seu produto será salvado com todos os dados adicionados. Para criar anúncios, iremos te redirecionar para o módulo de anúncios, seu produto será salvo após confirmar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmCreateAd}
                className="bg-violet-700 text-white hover:bg-violet-800"
                disabled={createLoading}
              >
                {createLoading ? "Salvando..." : "Confirmar e continuar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
