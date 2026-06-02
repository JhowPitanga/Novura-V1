/**
 * Step validation matrix for the product create wizard.
 * Extracted verbatim from useProductForm.ts validateCurrentStep + getMaxSteps.
 *
 * Pure function: receives state, returns { valid, fieldErrors } — caller applies errors.
 * No React state, no supabase — testable without mocks.
 *
 * QUIRKS (do not "fix"):
 *   - variation step 2: name required, SKU NOT required (sku error cleared).
 *   - single step 5: EAN must be exactly 13 digits AND pass checksum; NCM must be 8 digits.
 *   - kit: only name+sku required; returns true for all other steps.
 *   - step 3 skipped for variation type.
 *   - getMaxSteps: kit→4, all others→6.
 */

import { validateEanChecksum } from '@/utils/eanChecksum';

export type ProductTypeStr = 'single' | 'variation' | 'kit' | '';

export interface StepErrors {
  [field: string]: boolean;
}

export interface ValidationResult {
  valid: boolean;
  fieldErrors: StepErrors;
}

interface FormSnapshot {
  name?: string;
  sku?: string;
  costPrice?: string;
  stock?: string;
  warehouse?: string;
  height?: string;
  width?: string;
  length?: string;
  weight?: string;
  barcode?: string;
  ncm?: string;
  origin?: string;
}

export function validateStep(
  step: number,
  productType: ProductTypeStr,
  formData: FormSnapshot
): ValidationResult {
  const errors: StepErrors = {};

  if (productType === 'kit') {
    if (step === 2) {
      errors.name = !formData.name?.trim();
      errors.sku = !formData.sku?.trim();
      return { valid: !(errors.name || errors.sku), fieldErrors: errors };
    }
    return { valid: true, fieldErrors: errors };
  }

  if (step === 2) {
    if (productType === 'variation') {
      errors.name = !formData.name?.trim();
      errors.sku = false; // SKU is not required for variation
      return { valid: !errors.name, fieldErrors: errors };
    }
    errors.name = !formData.name?.trim();
    errors.sku = !formData.sku?.trim();
    return { valid: !(errors.name || errors.sku), fieldErrors: errors };
  }

  if (step === 3 && productType !== 'variation') {
    errors.costPrice = !formData.costPrice?.trim();
    errors.stock = !formData.stock?.trim();
    errors.warehouse = !formData.warehouse?.trim();
    return {
      valid: !(errors.costPrice || errors.stock || errors.warehouse),
      fieldErrors: errors,
    };
  }

  if (step === 4 && productType !== 'variation') {
    errors.height = !formData.height?.trim();
    errors.width = !formData.width?.trim();
    errors.length = !formData.length?.trim();
    errors.weight = !formData.weight?.trim();
    return {
      valid: !(errors.height || errors.width || errors.length || errors.weight),
      fieldErrors: errors,
    };
  }

  if (step === 5) {
    if (productType === 'single') {
      const eanDigits = String(formData.barcode || '').replace(/\D/g, '');
      const eanOk =
        eanDigits.length > 0 &&
        eanDigits.length === 13 &&
        validateEanChecksum(eanDigits);
      const ncmDigits = String(formData.ncm || '').replace(/\D/g, '');
      const ncmOk = ncmDigits.length === 8;
      errors.barcode = !formData.barcode?.trim() || !eanOk;
      errors.ncm = !formData.ncm?.trim() || !ncmOk;
      errors.origin = !formData.origin?.trim();
      return {
        valid: !(errors.barcode || errors.ncm || errors.origin),
        fieldErrors: errors,
      };
    }
    return { valid: true, fieldErrors: errors };
  }

  return { valid: true, fieldErrors: errors };
}

export function getMaxSteps(productType: ProductTypeStr): number {
  return productType === 'kit' ? 4 : 6;
}
