// Tests for single product Zod schema
import { describe, it, expect } from 'vitest';
import { singleProductSchema } from './single.schema';

const validBase = {
  name: 'Produto Teste',
  sku: 'PROD-001',
  category_id: 'a0b1c2d3-e4f5-6789-abcd-ef0123456789',
  cost_price: 10,
  barcode: undefined,
  ncm: '12345678',
  cest: undefined,
  tax_origin_code: 0,
  package_height: 10,
  package_width: 10,
  package_length: 10,
  weight: 0.5,
  warehouse_id: 'b0b1c2d3-e4f5-6789-abcd-ef0123456789',
};

describe('singleProductSchema', () => {
  it('accepts a valid product', () => {
    const result = singleProductSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 3 chars', () => {
    const result = singleProductSchema.safeParse({ ...validBase, name: 'AB' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('name');
  });

  it('rejects NCM with 7 digits', () => {
    const result = singleProductSchema.safeParse({ ...validBase, ncm: '1234567' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(paths.some((p) => p.includes('ncm'))).toBe(true);
  });

  it('rejects NCM with 9 digits', () => {
    const result = singleProductSchema.safeParse({ ...validBase, ncm: '123456789' });
    expect(result.success).toBe(false);
  });

  it('accepts NCM with exactly 8 digits', () => {
    const result = singleProductSchema.safeParse({ ...validBase, ncm: '87654321' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid EAN barcode', () => {
    const result = singleProductSchema.safeParse({ ...validBase, barcode: '7891000315508' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(paths.some((p) => p.includes('barcode'))).toBe(true);
  });

  it('accepts valid EAN-13 barcode', () => {
    const result = singleProductSchema.safeParse({ ...validBase, barcode: '7891000315507' });
    expect(result.success).toBe(true);
  });

  it('rejects sell_price less than cost_price', () => {
    const result = singleProductSchema.safeParse({ ...validBase, sell_price: 5, cost_price: 10 });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(paths.some((p) => p.includes('sell_price'))).toBe(true);
  });

  it('accepts sell_price equal to cost_price', () => {
    const result = singleProductSchema.safeParse({ ...validBase, sell_price: 10, cost_price: 10 });
    expect(result.success).toBe(true);
  });

  it('rejects tax_origin_code > 8', () => {
    const result = singleProductSchema.safeParse({ ...validBase, tax_origin_code: 9 });
    expect(result.success).toBe(false);
  });

  it('rejects negative dimensions', () => {
    const result = singleProductSchema.safeParse({ ...validBase, package_height: -1 });
    expect(result.success).toBe(false);
  });
});
