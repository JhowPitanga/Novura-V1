/**
 * Characterization tests for EditProduct derive helpers (EditProduct variant).
 * NOTE: These are NOT byte-identical to the Panel variant in adLinkingMapping.ts:
 *   - getThumbnail / getThumbFromPictures: no Shopee model_* / cf.shopee.com.br handling.
 *   - deriveSku: same logic but panel adds model_sku check first.
 *   - buildVariationLabel: same filter but panel also handles variation.model_name/name.
 * Do NOT merge these with adLinkingMapping. Keep both characterization tests separate.
 */

import { describe, it, expect } from 'vitest';
import {
  getThumbFromPictures,
  buildVariationTitle,
  deriveSku,
  buildVariationLabel,
} from '../marketplaceItemMapping';

describe('getThumbFromPictures (EditProduct variant)', () => {
  it('returns empty string for empty inputs', () => {
    expect(getThumbFromPictures({}, null)).toBe('');
  });

  it('prefers matching picture by picture_id', () => {
    const variation = { picture_ids: [42] };
    const pictures = [{ id: 42, url: 'http://example.com/img.jpg' }];
    expect(getThumbFromPictures(variation, pictures)).toBe('http://example.com/img.jpg');
  });

  it('uses secure_url if url not present', () => {
    const variation = { picture_ids: [42] };
    const pictures = [{ id: 42, secure_url: 'https://example.com/img.jpg' }];
    expect(getThumbFromPictures(variation, pictures)).toBe('https://example.com/img.jpg');
  });

  it('falls back to variation.thumbnail if no picture match', () => {
    const variation = { thumbnail: 'http://thumb.example.com/img.jpg' };
    expect(getThumbFromPictures(variation, [])).toBe('http://thumb.example.com/img.jpg');
  });

  it('falls back to variation.image', () => {
    const variation = { image: 'http://img.example.com/img.jpg' };
    expect(getThumbFromPictures(variation, [])).toBe('http://img.example.com/img.jpg');
  });

  it('falls back to variation.images[0]', () => {
    const variation = { images: ['http://first.example.com/img.jpg'] };
    expect(getThumbFromPictures(variation, [])).toBe('http://first.example.com/img.jpg');
  });

  it('falls back to first picture url', () => {
    expect(getThumbFromPictures({}, [{ url: 'http://fallback.example.com/img.jpg' }])).toBe('http://fallback.example.com/img.jpg');
  });

  it('returns empty string on exception', () => {
    // Passing non-array pictures triggers the catch
    expect(getThumbFromPictures(null, null)).toBe('');
  });
});

describe('deriveSku (EditProduct variant)', () => {
  it('returns empty string for empty inputs', () => {
    expect(deriveSku({}, {})).toBe('');
  });

  it('prefers variation.sku', () => {
    expect(deriveSku({ sku: 'ITEM-SKU' }, { sku: 'VAR-SKU' })).toBe('VAR-SKU');
  });

  it('falls back to variation.seller_sku', () => {
    expect(deriveSku({}, { seller_sku: 'SELLER-SKU' })).toBe('SELLER-SKU');
  });

  it('falls back to item.sku', () => {
    expect(deriveSku({ sku: 'ITEM-SKU' }, {})).toBe('ITEM-SKU');
  });

  it('finds SELLER_SKU in attribute_combinations', () => {
    const variation = {
      attribute_combinations: [
        { id: 'SELLER_SKU', value_name: 'COMBO-SKU' }
      ]
    };
    expect(deriveSku({}, variation)).toBe('COMBO-SKU');
  });

  it('finds SKU (by name) in attribute_combinations', () => {
    const variation = {
      attribute_combinations: [
        { name: 'sku', value_name: 'NAME-SKU' }
      ]
    };
    expect(deriveSku({}, variation)).toBe('NAME-SKU');
  });

  it('finds SELLER_SKU in attributes array', () => {
    const variation = {
      attributes: [
        { id: 'SELLER_SKU', value_name: 'ATTR-SKU' }
      ]
    };
    expect(deriveSku({}, variation)).toBe('ATTR-SKU');
  });
});

describe('buildVariationLabel (EditProduct variant)', () => {
  it('returns empty string for empty variation', () => {
    expect(buildVariationLabel({})).toBe('');
  });

  it('joins value_names from attribute_combinations, skipping SELLER_SKU', () => {
    const variation = {
      attribute_combinations: [
        { id: 'SELLER_SKU', value_name: 'SKU-123' },
        { value_name: 'Azul' },
        { value_name: 'M' },
      ]
    };
    expect(buildVariationLabel(variation)).toBe('Azul / M');
  });

  it('filters out combinations where name is SKU', () => {
    const variation = {
      attribute_combinations: [
        { name: 'SKU', value_name: 'SKU-VAL' },
        { name: 'Cor', value_name: 'Vermelho' },
      ]
    };
    expect(buildVariationLabel(variation)).toBe('Vermelho');
  });

  it('returns empty string when all combinations are SELLER_SKU', () => {
    const variation = {
      attribute_combinations: [{ id: 'SELLER_SKU', value_name: 'ONLY-SKU' }]
    };
    expect(buildVariationLabel(variation)).toBe('');
  });
});

describe('buildVariationTitle (EditProduct variant)', () => {
  it('returns itemTitle when no variation data', () => {
    expect(buildVariationTitle('Produto X', {})).toBe('Produto X');
  });

  it('appends attribute_combinations', () => {
    const variation = {
      attribute_combinations: [
        { name: 'Cor', value_name: 'Azul' },
        { name: 'Tamanho', value_name: 'M' },
      ]
    };
    expect(buildVariationTitle('Camiseta', variation)).toBe('Camiseta — Cor:Azul - Tamanho:M');
  });

  it('appends attributes if no attribute_combinations', () => {
    const variation = {
      attributes: [
        { name: 'Voltagem', value_name: '127V' }
      ]
    };
    expect(buildVariationTitle('Produto', variation)).toBe('Produto — Voltagem:127V');
  });

  it('appends variation.name if no combos/attrs', () => {
    const variation = { name: 'Azul' };
    expect(buildVariationTitle('Produto', variation)).toBe('Produto — Azul');
  });
});
