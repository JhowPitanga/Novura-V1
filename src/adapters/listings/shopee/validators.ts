import type { NormalizedDraft, ValidationResult } from '../types';
import { parsePriceToNumber } from '../shared/priceParse';

/** Validates a Shopee draft before publish. Returns the first error found. */
export function validateShopeeDraftForPublish(draft: NormalizedDraft): ValidationResult {
  const priceNum = parsePriceToNumber(draft.price);
  const hasVariations = (draft.variations || []).length > 0;

  if (!draft.title || !draft.title.trim()) {
    return { valid: false, errorStepId: 2, errorField: 'Título', errorMessage: 'Informe o título do anúncio.' };
  }
  if (!draft.categoryId) {
    return { valid: false, errorStepId: 2, errorField: 'Categoria', errorMessage: 'Selecione a categoria.' };
  }
  if (!draft.description || !draft.description.trim()) {
    return { valid: false, errorStepId: 3, errorField: 'Descrição', errorMessage: 'Preencha a descrição.' };
  }

  // Images must be URLs (already uploaded)
  const urlPics = (draft.pictures as string[]).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
  if (urlPics.length === 0) {
    return { valid: false, errorStepId: 3, errorField: 'Imagens', errorMessage: 'Adicione ao menos uma foto.' };
  }

  if (hasVariations) {
    for (const v of draft.variations) {
      if (!Array.isArray(v.attribute_combinations) || v.attribute_combinations.length === 0) {
        return { valid: false, errorStepId: 4, errorField: 'Variações', errorMessage: 'Cada variação precisa de atributos.' };
      }
    }
    if (!priceNum) {
      return { valid: false, errorStepId: 6, errorField: 'Preço', errorMessage: 'Informe o preço para variações.' };
    }
  } else {
    if (!priceNum) {
      return { valid: false, errorStepId: 6, errorField: 'Preço', errorMessage: 'Informe o preço.' };
    }
  }

  return { valid: true };
}
