// Merges row-level fields from marketplace_items_raw into the payload shape expected by adapters.
// Pictures are often stored in the `pictures` column while `data` omits or duplicates them.

import { isMercadoLivreChannel, isShopeeChannel } from './reconcileCanonical.ts';

export function normalizeMlPictureEntries(
  raw: unknown[],
): Array<{ id?: string; url?: string; secure_url?: string }> {
  const out: Array<{ id?: string; url?: string; secure_url?: string }> = [];
  for (let idx = 0; idx < raw.length; idx++) {
    const p = raw[idx];
    if (typeof p === 'string' && p.trim()) {
      out.push({ id: String(idx), url: p, secure_url: p });
      continue;
    }
    if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      const url = String(o.url ?? o.secure_url ?? '').trim();
      if (!url) continue;
      const secure = String(o.secure_url ?? o.url ?? '').trim() || null;
      out.push({
        id: o.id != null ? String(o.id) : String(idx),
        url,
        secure_url: secure,
      });
    }
  }
  return out;
}

/** Collect Shopee image URLs from row.pictures and/or data.base_info.image. */
export function extractShopeeImageUrlList(source: Record<string, unknown>): string[] {
  const data = (source.data ?? source) as Record<string, unknown>;
  const base = (data.base_info ?? data) as Record<string, unknown>;
  const image = base.image as Record<string, unknown> | undefined;

  const fromBase: string[] = [];
  if (Array.isArray(image?.image_url_list)) {
    for (const u of image.image_url_list) {
      const s = String(u ?? '').trim();
      if (s) fromBase.push(s);
    }
  }
  if (fromBase.length > 0) return fromBase;

  if (Array.isArray(base.image_url_list)) {
    return base.image_url_list.map((u) => String(u ?? '').trim()).filter(Boolean);
  }

  const promo = base.promotion_image as Record<string, unknown> | undefined;
  if (promo && Array.isArray(promo.image_url_list)) {
    return promo.image_url_list.map((u) => String(u ?? '').trim()).filter(Boolean);
  }

  const rowPictures = Array.isArray(source.pictures) ? source.pictures : [];
  const fromRow: string[] = [];
  for (const p of rowPictures) {
    if (typeof p === 'string' && p.trim()) {
      fromRow.push(p.trim());
      continue;
    }
    if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      const u = String(o.url ?? o.secure_url ?? '').trim();
      if (u) fromRow.push(u);
    }
  }
  return fromRow;
}

/**
 * Ensures adapter input includes pictures from marketplace_items_raw row columns.
 */
export function prepareAdapterPayload(
  marketplaceName: string,
  payload: unknown,
): unknown {
  if (payload == null || typeof payload !== 'object') return payload;
  const raw = payload as Record<string, unknown>;

  const hasDataKey =
    'data' in raw && raw.data != null && typeof raw.data === 'object';
  const data = (hasDataKey ? raw.data : raw) as Record<string, unknown>;
  const rowPictures = Array.isArray(raw.pictures) ? raw.pictures : [];

  const rowVariations = Array.isArray(raw.variations) ? raw.variations : [];

  if (isMercadoLivreChannel(marketplaceName)) {
    const item: Record<string, unknown> = { ...data };
    const inData = Array.isArray(item.pictures) ? item.pictures : [];
    if (inData.length === 0 && rowPictures.length > 0) {
      item.pictures = normalizeMlPictureEntries(rowPictures);
    }
    const inDataVars = Array.isArray(item.variations) ? item.variations : [];
    if (inDataVars.length === 0 && rowVariations.length > 0) {
      item.variations = rowVariations;
    }
    const rowAttrs = Array.isArray(raw.attributes) ? raw.attributes : [];
    const inDataAttrs = Array.isArray(item.attributes) ? item.attributes : [];
    if (inDataAttrs.length === 0 && rowAttrs.length > 0) {
      item.attributes = rowAttrs;
    }
    if (hasDataKey) return { ...raw, data: item };
    return item;
  }

  if (isShopeeChannel(marketplaceName)) {
    const shopee: Record<string, unknown> = { ...data };
    const sourceForUrls = hasDataKey ? raw : shopee;
    const urls = extractShopeeImageUrlList(sourceForUrls);
    if (urls.length > 0) {
      const base = (shopee.base_info ?? {}) as Record<string, unknown>;
      const image = (base.image ?? {}) as Record<string, unknown>;
      const existing = Array.isArray(image.image_url_list) ? image.image_url_list : [];
      if (existing.length === 0) {
        shopee.base_info = {
          ...base,
          image: { ...image, image_url_list: urls },
        };
      }
    }
    const modelList = Array.isArray(shopee.model_list) ? shopee.model_list : [];
    if (modelList.length === 0 && rowVariations.length > 0) {
      shopee.model_list = rowVariations;
    }
    let base = (shopee.base_info ?? {}) as Record<string, unknown>;
    const rowAttrs = Array.isArray(raw.attributes) ? raw.attributes : [];
    const baseAttrs = Array.isArray(base.attribute_list) ? base.attribute_list : [];
    if (baseAttrs.length === 0 && rowAttrs.length > 0) {
      base = { ...base, attribute_list: rowAttrs };
    }
    const rowLogistics = Array.isArray(raw.shipping_types) ? raw.shipping_types : [];
    const baseLogistics = Array.isArray(base.logistic_info) ? base.logistic_info : [];
    if (baseLogistics.length === 0 && rowLogistics.length > 0) {
      base = { ...base, logistic_info: rowLogistics };
    }
    if (base !== shopee.base_info) {
      shopee.base_info = base;
    }
    if (raw.performance_data && !shopee.content_diagnosis_result) {
      shopee.content_diagnosis_result = raw.performance_data;
    }
    if (raw.item_perfomance && !shopee.extra_info) {
      shopee.extra_info = raw.item_perfomance;
    }
    if (hasDataKey) return { ...raw, data: shopee };
    return shopee;
  }

  return payload;
}
