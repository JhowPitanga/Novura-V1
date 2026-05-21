import type { NormalizedDraft, ValidationResult } from '../types';
import { parsePriceToNumber } from '../shared/priceParse';

/** Validates a Mercado Livre draft before publish. Returns the first error found. */
export function validateMLDraftForPublish(draft: NormalizedDraft): ValidationResult {
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

  if (hasVariations) {
    const invalid = draft.variations.find(
      (v) =>
        !Array.isArray(v.attribute_combinations) ||
        v.attribute_combinations.length === 0 ||
        typeof v.available_quantity !== 'number' ||
        v.available_quantity <= 0 ||
        !(Array.isArray(v.pictureFiles) && v.pictureFiles.length > 0),
    );
    if (invalid) {
      return {
        valid: false,
        errorStepId: 4,
        errorField: 'Variações',
        errorMessage: 'Cada variação precisa de atributos, quantidade e ao menos uma foto.',
      };
    }
    if (!priceNum) {
      return { valid: false, errorStepId: 6, errorField: 'Preço', errorMessage: 'Informe o preço para variações.' };
    }
    if (Array.isArray(draft.variationRequiredIds) && draft.variationRequiredIds.length > 0) {
      const missingAny = draft.variations.find((v) => {
        const idsSet = new Set(
          (v.attribute_combinations || []).map((c) => String(c?.id || '').toUpperCase()),
        );
        return (draft.variationRequiredIds || []).some((rid) => !idsSet.has(String(rid || '').toUpperCase()));
      });
      if (missingAny) {
        return {
          valid: false,
          errorStepId: 4,
          errorField: 'Atributos de variação',
          errorMessage: 'Preencha todos os atributos obrigatórios nas variações.',
        };
      }
    }
  }

  if (!priceNum && !hasVariations) {
    return { valid: false, errorStepId: 6, errorField: 'Preço', errorMessage: 'Informe o preço.' };
  }
  if (!draft.listingTypeId) {
    return { valid: false, errorStepId: 6, errorField: 'Tipo de publicação', errorMessage: 'Selecione o tipo de publicação.' };
  }

  // ME2 dimensions required
  const mode = String(draft.shipping?.mode || '').toLowerCase();
  const isMe2 = mode === 'me2';
  if (isMe2) {
    const dims = draft.shipping?.dimensions || {};
    const h = Math.round(Number(dims?.height));
    const l = Math.round(Number(dims?.length));
    const w = Math.round(Number(dims?.width));
    const g = Math.round(Number(draft.shipping?.weight || dims?.weight || 0));
    if (!(h > 0 && l > 0 && w > 0 && g > 0)) {
      return {
        valid: false,
        errorStepId: 7,
        errorField: 'Dimensões do pacote',
        errorMessage: 'Informe altura, comprimento, largura e peso do pacote em inteiros (cm/g).',
      };
    }
  }

  return { valid: true };
}
