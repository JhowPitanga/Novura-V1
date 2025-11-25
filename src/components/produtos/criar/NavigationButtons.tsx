
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VariationStep, KitStep } from "@/types/products";

interface NavigationButtonsProps {
  currentStep: number;
  maxSteps: number;
  productType: string;
  variationEtapa?: VariationStep;
  canProceedVariation?: () => boolean;
  canProceedExternal?: () => boolean;
  // Adicionado: lógica externa para fluxo de empresa
  canProceedCompany?: () => boolean;
  loading?: boolean;
  onNext: () => void;
  onBack: () => void;
  onSave: () => void;
  kitEtapa?: KitStep;
  saveLabel?: string;
}

export function NavigationButtons({ 
  currentStep, 
  maxSteps, 
  productType, 
  variationEtapa,
  canProceedVariation,
  canProceedExternal,
  canProceedCompany,
  loading = false,
  onNext, 
  onBack,
  onSave,
  kitEtapa,
  saveLabel
}: NavigationButtonsProps) {
  // Check if we can proceed based on current step and product type
  const canProceed = () => {
    if (currentStep === 1 && !productType) return false;
    
    // For variation products in step 3, use the specific variation logic
    if (currentStep === 3 && productType === "variation" && canProceedVariation) {
      return canProceedVariation();
    }
    
    // For kit products in step 3, always allow navigation
    if (currentStep === 3 && productType === "kit") {
      return true;
    }

    // Para fluxo de empresa, permitir lógica externa de validação
    if (productType === "company" && typeof canProceedCompany === "function") {
      return canProceedCompany();
    }
    if (typeof canProceedExternal === "function") {
      return canProceedExternal();
    }
    
    return true;
  };

  // Determine if we should show back button
  const shouldShowBackButton = () => {
    // Always show back button for step 3 variations, even in the first sub-step
    if (currentStep === 3 && productType === "variation") {
      return true;
    }
    
    // For kit products in step 3 products sub-step, show back button
    if (currentStep === 3 && productType === "kit" && kitEtapa === "products") {
      return true;
    }

    // For company type, show back button if not on first step
    if (productType === "company") {
      return currentStep > 1;
    }
    
    return currentStep > 1;
  };

  // Get the next button text based on current state
  const getNextButtonText = () => {
    if (currentStep === 3 && productType === "variation") {
      if (variationEtapa === "types") return "Avançar";
      if (variationEtapa === "options") return "Gerar variações";
      if (variationEtapa === "configuration") return "Avançar";
    }
    
    if (currentStep === 3 && productType === "kit") {
      if (kitEtapa === "info") return "Avançar";
      if (kitEtapa === "products") return "Avançar";
    }
    
    return "Avançar";
  };

  return (
    <div className="flex justify-end items-center pt-4">
      {/* Back Button */}
      {shouldShowBackButton() && (
        <Button 
          onClick={onBack} 
          variant="outline"
          size="lg"
          className="mr-3"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Voltar
        </Button>
      )}

      {/* Next/Save Buttons */}
      {((currentStep < 5 && productType !== "kit" && productType !== "company") || 
        (currentStep < 4 && productType === "kit") || 
        (currentStep < 4 && productType === "company")) ? (
        <Button 
          onClick={onNext} 
          className="bg-novura-primary hover:bg-novura-primary/90"
          size="lg"
          disabled={!canProceed() || loading}
        >
          {getNextButtonText()}
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      ) : (currentStep === 5 && productType !== "kit" && productType !== "company") ? (
        <Button 
          onClick={onNext} 
          className="bg-novura-primary hover:bg-novura-primary/90"
          size="lg"
          disabled={loading}
        >
          <Check className="w-5 h-5 mr-2" />
          {loading ? "Salvando..." : "Salvar e continuar"}
        </Button>
      ) : productType === "company" && currentStep === 4 ? (
        <Button 
          onClick={onNext} 
          className="bg-novura-primary hover:bg-novura-primary/90"
          size="lg"
          disabled={loading}
        >
          <Check className="w-5 h-5 mr-2" />
          {loading ? "Salvando..." : (saveLabel || "Salvar Empresa")}
        </Button>
      ) : productType === "kit" && currentStep === 4 ? (
        <Button 
          onClick={onNext}
          className="bg-novura-primary hover:bg-novura-primary/90"
          size="lg"
          disabled={loading}
        >
          <Check className="w-5 h-5 mr-2" />
          {loading ? "Salvando..." : "Salvar produto"}
        </Button>
      ) : (
        <Button 
          onClick={onSave} 
          className="bg-novura-primary hover:bg-novura-primary/90"
          size="lg"
        >
          <Check className="w-5 h-5 mr-2" />
          Fazer depois
        </Button>
      )}
    </div>
  );
}
