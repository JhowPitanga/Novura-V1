import { describe, it, expect } from 'vitest';
import { buildBaseProductPayload, getProductTypeForDB } from '../productPayload';
import { INT_MAX } from '../skuHelpers';
import type { ProductFormData } from '@/types/products';

const baseFormData: ProductFormData = {
  type: 'single',
  name: 'Test Product',
  sku: 'TEST-SKU',
  category: '',
  brand: '',
  description: '',
  costPrice: '10.00',
  sellPrice: '',
  stock: '5',
  warehouse: 'warehouse-123',
  height: '10',
  width: '10',
  length: '10',
  weight: '500',
  unitType: '',
  barcode: '',
  ncm: '',
  cest: '',
  origin: '',
};

describe('buildBaseProductPayload', () => {
  describe('parent_id', () => {
    it('is always null for UNICO', () => {
      const p = buildBaseProductPayload(baseFormData, 'UNICO', 'TEST-SKU');
      expect(p.parent_id).toBeNull();
    });

    it('is always null for VARIACAO_PAI', () => {
      const p = buildBaseProductPayload(baseFormData, 'VARIACAO_PAI', 'NV12345');
      expect(p.parent_id).toBeNull();
    });

    it('is always null for KIT', () => {
      const p = buildBaseProductPayload(baseFormData, 'KIT', 'KIT-SKU');
      expect(p.parent_id).toBeNull();
    });
  });

  describe('image_urls', () => {
    it('is always [] on create', () => {
      const p = buildBaseProductPayload(baseFormData, 'UNICO', 'SKU');
      expect(p.image_urls).toEqual([]);
    });
  });

  describe('stock_qnt (IIFE >0?n:null quirk)', () => {
    it('stock "0" → null (0 maps to null)', () => {
      const p = buildBaseProductPayload({ ...baseFormData, stock: '0' }, 'UNICO', 'SKU');
      expect(p.stock_qnt).toBeNull();
    });

    it('stock "-1" → null (negative maps to null)', () => {
      const p = buildBaseProductPayload({ ...baseFormData, stock: '-1' }, 'UNICO', 'SKU');
      expect(p.stock_qnt).toBeNull();
    });

    it('stock "" → null', () => {
      const p = buildBaseProductPayload({ ...baseFormData, stock: '' }, 'UNICO', 'SKU');
      expect(p.stock_qnt).toBeNull();
    });

    it('stock "1" → 1', () => {
      const p = buildBaseProductPayload({ ...baseFormData, stock: '1' }, 'UNICO', 'SKU');
      expect(p.stock_qnt).toBe(1);
    });

    it('stock "5" → 5', () => {
      const p = buildBaseProductPayload({ ...baseFormData, stock: '5' }, 'UNICO', 'SKU');
      expect(p.stock_qnt).toBe(5);
    });

    it('stock undefined → null', () => {
      const p = buildBaseProductPayload({ ...baseFormData, stock: undefined as any }, 'UNICO', 'SKU');
      expect(p.stock_qnt).toBeNull();
    });
  });

  describe('barcode (stored as INT, not EAN string)', () => {
    it('empty barcode → 0', () => {
      const p = buildBaseProductPayload({ ...baseFormData, barcode: '' }, 'UNICO', 'SKU');
      expect(p.barcode).toBe(0);
    });

    it('barcode "123456789" → 123456789 (fits in INT)', () => {
      const p = buildBaseProductPayload({ ...baseFormData, barcode: '123456789' }, 'UNICO', 'SKU');
      expect(p.barcode).toBe(123456789);
    });

    it('13-digit EAN > INT_MAX → INT_MAX (clamped, NOT stored as full EAN)', () => {
      // QUIRK: Most EAN-13 values exceed 2147483647, so they get clamped
      const p = buildBaseProductPayload({ ...baseFormData, barcode: '1234567890123' }, 'UNICO', 'SKU');
      expect(p.barcode).toBe(INT_MAX);
    });
  });

  describe('computedSku', () => {
    it('uses the passed computedSku', () => {
      const p = buildBaseProductPayload(baseFormData, 'UNICO', 'MY-COMPUTED-SKU');
      expect(p.sku).toBe('MY-COMPUTED-SKU');
    });
  });

  describe('cost_price', () => {
    it('empty costPrice → 0', () => {
      const p = buildBaseProductPayload({ ...baseFormData, costPrice: '' }, 'UNICO', 'SKU');
      expect(p.cost_price).toBe(0);
    });

    it('costPrice "10.50" → 10.5', () => {
      const p = buildBaseProductPayload({ ...baseFormData, costPrice: '10.50' }, 'UNICO', 'SKU');
      expect(p.cost_price).toBe(10.5);
    });
  });
});

describe('getProductTypeForDB', () => {
  it('single → UNICO', () => expect(getProductTypeForDB('single')).toBe('UNICO'));
  it('variation → VARIACAO_PAI', () => expect(getProductTypeForDB('variation')).toBe('VARIACAO_PAI'));
  it('kit → KIT', () => expect(getProductTypeForDB('kit')).toBe('KIT'));
  it('unknown → UNICO (default)', () => expect(getProductTypeForDB('unknown')).toBe('UNICO'));
});
