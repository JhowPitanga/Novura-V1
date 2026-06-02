/**
 * Characterization tests for company data formatting utilities.
 * These tests pin the EXACT current behavior (including the matríZ latent bug)
 * of the functions inlined in src/pages/NewCompany.tsx before extraction.
 *
 * matríZ BUG NOTE (PRESERVED — DO NOT FIX HERE):
 *   normalizeTipoEmpresa lowercases the input first, so 'Matríz'.toLowerCase() === 'matríz',
 *   which does NOT match the dead branch `s === 'matríZ'`.
 *   The fallback 'Matriz' fires instead — same observable output, dead branch.
 *   This is locked by the test below. Fix in a separate fix(company): commit.
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────
// Inline copies from NewCompany.tsx — replaced with
// imports after commit 4 (refactor(company): extract format utils)
// ─────────────────────────────────────────────────

const formatDateBR = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const ddmmyyyyToISO = (s?: string | null): string | null => {
  const v = String(s || '').trim();
  const m = v.match(/^([0-3]\d)\/(0\d|1[0-2])\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1],
    mm = m[2],
    yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
};

const parseToBR = (iso: string): string => {
  const ymd = String(iso || '').slice(0, 10);
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};

const normalizeTipoEmpresa = (v: string): 'Matriz' | 'Filial' => {
  const s = String(v || '').trim().toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (s === 'matriz' || s === 'matríZ') return 'Matriz';
  if (s === 'filial') return 'Filial';
  return 'Matriz';
};

const normalizeTributacao = (v: string): string => {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'mei') return 'MEI';
  if (s === 'simples nacional') return 'Simples Nacional';
  if (s.includes('excesso') || s.includes('sublimite'))
    return 'Simples Nacional - Excesso de sublimite de receita bruta';
  if (s === 'regime normal' || s === 'normal') return 'Regime Normal';
  return 'Simples Nacional';
};

// ─────────────────────────────────────────────────

describe('formatDateBR', () => {
  it('formats Date with zero-padded day — Jan 5, 2024 → "05/01/2024"', () => {
    expect(formatDateBR(new Date(2024, 0, 5))).toBe('05/01/2024');
  });

  it('formats Date — Dec 31, 2024 → "31/12/2024"', () => {
    expect(formatDateBR(new Date(2024, 11, 31))).toBe('31/12/2024');
  });

  it('formats single-digit month with zero padding', () => {
    expect(formatDateBR(new Date(2023, 2, 1))).toBe('01/03/2023');
  });
});

// ─────────────────────────────────────────────────

describe('ddmmyyyyToISO', () => {
  it('"01/01/2024" → "2024-01-01"', () => {
    expect(ddmmyyyyToISO('01/01/2024')).toBe('2024-01-01');
  });

  it('"31/12/2023" → "2023-12-31"', () => {
    expect(ddmmyyyyToISO('31/12/2023')).toBe('2023-12-31');
  });

  it('returns null for empty string', () => {
    expect(ddmmyyyyToISO('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(ddmmyyyyToISO(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(ddmmyyyyToISO(undefined)).toBeNull();
  });

  it('returns null for "invalid" string', () => {
    expect(ddmmyyyyToISO('invalid')).toBeNull();
  });

  it('returns null for "1/1/2024" (no leading zeros — regex requires [0-3]d)', () => {
    expect(ddmmyyyyToISO('1/1/2024')).toBeNull();
  });

  it('returns null for "01/13/2024" (month > 12, regex rejects)', () => {
    // month group is (0\d|1[0-2]) — only 01..12 allowed
    expect(ddmmyyyyToISO('01/13/2024')).toBeNull();
  });

  it('"32/01/2024" — passes regex (day group is [0-3]d; 32 matches) → returns ISO', () => {
    // NOTE: The regex does NOT validate day range — 32 passes [0-3]\d
    // This is pinned as-is (no range validation added in this refactor)
    expect(ddmmyyyyToISO('32/01/2024')).toBe('2024-01-32');
  });
});

// ─────────────────────────────────────────────────

describe('parseToBR', () => {
  it('"2024-06-15" → "15/06/2024"', () => {
    expect(parseToBR('2024-06-15')).toBe('15/06/2024');
  });

  it('"2023-01-01" → "01/01/2023"', () => {
    expect(parseToBR('2023-01-01')).toBe('01/01/2023');
  });

  it('empty string → ""', () => {
    expect(parseToBR('')).toBe('');
  });

  it('string with extra timestamp sliced to 10 chars correctly', () => {
    expect(parseToBR('2024-06-15T00:00:00Z')).toBe('15/06/2024');
  });
});

// ─────────────────────────────────────────────────

describe('normalizeTipoEmpresa', () => {
  it('"matriz" → "Matriz"', () => {
    expect(normalizeTipoEmpresa('matriz')).toBe('Matriz');
  });

  it('"MATRIZ" → "Matriz" (toLowerCase matches first branch)', () => {
    expect(normalizeTipoEmpresa('MATRIZ')).toBe('Matriz');
  });

  it('"Filial" → "Filial"', () => {
    expect(normalizeTipoEmpresa('Filial')).toBe('Filial');
  });

  it('"FILIAL" → "Filial"', () => {
    expect(normalizeTipoEmpresa('FILIAL')).toBe('Filial');
  });

  it('"filial" → "Filial"', () => {
    expect(normalizeTipoEmpresa('filial')).toBe('Filial');
  });

  it('"" → "Matriz" (fallback)', () => {
    expect(normalizeTipoEmpresa('')).toBe('Matriz');
  });

  it('"unknown" → "Matriz" (fallback)', () => {
    expect(normalizeTipoEmpresa('unknown')).toBe('Matriz');
  });

  /**
   * LATENT BUG — PRESERVED (do NOT fix in this refactor):
   * Input 'Matríz' (with accented 'i') → toLowerCase() → 'matríz'
   * The branch `s === 'matríZ'` (mixed-case) is NEVER reached because
   * toLowerCase() produces 'matríz', not 'matríZ'.
   * The fallback 'Matriz' fires instead — same output, dead branch.
   * Fix in a separate fix(company): commit after this refactor merges.
   */
  it('LATENT BUG (preserved): "Matríz" toLowerCase → "matríz" ≠ "matríZ" → fallback "Matriz"', () => {
    expect(normalizeTipoEmpresa('Matríz')).toBe('Matriz');
    // Proof the branch is dead: 'matríz' !== 'matríZ'
    expect('matríz' === 'matríZ').toBe(false);
  });
});

