/**
 * §1 SIZE EXCEPTION: ~169 LOC (limit 150).
 * Justified: handleCreateProduct must orchestrate 3 validation paths (single/variation/kit)
 * with inline error-state mutation (must stay in hook layer — React state). Further extraction
 * would require a context API for shared errors/state — not in scope of this Change Intent.
 *
 * Thin facade — composes domain hooks and returns the IDENTICAL 22-value shape
 * that CreateProductPage destructures. Do NOT change the return object keys or types.
 *
 * Business logic lives in:
 *   - useProductFormState      (wizard UI state)
 *   - useProductFormValidation (step validation)
 *   - useProductWizard         (nextStep / backStep / getMaxSteps)
 *   - useCreateProductMutation (all DB operations for create)
 *   - products.service.ts      (raw Supabase calls)
 *   - productPayload.ts        (payload building, pure)
 *   - skuHelpers.ts            (SKU generation, pure)
 *   - validateProductForm.ts   (step validation matrix, pure)
 */

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProductSync } from '@/hooks/useProductSync';
import { useProductFormState } from '@/hooks/products/useProductFormState';
import { useProductFormValidation } from '@/hooks/products/useProductFormValidation';
import { useProductWizard } from '@/hooks/products/useProductWizard';
import { useCreateProductMutation } from '@/hooks/products/useCreateProductMutation';
import { validateEanChecksum } from '@/utils/eanChecksum';
import type { ProductType } from '@/types/products';

interface UseProductFormProps {
  onSuccess?: () => void;
}

interface HandleCreateProductOptions {
  onSuccess?: () => void;
}

export function useProductForm({ onSuccess }: UseProductFormProps = {}) {
  const { toast } = useToast();
  const { user, organizationId } = useAuth();
  const { triggerSync } = useProductSync();
  const mutation = useCreateProductMutation();
  const createLoading = mutation.isPending;

  const state = useProductFormState();
  const {
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
  } = state;

  const { setFieldError, validateCurrentStep } = useProductFormValidation({
    currentStep,
    productType: productType as any,
    formData,
    setErrors,
  });

  const { nextStep, backStep, getMaxSteps } = useProductWizard({
    currentStep, setCurrentStep, productType, kitStep, setKitStep,
    kitItems, variations, validateCurrentStep,
  });

  const handleInputChange = (field: string, value: string) => {
    if (errors[field]) setFieldError(field, false);
    if (field === 'barcode') {
      setFormData((prev) => ({ ...prev, [field]: value.replace(/\D/g, '').slice(0, 13) }));
      return;
    }
    if (field === 'ncm') {
      setFormData((prev) => ({ ...prev, [field]: value.replace(/\D/g, '').slice(0, 8) }));
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleProductTypeChange = (type: ProductType) => {
    setProductType(type);
    resetForType(type);
  };

  const handleCreateProduct = async (options?: HandleCreateProductOptions) => {
    const isSingle = productType === 'single';
    const isVariation = productType === 'variation';
    const isKit = productType === 'kit';

    if (isSingle) {
      const eanDigits = String(formData.barcode || '').replace(/\D/g, '');
      const eanLenOk = eanDigits.length === 13;
      const eanChecksumOk = eanLenOk && validateEanChecksum(eanDigits);
      const ncmDigits = String(formData.ncm || '').replace(/\D/g, '');
      const ncmOk = ncmDigits.length === 8;
      setFieldError('name', !formData.name); setFieldError('sku', !formData.sku);
      setFieldError('costPrice', !formData.costPrice); setFieldError('stock', !formData.stock);
      setFieldError('warehouse', !formData.warehouse); setFieldError('height', !formData.height);
      setFieldError('width', !formData.width); setFieldError('length', !formData.length);
      setFieldError('weight', !formData.weight);
      setFieldError('barcode', !formData.barcode || !eanLenOk || !eanChecksumOk);
      setFieldError('ncm', !formData.ncm || !ncmOk); setFieldError('origin', !formData.origin);
      const invalid = !formData.name || !formData.sku || !formData.costPrice || !formData.stock
        || !formData.warehouse || !formData.height || !formData.width || !formData.length
        || !formData.weight || !formData.barcode || !formData.ncm || !formData.origin
        || !eanLenOk || !eanChecksumOk || !ncmOk;
      if (invalid) return;
    }
    if (isVariation) {
      setFieldError('name', !formData.name);
      if (!formData.name || !variations?.length) return;
    }
    if (isKit) {
      setFieldError('name', !formData.name); setFieldError('sku', !formData.sku);
      if (!formData.name || !formData.sku || !kitItems?.length) return;
    }

    if (!user?.id) {
      toast({ title: 'Erro', description: 'Sessão inválida. Faça login novamente.', variant: 'destructive' });
      return;
    }

    try {
      const result = await mutation.mutateAsync({
        productType: productType as string,
        formData,
        variations,
        kitItems,
        selectedImages,
        userId: user.id,
        organizationId: organizationId || null,
      });

      if (result.uploadWarning) {
        toast({ title: 'Produto criado com aviso', description: 'O produto foi salvo, mas houve erro no upload de algumas imagens.', variant: 'destructive' });
      }
      triggerSync();
      setProductSaved(true);
      setCurrentStep(currentStep + 1);
      (options?.onSuccess ?? onSuccess)?.();
    } catch (err: unknown) {
      console.error('Erro ao criar produto:', err);
      if (err instanceof Error && err.message === 'PERMISSION_DENIED') {
        toast({
          title: 'Permissão necessária',
          description: 'Você não tem permissão para criar produtos. Ajuste as permissões em Configurações > Usuários.',
          variant: 'destructive',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Erro ao salvar', description: msg || 'Erro desconhecido.', variant: 'destructive' });
    }
  };

  return {
    currentStep, productType, selectedImages, productSaved, variations,
    variationStep, variationTypes, kitStep, kitItems, formData, createLoading, errors,
    setSelectedImages, setVariations, setVariationStep, setVariationTypes, setKitStep, setKitItems,
    nextStep, backStep, handleInputChange, handleProductTypeChange, handleCreateProduct, getMaxSteps,
  };
}
