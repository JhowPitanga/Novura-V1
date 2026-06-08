/**
 * ProductAdLinkingPanel-variant derive helpers.
 * Extracted verbatim from ProductAdLinkingPanel.tsx.
 *
 * DOCUMENTED DIVERGENCE from EditProduct variant (marketplaceItemMapping.ts):
 *   - getThumbnail: handles Shopee model_image_url, image_id, picture_id → cf.shopee.com.br/file/<id>
 *     EditProduct's getThumbFromPictures does NOT have this Shopee-specific logic.
 *   - deriveSku: checks model_sku FIRST, then sku/seller_sku/item.sku/item.data.base_info.item_sku.
 *     EditProduct does NOT check model_sku or data.base_info.item_sku.
 *   - buildVariationLabel: falls back to variation.model_name/name/variation_name.
 *     EditProduct only processes attribute_combinations.
 *
 * Do NOT merge with marketplaceItemMapping.ts.
 */

export const ALL_MARKETPLACES_VALUE = '__all_marketplaces__';

export const normalizeSearchValue = (value: unknown): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function getImageUrl(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) return value;
    return `https://cf.shopee.com.br/file/${value}`;
  }
  const v = value as Record<string, unknown>;
  if (v.url) return String(v.url);
  if (v.secure_url) return String(v.secure_url);
  if (v.image_url) return String(v.image_url);
  if (v.thumbnail_url) return String(v.thumbnail_url);
  if (v.model_image_url) return String(v.model_image_url);
  if (v.image_id) return `https://cf.shopee.com.br/file/${v.image_id}`;
  if (v.picture_id) return `https://cf.shopee.com.br/file/${v.picture_id}`;
  return '';
}

/** Panel-variant thumbnail resolver — includes Shopee cf.shopee.com.br/file/ logic. */
export function getThumbnail(item: unknown, variation: unknown, pictures: unknown[]): string {
  const v = variation as Record<string, unknown>;
  const it = item as Record<string, unknown>;

  const directVariationImage =
    getImageUrl(v?.model_image_url) ||
    getImageUrl(v?.image_url) ||
    getImageUrl(v?.thumbnail) ||
    getImageUrl(v?.image);
  if (directVariationImage) return directVariationImage;

  const picIds = [
    ...(Array.isArray(v?.picture_ids) ? v.picture_ids : []),
    v?.picture_id,
    v?.image_id,
  ].filter(Boolean);
  for (const picId of picIds) {
    const match = pictures.find((p: any) => {
      if (typeof p === 'string') return p.includes(String(picId));
      return String((p as any)?.id || (p as any)?.picture_id || (p as any)?.image_id || '') === String(picId);
    });
    const matchedUrl = getImageUrl(match as unknown);
    if (matchedUrl) return matchedUrl;
    return getImageUrl(picId);
  }

  const itemImage =
    getImageUrl(it?.thumbnail) ||
    getImageUrl(it?.image_url) ||
    getImageUrl(it?.image) ||
    getImageUrl((it?.data as any)?.base_info?.image?.image_url_list?.[0]) ||
    getImageUrl((it?.data as any)?.base_info?.promotion_image?.image_url_list?.[0]);
  if (itemImage) return itemImage;

  return getImageUrl(pictures[0] as unknown);
}

/**
 * Canonical SKU derivation covering both Shopee (model_sku) and Mercado Livre
 * (SELLER_SKU in attribute_combinations / attributes).
 */
export function deriveSku(item: unknown, variation: unknown): string {
  const v = variation as Record<string, unknown>;
  const it = item as Record<string, unknown>;
  if (v?.model_sku) return String(v.model_sku);
  if (v?.sku) return String(v.sku);
  if (v?.seller_sku) return String(v.seller_sku);
  if (it?.sku) return String(it.sku);
  if ((it?.data as any)?.base_info?.item_sku) return String((it.data as any).base_info.item_sku);
  // Mercado Livre: SELLER_SKU stored in attribute_combinations or attributes
  const combos = Array.isArray(v?.attribute_combinations) ? (v.attribute_combinations as any[]) : [];
  const comboSku = combos.find((a: any) => a?.id === 'SELLER_SKU' || String(a?.name || '').toUpperCase() === 'SKU');
  if (comboSku?.value_name) return String(comboSku.value_name);
  if (comboSku?.value_id) return String(comboSku.value_id);
  if (comboSku?.value) return String(comboSku.value);
  const attrs = Array.isArray(v?.attributes) ? (v.attributes as any[]) : [];
  const attrSku = attrs.find((a: any) => a?.id === 'SELLER_SKU' || String(a?.name || '').toUpperCase() === 'SKU');
  if (attrSku?.value_name) return String(attrSku.value_name);
  if (attrSku?.value_id) return String(attrSku.value_id);
  if (attrSku?.value) return String(attrSku.value);
  return '';
}

/** Panel-variant variation label — falls back to model_name/name/variation_name. */
export function buildVariationLabel(variation: unknown): string {
  const v = variation as Record<string, unknown>;
  const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations as any[] : [];
  const comboLabel = combos
    .filter((a) => a?.id !== 'SELLER_SKU' && String(a?.name || '').toUpperCase() !== 'SKU')
    .map((a) => a?.value_name || a?.value_id || '')
    .filter(Boolean)
    .join(' / ');
  if (comboLabel) return comboLabel;
  return String(v?.model_name || v?.name || v?.variation_name || '').trim();
}
