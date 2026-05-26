/**
 * Client-side validators for marketplace promotions.
 * These run before submitting to the edge function to catch obvious errors early.
 */

interface StandardDiscountInput {
  name: string;
  startDate: string;
  endDate: string;
  isShopee: boolean;
}

/**
 * Validates input for creating a standard discount campaign.
 * Returns a list of human-readable error messages (empty = valid).
 */
export function validateStandardDiscount(input: StandardDiscountInput): string[] {
  const errors: string[] = [];
  const { name, startDate, endDate, isShopee } = input;

  if (!name || name.trim().length < 2) {
    errors.push("O nome da promoção deve ter pelo menos 2 caracteres.");
  }
  const maxName = isShopee ? 150 : 60;
  if (name && name.trim().length > maxName) {
    errors.push(`O nome deve ter no máximo ${maxName} caracteres.`);
  }

  if (!startDate) {
    errors.push("Informe a data de início.");
    return errors;
  }
  if (!endDate) {
    errors.push("Informe a data de fim.");
    return errors;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();

  if (isNaN(start.getTime())) {
    errors.push("Data de início inválida.");
    return errors;
  }
  if (isNaN(end.getTime())) {
    errors.push("Data de fim inválida.");
    return errors;
  }

  if (end <= start) {
    errors.push("A data de fim deve ser posterior à data de início.");
  }

  const durationDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

  if (isShopee) {
    // Shopee: start must be at least 1 hour from now, max 180 days duration
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    if (start < oneHourFromNow) {
      errors.push("A data de início deve ser pelo menos 1 hora no futuro (Shopee).");
    }
    if (durationDays > 180) {
      errors.push("A duração máxima é de 180 dias (Shopee).");
    }
  } else {
    // Mercado Livre: max 14 days duration
    if (durationDays > 14) {
      errors.push("A duração máxima é de 14 dias (Mercado Livre).");
    }
    if (start <= now) {
      errors.push("A data de início deve ser no futuro.");
    }
  }

  return errors;
}

/** Known marketplace error codes and their human-readable translations. */
const ML_ERROR_TRANSLATIONS: Record<string, string> = {
  "not-allowed":             "Operação não permitida para este anúncio.",
  "invalid-discount":        "Percentual de desconto inválido (ML aceita entre 5% e 80%).",
  "item-not-eligible":       "Este anúncio não está elegível para a promoção.",
  "promotion-not-found":     "Promoção não encontrada no Mercado Livre.",
  "campaign-already-active": "Esta campanha já está ativa e não pode ser modificada.",
  "max-items-exceeded":      "Limite máximo de itens por campanha atingido.",
};

const SHOPEE_ERROR_TRANSLATIONS: Record<string, string> = {
  "error_param":                    "Parâmetro inválido enviado à Shopee.",
  "error_permission":               "Sem permissão para esta operação na Shopee.",
  "item_not_exist":                 "Anúncio não encontrado na Shopee.",
  "item_banned":                    "Este anúncio está banido na Shopee.",
  "exceed_limit":                   "Limite de itens por campanha excedido (Shopee).",
  "discount_exist":                 "Já existe um desconto ativo para este anúncio.",
  "item_not_eligible":              "Este anúncio não está elegível para desconto na Shopee.",
  "item_already_in_other_discount": "Este anúncio já participa de outro desconto ativo.",
  "over_stock_limit":               "Estoque dedicado excede o disponível para este anúncio.",
  "invalid_promotion_price":        "Preço promocional inválido — deve ser menor que o preço original.",
  "promotion_price_too_low":        "Preço promocional muito baixo (abaixo do mínimo Shopee).",
  "promotion_price_too_high":       "Preço promocional não pode ser maior que o preço original.",
  "invalid_discount_percentage":    "Percentual de desconto inválido (Shopee aceita 1%–99%).",
  "end_time_invalid":               "Data de término inválida para esta campanha.",
  "start_time_invalid":             "Data de início inválida — deve ser pelo menos 1 hora no futuro.",
  "discount_not_exist":             "Campanha de desconto não encontrada na Shopee.",
  "discount_status_not_allow":      "Operação não permitida para o status atual desta campanha.",
};

/**
 * Translate a marketplace error code into a user-friendly message.
 * Falls back to the raw error message if no translation is found.
 */
export function translateMarketplaceError(
  error: string,
  marketplaceKey: string,
): string {
  const table = marketplaceKey === "shopee" ? SHOPEE_ERROR_TRANSLATIONS : ML_ERROR_TRANSLATIONS;
  // Try direct match first, then partial match
  const direct = table[error.toLowerCase()];
  if (direct) return direct;
  const partial = Object.entries(table).find(([k]) => error.toLowerCase().includes(k));
  if (partial) return partial[1];
  return error;
}
