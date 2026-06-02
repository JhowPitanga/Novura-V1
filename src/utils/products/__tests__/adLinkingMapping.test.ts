/**
 * Characterization tests for ProductAdLinkingPanel derive helpers (Panel variant).
 *
 * DOCUMENTED DIVERGENCE from EditProduct variant (marketplaceItemMapping.ts):
 *   - getThumbnail: Panel handles Shopee model_image_url, image_id, picture_id via
 *     cf.shopee.com.br/file/<id>. EditProduct's getThumbFromPictures does NOT.
 *   - deriveSku: Panel checks model_sku FIRST, then sku, seller_sku, item.sku, item.data.base_info.item_sku.
 *     EditProduct does NOT check model_sku or data.base_info.item_sku.
 *   - buildVariationLabel: Panel falls back to variation.model_name/name/variation_name.
 *     EditProduct only processes attribute_combinations.
 *
 * Do NOT merge these with marketplaceItemMapping.ts — behaviors intentionally differ.
 */

import { describe, it, expect } from 'vitest';
import {
  getThumbnail,
  deriveSku,
  buildVariationLabel,
  normalizeSearchValue,
  ALL_MARKETPLACES_VALUE,
} from '../adLinkingMapping';

describe('getThumbnail (Panel variant — Shopee-aware)', () => {
  it('returns empty string for empty inputs', () => {
    expect(getThumbnail({}, {}, [])).toBe('');
  });

  it('prefers variation.model_image_url (Shopee-specific — not in EditProduct variant)', () => {
    const variation = { model_image_url: 'https://shopee.example.com/model.jpg' };
    expect(getThumbnail({}, variation, [])).toBe('https://shopee.example.com/model.jpg');
  });

  it('handles Shopee image_id via cf.shopee.com.br URL (not in EditProduct variant)', () => {
    const variation = { image_id: 'abc123def' };
    const result = getThumbnail({}, variation, []);
    expect(result).toBe('https://cf.shopee.com.br/file/abc123def');
  });

  it('handles Shopee picture_id via cf.shopee.com.br URL', () => {
    const variation = { picture_id: 'xyz789' };
    const result = getThumbnail({}, variation, []);
    expect(result).toBe('https://cf.shopee.com.br/file/xyz789');
  });

  it('falls back to variation.image_url', () => {
    const variation = { image_url: 'https://img.example.com/v.jpg' };
    expect(getThumbnail({}, variation, [])).toBe('https://img.example.com/v.jpg');
  });

  it('falls back to variation.thumbnail', () => {
    const variation = { thumbnail: 'https://thumb.example.com/t.jpg' };
    expect(getThumbnail({}, variation, [])).toBe('https://thumb.example.com/t.jpg');
  });

  it('falls back to item.thumbnail', () => {
    const item = { thumbnail: 'https://item-thumb.example.com/t.jpg' };
    expect(getThumbnail(item, {}, [])).toBe('https://item-thumb.example.com/t.jpg');
  });

  it('falls back to pictures[0]', () => {
    const pictures = [{ url: 'https://pic.example.com/p.jpg' }];
    expect(getThumbnail({}, {}, pictures)).toBe('https://pic.example.com/p.jpg');
  });

  it('handles Shopee string image_id in pictures array', () => {
    const variation = { picture_ids: ['shopee_img_hash'] };
    // Picture is a plain string (Shopee format) — gets wrapped as cf.shopee.com.br URL
    const pictures = ['shopee_img_hash'];
    // String picture matching by includes
    const result = getThumbnail({}, variation, pictures);
    expect(result).toBe('https://cf.shopee.com.br/file/shopee_img_hash');
  });
});

describe('deriveSku (Panel variant — checks model_sku first)', () => {
  it('returns empty string for empty inputs', () => {
    expect(deriveSku({}, {})).toBe('');
  });

  it('prefers variation.model_sku (not present in EditProduct variant)', () => {
    expect(deriveSku({}, { model_sku: 'MODEL-SKU' })).toBe('MODEL-SKU');
  });

  it('falls back to variation.sku', () => {
    expect(deriveSku({}, { sku: 'VAR-SKU' })).toBe('VAR-SKU');
  });

  it('falls back to variation.seller_sku', () => {
    expect(deriveSku({}, { seller_sku: 'SELLER-SKU' })).toBe('SELLER-SKU');
  });

  it('falls back to item.sku', () => {
    expect(deriveSku({ sku: 'ITEM-SKU' }, {})).toBe('ITEM-SKU');
  });

  it('falls back to item.data.base_info.item_sku (Shopee-specific)', () => {
    const item = { data: { base_info: { item_sku: 'BASE-INFO-SKU' } } };
    expect(deriveSku(item, {})).toBe('BASE-INFO-SKU');
  });
});

describe('buildVariationLabel (Panel variant — model_name fallback)', () => {
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

  it('falls back to variation.model_name (not in EditProduct variant)', () => {
    expect(buildVariationLabel({ model_name: 'Azul M' })).toBe('Azul M');
  });

  it('falls back to variation.name', () => {
    expect(buildVariationLabel({ name: 'Grande' })).toBe('Grande');
  });

  it('falls back to variation.variation_name', () => {
    expect(buildVariationLabel({ variation_name: 'Pequeno' })).toBe('Pequeno');
  });
});

describe('normalizeSearchValue', () => {
  it('lowercases and removes diacritics', () => {
    expect(normalizeSearchValue('Ação')).toBe('acao');
    expect(normalizeSearchValue('PRODUTO')).toBe('produto');
  });

  it('handles undefined/null gracefully', () => {
    expect(normalizeSearchValue(undefined)).toBe('');
    expect(normalizeSearchValue(null)).toBe('');
  });
});

describe('ALL_MARKETPLACES_VALUE', () => {
  it('is a stable string constant', () => {
    expect(ALL_MARKETPLACES_VALUE).toBe('__all_marketplaces__');
  });
});
