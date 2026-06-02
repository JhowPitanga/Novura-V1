/**
 * Bridge between validateStep (pure) and React error state.
 * Extracted from useProductForm.ts.
 */

import { validateStep, type ProductTypeStr } from '@/utils/products/validateProductForm';
import type { ProductFormData } from '@/types/products';

interface UseProductFormValidationArgs {
  currentStep: number;
  productType: ProductTypeStr;
  formData: ProductFormData;
  setErrors: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}

export function useProductFormValidation({
  currentStep,
  productType,
  formData,
  setErrors,
}: UseProductFormValidationArgs) {
  const setFieldError = (field: string, hasError: boolean) => {
    setErrors((prev) => ({ ...prev, [field]: hasError }));
  };

  const resetErrorsForStep = (step: number) => {
    const fieldsByStep: Record<number, string[]> = {
      2: ['name', 'sku'],
      3: ['costPrice', 'stock', 'warehouse'],
      4: ['height', 'width', 'length', 'weight'],
      5: ['barcode', 'ncm', 'origin'],
    };
    const fields = fieldsByStep[step] || [];
    setErrors((prev) => {
      const next = { ...prev };
      fields.forEach((f) => { next[f] = false; });
      return next;
    });
  };

  const validateCurrentStep = (): boolean => {
    const { valid, fieldErrors } = validateStep(currentStep, productType as ProductTypeStr, formData);
    setErrors((prev) => ({ ...prev, ...fieldErrors }));
    return valid;
  };

  return { setFieldError, resetErrorsForStep, validateCurrentStep };
}
