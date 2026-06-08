/**
 * Marketplace slug/label maps + thin wrappers around the canonical helpers in adLinkingMapping.ts.
 *
 * The derive helpers (getThumbFromPictures, deriveSku, buildVariationLabel) now delegate to
 * adLinkingMapping.ts so both linking flows (ProductAdLinkingPanel and MarketplaceMappingDrawer)
 * produce consistent SKU and thumbnail values.
 */
import { getThumbnail, deriveSku as deriveSkuCanonical, buildVariationLabel as buildVariationLabelCanonical } from './adLinkingMapping';

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

/**
 * Delegates to the canonical Panel-variant thumbnail resolver in adLinkingMapping.ts,
 * which includes Shopee cf.shopee.com.br/file/ handling.
 */
export function getThumbFromPictures(variation: any, pictures: any): string {
  return getThumbnail(null, variation, Array.isArray(pictures) ? pictures : []);
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

/** Delegates to the canonical Panel-variant SKU resolver in adLinkingMapping.ts. */
export function deriveSku(item: any, variation: any): string {
  return deriveSkuCanonical(item, variation);
}

/** Delegates to the canonical Panel-variant label builder in adLinkingMapping.ts. */
export function buildVariationLabel(variation: any): string {
  return buildVariationLabelCanonical(variation);
}
