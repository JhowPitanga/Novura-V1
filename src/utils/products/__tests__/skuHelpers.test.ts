import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { INT_MAX, clampInt, generateSku, generateVariantParentSku, withRandomSuffix, parseBarcode } from '../skuHelpers';

describe('clampInt', () => {
  it('returns 0 for NaN input', () => expect(clampInt(NaN)).toBe(0));
  it('returns 0 for undefined', () => expect(clampInt(undefined)).toBe(0));
  it('returns 0 for null', () => expect(clampInt(null)).toBe(0));
  it('returns 0 for negative number', () => expect(clampInt(-1)).toBe(0));
  it('returns 0 for 0', () => expect(clampInt(0)).toBe(0));
  it('returns 1 for 1', () => expect(clampInt(1)).toBe(1));
  it('returns INT_MAX for INT_MAX', () => expect(clampInt(INT_MAX)).toBe(INT_MAX));
  it('clamps INT_MAX+1 to INT_MAX', () => expect(clampInt(INT_MAX + 1)).toBe(INT_MAX));
  it('returns 0 for string "abc"', () => expect(clampInt('abc')).toBe(0));
  it('parses string "42" → 42', () => expect(clampInt('42')).toBe(42));
  it('returns 0 for string "-1"', () => expect(clampInt('-1')).toBe(0));
  it('truncates float: "3.9" → 3', () => expect(clampInt('3.9')).toBe(3));
  it('accepts custom max', () => expect(clampInt(1000, 100)).toBe(100));
  it('does not cap below max', () => expect(clampInt(50, 100)).toBe(50));
  it('barcode values > INT_MAX are clamped when using clampInt (use parseBarcode for EAN instead)', () => {
    // clampInt is intentionally for integer columns (ncm, origin) — NOT for barcode
    expect(clampInt('1234567890123')).toBe(INT_MAX);
    expect(clampInt('123456789')).toBe(123456789);
  });
});

describe('generateSku', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('returns uppercase result', () => {
    const sku = generateSku('produto teste');
    expect(sku).toBe(sku.toUpperCase());
  });

  it('strips diacritics', () => {
    const sku = generateSku('Ação');
    expect(sku).not.toMatch(/[À-ÿ]/);
  });

  it('truncates base to ≤16 chars before suffix', () => {
    const longName = 'A'.repeat(30);
    const sku = generateSku(longName);
    const parts = sku.split('-');
    expect(parts[0].length).toBeLessThanOrEqual(16);
  });

  it('falls back to PROD for empty name', () => {
    const sku = generateSku('');
    expect(sku.startsWith('PROD')).toBe(true);
  });

  it('falls back to PROD for undefined name', () => {
    const sku = generateSku(undefined);
    expect(sku.startsWith('PROD')).toBe(true);
  });

  it('includes a random suffix', () => {
    // With Math.random() = 0.5, toString(36) = "0.i" and substring(2,6) = "i"... let's just verify format
    const sku = generateSku('test');
    expect(sku).toMatch(/^[A-Z0-9-]+$/);
    expect(sku.length).toBeGreaterThan(4);
  });

  it('result contains only A-Z 0-9 and hyphens', () => {
    const sku = generateSku('produto com espaços & especiais!');
    expect(sku).toMatch(/^[A-Z0-9-]+$/);
  });
});

describe('generateVariantParentSku', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('always starts with NV', () => {
    expect(generateVariantParentSku().startsWith('NV')).toBe(true);
  });

  it('always has total length 7', () => {
    expect(generateVariantParentSku()).toHaveLength(7);
  });

  it('digit part is always between 10000 and 99999', () => {
    // Mock Math.random to 0.0 → 10000
    randomSpy.mockReturnValueOnce(0.0);
    expect(generateVariantParentSku()).toBe('NV10000');
    // Mock Math.random to ~0.9999 → 99999
    randomSpy.mockReturnValueOnce(0.9999);
    const sku = generateVariantParentSku();
    const digits = parseInt(sku.slice(2));
    expect(digits).toBeGreaterThanOrEqual(10000);
    expect(digits).toBeLessThanOrEqual(99999);
  });
});

describe('parseBarcode', () => {
  it('returns 0 for empty string', () => expect(parseBarcode('')).toBe(0));
  it('returns 0 for undefined', () => expect(parseBarcode(undefined)).toBe(0));
  it('returns 0 for null', () => expect(parseBarcode(null)).toBe(0));
  it('returns 0 for negative', () => expect(parseBarcode('-1')).toBe(0));
  it('parses 9-digit barcode', () => expect(parseBarcode('123456789')).toBe(123456789));
  it('preserves full EAN-13 without clamping', () => {
    expect(parseBarcode('1234567890123')).toBe(1234567890123);
    expect(parseBarcode('7891000315507')).toBe(7891000315507);
  });
  it('truncates decimals', () => expect(parseBarcode('1234.9')).toBe(1234));
  it('returns 0 for non-numeric string', () => expect(parseBarcode('abc')).toBe(0));
});

describe('withRandomSuffix', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('appends hyphen + exactly 2 alphanum chars', () => {
    const result = withRandomSuffix('MY-SKU');
    expect(result).toMatch(/^MY-SKU-[A-Z0-9]{2}$/i);
  });

  it('preserves original SKU before suffix', () => {
    const result = withRandomSuffix('ABC-123');
    expect(result.startsWith('ABC-123-')).toBe(true);
  });

  it('suffix part is always exactly 2 characters (padded when needed)', () => {
    // Math.random()=0.5 → "0.i" → substring(2,4)="i" → padEnd(2,"0") → "I0"
    const result = withRandomSuffix('SKU');
    const parts = result.split('-');
    const suffix = parts[parts.length - 1];
    expect(suffix.length).toBe(2);
  });
});
