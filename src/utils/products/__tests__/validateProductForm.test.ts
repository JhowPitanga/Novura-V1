import { describe, it, expect } from 'vitest';
import { validateStep, getMaxSteps } from '../validateProductForm';

const emptyForm = {
  name: '',
  sku: '',
  costPrice: '',
  stock: '',
  warehouse: '',
  height: '',
  width: '',
  length: '',
  weight: '',
  barcode: '',
  ncm: '',
  origin: '',
};

const validBasics = { name: 'Produto', sku: 'SKU-001' };
const validStock = { costPrice: '10', stock: '5', warehouse: 'wh-id' };
const validDims = { height: '10', width: '10', length: '10', weight: '500' };
// Valid EAN-13 with correct checksum (verified against validateEanChecksum)
const validEan = '7891010126391';
const validNcm = '12345678'; // 8 digits
const validFiscal = { barcode: validEan, ncm: validNcm, origin: '0' };

describe('validateStep for single product', () => {
  it('step 2: requires name + sku', () => {
    const r = validateStep(2, 'single', emptyForm);
    expect(r.valid).toBe(false);
    expect(r.fieldErrors.name).toBe(true);
    expect(r.fieldErrors.sku).toBe(true);
  });

  it('step 2: passes with name + sku', () => {
    const r = validateStep(2, 'single', { ...emptyForm, ...validBasics });
    expect(r.valid).toBe(true);
  });

  it('step 3: requires costPrice + stock + warehouse', () => {
    const r = validateStep(3, 'single', emptyForm);
    expect(r.valid).toBe(false);
    expect(r.fieldErrors.costPrice).toBe(true);
    expect(r.fieldErrors.stock).toBe(true);
    expect(r.fieldErrors.warehouse).toBe(true);
  });

  it('step 3: passes with valid stock fields', () => {
    const r = validateStep(3, 'single', { ...emptyForm, ...validStock });
    expect(r.valid).toBe(true);
  });

  it('step 4: requires all dimensions', () => {
    const r = validateStep(4, 'single', emptyForm);
    expect(r.valid).toBe(false);
  });

  it('step 4: passes with all dims', () => {
    const r = validateStep(4, 'single', { ...emptyForm, ...validDims });
    expect(r.valid).toBe(true);
  });

  it('step 5: requires EAN-13 with valid checksum', () => {
    const badEan = { ...emptyForm, barcode: '1234567890123', ncm: validNcm, origin: '0' };
    const r = validateStep(5, 'single', badEan);
    expect(r.valid).toBe(false);
    expect(r.fieldErrors.barcode).toBe(true);
  });

  it('step 5: passes with valid EAN + NCM + origin', () => {
    const r = validateStep(5, 'single', { ...emptyForm, ...validFiscal });
    expect(r.valid).toBe(true);
  });

  it('step 5: NCM must be exactly 8 digits', () => {
    const r = validateStep(5, 'single', { ...emptyForm, barcode: validEan, ncm: '1234567', origin: '0' });
    expect(r.valid).toBe(false);
    expect(r.fieldErrors.ncm).toBe(true);
  });

  it('step 5: empty barcode is invalid', () => {
    const r = validateStep(5, 'single', { ...emptyForm, ncm: validNcm, origin: '0' });
    expect(r.valid).toBe(false);
    expect(r.fieldErrors.barcode).toBe(true);
  });

  it('steps 1, 6, 7 return valid=true', () => {
    expect(validateStep(1, 'single', emptyForm).valid).toBe(true);
    expect(validateStep(6, 'single', emptyForm).valid).toBe(true);
  });
});

describe('validateStep for variation product', () => {
  it('step 2: name required, SKU NOT required', () => {
    const r = validateStep(2, 'variation', { ...emptyForm, name: 'Produto' });
    expect(r.valid).toBe(true);
    expect(r.fieldErrors.sku).toBe(false);
  });

  it('step 2: fails if name missing', () => {
    const r = validateStep(2, 'variation', emptyForm);
    expect(r.valid).toBe(false);
    expect(r.fieldErrors.name).toBe(true);
  });

  it('step 3: skipped for variation — returns valid', () => {
    const r = validateStep(3, 'variation', emptyForm);
    expect(r.valid).toBe(true);
  });

  it('step 4: skipped for variation — returns valid', () => {
    const r = validateStep(4, 'variation', emptyForm);
    expect(r.valid).toBe(true);
  });

  it('step 5: skipped for variation — returns valid', () => {
    const r = validateStep(5, 'variation', emptyForm);
    expect(r.valid).toBe(true);
  });
});

describe('validateStep for kit product', () => {
  it('step 2: requires name + sku', () => {
    const r = validateStep(2, 'kit', emptyForm);
    expect(r.valid).toBe(false);
  });

  it('step 2: passes with name + sku', () => {
    const r = validateStep(2, 'kit', { ...emptyForm, name: 'Kit', sku: 'KIT-001' });
    expect(r.valid).toBe(true);
  });

  it('all other steps for kit return valid=true', () => {
    expect(validateStep(3, 'kit', emptyForm).valid).toBe(true);
    expect(validateStep(4, 'kit', emptyForm).valid).toBe(true);
    expect(validateStep(5, 'kit', emptyForm).valid).toBe(true);
  });
});

describe('getMaxSteps', () => {
  it('kit → 4', () => expect(getMaxSteps('kit')).toBe(4));
  it('single → 6', () => expect(getMaxSteps('single')).toBe(6));
  it('variation → 6', () => expect(getMaxSteps('variation')).toBe(6));
  it('empty → 6', () => expect(getMaxSteps('')).toBe(6));
});
