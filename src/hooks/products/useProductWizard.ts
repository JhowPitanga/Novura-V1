/**
 * Wizard navigation (nextStep / backStep / getMaxSteps).
 * Extracted from useProductForm.ts.
 * Pure navigation logic: no supabase calls, no data fetching.
 */

import { getMaxSteps } from '@/utils/products/validateProductForm';
import type { ProductType, KitStep, KitItem, ProductVariation } from '@/types/products';

interface UseProductWizardArgs {
  currentStep: number;
  setCurrentStep: (step: number) => void;
  productType: ProductType | '';
  kitStep: KitStep;
  setKitStep: (s: KitStep) => void;
  kitItems: KitItem[];
  variations: ProductVariation[];
  validateCurrentStep: () => boolean;
}

export function useProductWizard({
  currentStep,
  setCurrentStep,
  productType,
  kitStep,
  setKitStep,
  kitItems,
  variations,
  validateCurrentStep,
}: UseProductWizardArgs) {
  const maxSteps = getMaxSteps(productType as any);

  const nextStep = async () => {
    if (currentStep >= maxSteps) return;

    if (currentStep === 1 && !productType) return;

    if (productType === 'kit' && currentStep === 3) {
      if (kitStep === 'products' && (!kitItems || kitItems.length === 0)) return;
    }

    if (productType === 'variation') {
      if (currentStep === 3 && (!variations || variations.length === 0)) return;
    }

    const isValid = validateCurrentStep();
    if (!isValid) return;

    if (productType === 'kit' && currentStep === 2) {
      setCurrentStep(currentStep + 1);
      setKitStep('products');
      return;
    }

    if (productType === 'kit' && currentStep === 3) {
      if (kitStep === 'info') {
        setKitStep('products');
      } else if (kitStep === 'products') {
        setCurrentStep(currentStep + 1);
      }
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const backStep = () => {
    if (productType === 'kit' && currentStep === 3 && kitStep === 'products') {
      setKitStep('info');
    } else if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return { nextStep, backStep, getMaxSteps: () => maxSteps };
}
