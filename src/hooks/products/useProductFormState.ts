/**
 * Owns the wizard UI state for the product create flow.
 * Extracted from useProductForm.ts.
 * All 9 useState values + their setters live here.
 */

import { useState } from 'react';
import type { ProductFormData, ProductVariation, VariationType, KitItem, ProductType, VariationStep, KitStep } from '@/types/products';

const INITIAL_FORM_DATA: ProductFormData = {
  type: '',
  name: '',
  sku: '',
  category: '',
  brand: '',
  description: '',
  costPrice: '',
  sellPrice: '',
  stock: '',
  warehouse: '',
  height: '',
  width: '',
  length: '',
  weight: '',
  unitType: '',
  barcode: '',
  ncm: '',
  cest: '',
  origin: '',
};

export function useProductFormState() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productType, setProductType] = useState<ProductType | ''>('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [productSaved, setProductSaved] = useState(false);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [variationStep, setVariationStep] = useState<VariationStep>('types');
  const [variationTypes, setVariationTypes] = useState<VariationType[]>([]);
  const [kitStep, setKitStep] = useState<KitStep>('info');
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  const [formData, setFormData] = useState<ProductFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const resetForType = (type: ProductType) => {
    setProductSaved(false);
    setErrors({});
    setSelectedImages([]);
    setVariations([]);
    setVariationStep('types');
    setVariationTypes([]);
    setKitStep('info');
    setKitItems([]);
    setFormData({ ...INITIAL_FORM_DATA, type });
  };

  return {
    currentStep, setCurrentStep,
    productType, setProductType,
    selectedImages, setSelectedImages,
    productSaved, setProductSaved,
    variations, setVariations,
    variationStep, setVariationStep,
    variationTypes, setVariationTypes,
    kitStep, setKitStep,
    kitItems, setKitItems,
    formData, setFormData,
    errors, setErrors,
    resetForType,
  };
}
