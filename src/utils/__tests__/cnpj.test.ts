/**
 * Characterization tests for CNPJ utilities.
 * These tests pin the EXACT current behavior (including quirks) of the
 * functions inlined in src/pages/NewCompany.tsx before extraction.
 * Do NOT change expected values without understanding the invariant being pinned.
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────
// Inline copies from NewCompany.tsx — replaced with
// imports after commit 3 (refactor(company): extract CNPJ utils)
// ─────────────────────────────────────────────────

const isValidCNPJ = (cnpj: string): boolean => {
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

const normalizeSituacao = (s: string): string => {
  const noAccents = String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return noAccents.trim().toUpperCase();
};

const getCnpjBlockInfo = (situacao: string): string | null => {
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

// ─────────────────────────────────────────────────

describe('isValidCNPJ', () => {
  it('accepts a valid CNPJ 11.222.333/0001-81', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
  });

  it('accepts formatted input (strips non-digits)', () => {
    // A real valid CNPJ: Petrobras 33.000.167/0001-01
    expect(isValidCNPJ('33.000.167/0001-01')).toBe(true);
  });

  it('accepts unformatted valid CNPJ', () => {
    expect(isValidCNPJ('33000167000101')).toBe(true);
  });

  it('rejects CNPJ with all identical digits 00.000.000/0000-00', () => {
    expect(isValidCNPJ('00.000.000/0000-00')).toBe(false);
  });

  it('rejects all-identical digits pattern (11.111.111/1111-11)', () => {
    expect(isValidCNPJ('11111111111111')).toBe(false);
  });

  it('rejects a 13-digit string', () => {
    expect(isValidCNPJ('1234567890123')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCNPJ('')).toBe(false);
  });

  it('rejects CNPJ with wrong first DV', () => {
    // Flip the second-to-last digit of a valid CNPJ
    expect(isValidCNPJ('33000167000109')).toBe(false);
  });

  it('rejects CNPJ with correct DV1 but wrong DV2', () => {
    // Flip only the last digit
    expect(isValidCNPJ('33000167000100')).toBe(false);
  });
});

// ─────────────────────────────────────────────────

describe('normalizeSituacao', () => {
  it('"Ativa" → "ATIVA"', () => {
    expect(normalizeSituacao('Ativa')).toBe('ATIVA');
  });

  it('strips diacritics and uppercases — "Baixadó" → "BAIXADO"', () => {
    expect(normalizeSituacao('Baixadó')).toBe('BAIXADO');
  });

  it('strips complex diacritics — "SITUAÇÃO ESPECIAL" → "SITUACAO ESPECIAL"', () => {
    expect(normalizeSituacao('SITUAÇÃO ESPECIAL')).toBe('SITUACAO ESPECIAL');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSituacao('  ATIVA  ')).toBe('ATIVA');
  });

  it('handles empty string', () => {
    expect(normalizeSituacao('')).toBe('');
  });
});

// ─────────────────────────────────────────────────

describe('getCnpjBlockInfo — 7 ordered rules', () => {
  it('matches BAIXADO (masculine)', () => {
    expect(getCnpjBlockInfo('BAIXADO')).toBe(
      'Empresa foi encerrada. Um CNPJ baixado não pode ser reativado.',
    );
  });

  it('matches BAIXADA (feminine)', () => {
    expect(getCnpjBlockInfo('Baixada')).toBe(
      'Empresa foi encerrada. Um CNPJ baixado não pode ser reativado.',
    );
  });

  it('matches NULA with word boundary', () => {
    expect(getCnpjBlockInfo('NULA')).toBe(
      'CNPJ inválido ou anulado pela Receita Federal, geralmente por fraude ou duplicidade.',
    );
  });

  it('does NOT match ANULADA as NULA (word boundary)', () => {
    // "ANULADA" contains "NULA" but not as a whole word → should not match rule 2
    // However NULA matches as word only if surrounded by word boundaries; "ANULADA" → "ANULADA"
    // norm('ANULADA') = 'ANULADA', test /\bNULA\b/ on 'ANULADA' → no match (NULA is interior)
    expect(getCnpjBlockInfo('ANULADA')).toBeNull();
  });

  it('matches SUSPENSO', () => {
    expect(getCnpjBlockInfo('SUSPENSO')).toBe(
      'Empresa com pendências cadastrais/fiscais. É necessário regularizar para voltar a operar.',
    );
  });

  it('matches SUSPENSA', () => {
    expect(getCnpjBlockInfo('Suspensa')).toBe(
      'Empresa com pendências cadastrais/fiscais. É necessário regularizar para voltar a operar.',
    );
  });

  it('matches INAPTO', () => {
    expect(getCnpjBlockInfo('INAPTO')).toBe(
      'CNPJ declarado inapto por omissão prolongada de declarações ou irregularidades.',
    );
  });

  it('matches INAPTA', () => {
    expect(getCnpjBlockInfo('INAPTA')).toBe(
      'CNPJ declarado inapto por omissão prolongada de declarações ou irregularidades.',
    );
  });

  it('matches ATIVA NAO REGULAR after NFD strip', () => {
    // Input with accent: "Ativa Não Regular"
    expect(getCnpjBlockInfo('Ativa Não Regular')).toBe(
      'CNPJ ATIVA NÃO REGULAR. Bloqueio total até regularização cadastral.',
    );
  });

  it('matches PROCESSO DE BAIXA', () => {
    expect(getCnpjBlockInfo('Processo de Baixa')).toBe(
      'CNPJ EM PROCESSO DE BAIXA. Bloqueio total para emissão de NF-e.',
    );
  });

  it('matches SITUACAO ESPECIAL after NFD strip of SITUAÇÃO ESPECIAL', () => {
    expect(getCnpjBlockInfo('Situação Especial')).toBe(
      'CNPJ em SITUAÇÃO ESPECIAL. Bloqueio total até normalização.',
    );
  });

  it('returns null for "ATIVA"', () => {
    expect(getCnpjBlockInfo('ATIVA')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getCnpjBlockInfo('')).toBeNull();
  });

  it('first-match-wins: BAIXADO matches rule 1 before rule 6 (PROCESSO DE BAIXA)', () => {
    // "BAIXADO" should hit rule 1, not rule 6 (which needs PROCESSO.*BAIXA)
    const result = getCnpjBlockInfo('BAIXADO');
    expect(result).toBe(
      'Empresa foi encerrada. Um CNPJ baixado não pode ser reativado.',
    );
  });
});