// ─────────────────────────────────────────────────

describe('normalizeTributacao', () => {
  it('"MEI" → "MEI"', () => {
    expect(normalizeTributacao('MEI')).toBe('MEI');
  });

  it('"mei" → "MEI"', () => {
    expect(normalizeTributacao('mei')).toBe('MEI');
  });

  it('"simples nacional" → "Simples Nacional"', () => {
    expect(normalizeTributacao('simples nacional')).toBe('Simples Nacional');
  });

  it('"Simples Nacional" → "Simples Nacional"', () => {
    expect(normalizeTributacao('Simples Nacional')).toBe('Simples Nacional');
  });

  it('"excesso de sublimite de receita bruta" → long canonical string', () => {
    expect(normalizeTributacao('excesso de sublimite de receita bruta')).toBe(
      'Simples Nacional - Excesso de sublimite de receita bruta',
    );
  });

  it('"sublimite" substring match → long canonical string', () => {
    expect(normalizeTributacao('sublimite')).toBe(
      'Simples Nacional - Excesso de sublimite de receita bruta',
    );
  });

  it('"regime normal" → "Regime Normal"', () => {
    expect(normalizeTributacao('regime normal')).toBe('Regime Normal');
  });

  it('"normal" → "Regime Normal"', () => {
    expect(normalizeTributacao('normal')).toBe('Regime Normal');
  });

  it('"Regime Normal" (mixed case) → "Regime Normal"', () => {
    expect(normalizeTributacao('Regime Normal')).toBe('Regime Normal');
  });

  it('"" → "Simples Nacional" (fallback)', () => {
    expect(normalizeTributacao('')).toBe('Simples Nacional');
  });

  it('"unknown_value" → "Simples Nacional" (fallback)', () => {
    expect(normalizeTributacao('unknown_value')).toBe('Simples Nacional');
  });
});
