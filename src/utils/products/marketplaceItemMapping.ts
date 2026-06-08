/**
 * EditProduct-variant derive helpers + marketplace slug maps.
 * Extracted verbatim from EditProduct.tsx.
 *
 * IMPORTANT: These are NOT byte-identical to the Panel variant in adLinkingMapping.ts:
 *   - getThumbFromPictures: no Shopee model_* / cf.shopee.com.br handling
 *   - deriveSku: panel adds model_sku check first
 *   - buildVariationLabel: panel also handles variation.model_name / variation.name
 * Do NOT merge with adLinkingMapping.ts — behavior differs.
 */

export const marketplaces = [
  { value: 'mercado-livre', label: 'Mercado Livre' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'magazine-luiza', label: 'Magazine Luiza' },
  { value: 'americanas', label: 'Americanas' },
];

export const marketplaceDisplayByValue: Record<string, string> = {
  'mercado-livre': 'Mercado Livre',
  'amazon': 'Amazon',
  'shopee': 'Shopee',
  'magazine-luiza': 'Magazine Luiza',
  'americanas': 'Americanas',
};

export const dbMarketplaceNameByValue: Record<string, string> = {
  'mercado-livre': 'mercado_livre',
  'amazon': 'amazon',
  'shopee': 'shopee',
  'magazine-luiza': 'magazine_luiza',
  'americanas': 'americanas',
};

export const labelByDbName: Record<string, string> = {
  'mercado_livre': 'Mercado Livre',
  'amazon': 'Amazon',
  'shopee': 'Shopee',
  'magazine_luiza': 'Magazine Luiza',
  'americanas': 'Americanas',
};

export const valueByDbName: Record<string, string> = {
  'mercado_livre': 'mercado-livre',
  'amazon': 'amazon',
  'shopee': 'shopee',
  'magazine_luiza': 'magazine-luiza',
  'americanas': 'americanas',
};

/** Extracts thumbnail from a marketplace variation and pictures array. */
export function getThumbFromPictures(variation: any, pictures: any): string {
  try {
    const picIds = Array.isArray(variation?.picture_ids) ? variation.picture_ids : [];
    const firstPicId = picIds.length > 0 ? picIds[0] : null;
    const picsArr = Array.isArray(pictures) ? pictures : [];
    if (firstPicId) {
      const match = picsArr.find((p: any) => p?.id === firstPicId);
      if (match?.url) return match.url;
      if (match?.secure_url) return match.secure_url;
    }
    if (typeof variation?.thumbnail === 'string') return variation.thumbnail;
    if (typeof variation?.image === 'string') return variation.image;
    if (Array.isArray(variation?.images) && typeof variation.images[0] === 'string') return variation.images[0];
    const first = picsArr[0];
    if (first?.url) return first.url;
    if (first?.secure_url) return first.secure_url;
    return '';
  } catch {
    return '';
  }
}

/** Builds a title string combining itemTitle with variation attribute data. */
export function buildVariationTitle(itemTitle: string, variation: any): string {
  const combos = Array.isArray(variation?.attribute_combinations) ? variation.attribute_combinations : [];
  const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];
  const parts: string[] = [];
  if (combos.length > 0) {
    parts.push(combos.map((c: any) => [c?.name, c?.value_name].filter(Boolean).join(':')).join(' - '));
  } else if (attrs.length > 0) {
    parts.push(attrs.map((a: any) => [a?.name, a?.value_name || a?.value].filter(Boolean).join(':')).join(' - '));
  } else if (variation?.name) {
    parts.push(String(variation.name));
  }
  const suffix = parts.filter(Boolean).join(' | ');
  return suffix ? `${itemTitle || ''} — ${suffix}`.trim() : (itemTitle || 'Anúncio');
}

/** Derives SKU from item/variation data (EditProduct variant — no model_sku). */
export function deriveSku(item: any, variation: any): string {
  try {
    if (variation?.sku) return String(variation.sku);
    if (variation?.seller_sku) return String(variation.seller_sku);
    if (item?.sku) return String(item.sku);
    const combos = Array.isArray(variation?.attribute_combinations) ? variation.attribute_combinations : [];
    const comboSku = combos.find((a: any) => a?.id === 'SELLER_SKU' || String(a?.name || '').toUpperCase() === 'SKU');
    if (comboSku?.value_name) return String(comboSku.value_name);
    if (comboSku?.value_id) return String(comboSku.value_id);
    if (comboSku?.value) return String(comboSku.value);
    const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];
    const attrSku = attrs.find((a: any) => a?.id === 'SELLER_SKU' || String(a?.name || '').toUpperCase() === 'SKU');
    if (attrSku?.value_name) return String(attrSku.value_name);
    if (attrSku?.value_id) return String(attrSku.value_id);
    if (attrSku?.value) return String(attrSku.value);
    return '';
  } catch {
    return '';
  }
}

/** Short label from variation attribute_combinations, excluding SKU entries. */
export function buildVariationLabel(variation: any): string {
  try {
    const combos = Array.isArray(variation?.attribute_combinations) ? variation.attribute_combinations : [];
    return combos
      .filter((a: any) => a?.id !== 'SELLER_SKU' && String(a?.name || '').toUpperCase() !== 'SKU')
      .map((a: any) => a?.value_name || a?.value_id || '')
      .filter(Boolean)
      .join(' / ');
  } catch {
    return '';
  }
}
