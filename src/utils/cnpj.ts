/**
 * CNPJ validation and situação-block classification utilities.
 * Pure synchronous functions — no side effects.
 * Logic preserved byte-for-byte from src/pages/NewCompany.tsx.
 */

/** Returns true if the CNPJ passes the DV (check-digit) algorithm. */
export const isValidCNPJ = (cnpj: string): boolean => {
  const digits = (cnpj || '').replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDV = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(digits[i], 10) * weights[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const dv1 = calcDV(12);
  if (dv1 !== parseInt(digits[12], 10)) return false;
  const dv2 = calcDV(13);
  if (dv2 !== parseInt(digits[13], 10)) return false;
  return true;
};

/** Strips diacritics, trims, and uppercases a situação string. */
export const normalizeSituacao = (s: string): string => {
  const noAccents = String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return noAccents.trim().toUpperCase();
};

/**
 * Returns a blocking error message if the CNPJ situação prevents NF-e,
 * or null if the situation is acceptable.
 * Rules are evaluated in order — first match wins.
 */
export const getCnpjBlockInfo = (situacao: string): string | null => {
  const norm = normalizeSituacao(situacao);
  const rules: { re: RegExp; msg: string }[] = [
    {
      re: /BAIXAD[OA]/,
      msg: 'Empresa foi encerrada. Um CNPJ baixado não pode ser reativado.',
    },
    {
      re: /\bNULA\b/,
      msg: 'CNPJ inválido ou anulado pela Receita Federal, geralmente por fraude ou duplicidade.',
    },
    {
      re: /SUSPENS[OA]/,
      msg: 'Empresa com pendências cadastrais/fiscais. É necessário regularizar para voltar a operar.',
    },
    {
      re: /INAPT[OA]/,
      msg: 'CNPJ declarado inapto por omissão prolongada de declarações ou irregularidades.',
    },
    {
      re: /ATIVA.*NAO.*REGULAR/,
      msg: 'CNPJ ATIVA NÃO REGULAR. Bloqueio total até regularização cadastral.',
    },
    {
      re: /PROCESSO.*BAIXA/,
      msg: 'CNPJ EM PROCESSO DE BAIXA. Bloqueio total para emissão de NF-e.',
    },
    {
      re: /SITUACAO.*ESPECIAL/,
      msg: 'CNPJ em SITUAÇÃO ESPECIAL. Bloqueio total até normalização.',
    },
  ];
  for (const r of rules) {
    if (r.re.test(norm)) return r.msg;
  }
  return null;
};
