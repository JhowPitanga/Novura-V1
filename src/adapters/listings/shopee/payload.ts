import type { NormalizedDraft } from '../types';
import { parsePriceToNumber } from '../shared/priceParse';

/** Build Shopee publish payload from normalized draft. */
export function buildShopeePublishPayload(draft: NormalizedDraft): any {
  const priceNum = parsePriceToNumber(draft.price);

  // Only accept HTTP/S URLs (already uploaded)
  const imageUrlList = (draft.pictures as string[])
    .slice(0, 9)
    .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));

  // Weight: Shopee accepts kg
  const weightKg = (() => {
    const w = Number(draft.shipping?.weight || 0);
    if (!Number.isFinite(w) || w <= 0) return undefined;
    // If value seems to be in grams (> 50 raw), convert; otherwise treat as kg already
    return w > 50 ? w / 1000 : w;
  })();

  const dim = draft.shipping?.dimensions || {};
  const pkgHeight = Number(dim?.height || draft.shipping?.height || 0);
  const pkgLength = Number(dim?.length || draft.shipping?.length || 0);
  const pkgWidth = Number(dim?.width || draft.shipping?.width || 0);

  // Build tier_variation and model_list from normalized variations
  const models = (() => {
    if (!draft.variationsEnabled || !Array.isArray(draft.variations) || draft.variations.length === 0) return null;

    const variationAttrs = draft.variationAttrs || [];
    const uniqueComboIds = Array.from(
      new Set<string>(
        draft.variations.flatMap((v) =>
          (Array.isArray(v.attribute_combinations) ? v.attribute_combinations : []).map((c) => String(c?.id || '')),
        ).filter(Boolean),
      ),
    );
    const orderedIds = variationAttrs
      .map((a) => String(a?.id || ''))
      .filter((id) => uniqueComboIds.includes(id));

    const tiers = orderedIds.map((id) => {
      const name = String(variationAttrs.find((a) => String(a?.id || '') === id)?.name || id);
      const optsSet = new Set<string>();
      draft.variations.forEach((v) => {
        const cur = (Array.isArray(v.attribute_combinations) ? v.attribute_combinations : []).find(
          (c) => String(c?.id || '') === id,
        );
        const text = String(cur?.value_name || cur?.value_id || '').trim();
        if (text) optsSet.add(text);
      });
      return { name, option_list: Array.from(optsSet).map((t) => ({ option_text: t })) };
    });

    const model_list = draft.variations.map((v) => {
      const combos = Array.isArray(v.attribute_combinations) ? v.attribute_combinations : [];
      const tier_index = orderedIds.map((id, idx) => {
        const cur = combos.find((c) => String(c?.id || '') === id);
        const text = String(cur?.value_name || cur?.value_id || '').trim();
        const i = (tiers[idx]?.option_list || []).findIndex((o) => String(o?.option_text || '') === text);
        return i >= 0 ? i : 0;
      });
      const skuAttr = (Array.isArray(v.attributes) ? v.attributes : []).find(
        (a) => String(a?.id || '').toUpperCase() === 'SELLER_SKU',
      );
      const model_sku = String(skuAttr?.value_name || '') || undefined;
      const varPriceNum = parsePriceToNumber(String(v.price || draft.price));
      return {
        tier_index,
        model_sku,
        price: varPriceNum || priceNum || 0,
        normal_stock: Math.max(0, Number(v.available_quantity) || 0),
      };
    });

    return { tiers, model_list };
  })();

  const payload: any = {
    category_id: Number(draft.categoryId) || 0,
    item_name: draft.title,
    attributes: draft.attributes || [],
    original_price: priceNum || undefined,
    description: draft.description,
    image: imageUrlList.length ? { image_url_list: imageUrlList } : undefined,
    weight: weightKg,
    dimension:
      pkgHeight && pkgLength && pkgWidth
        ? { package_height: pkgHeight, package_length: pkgLength, package_width: pkgWidth }
        : undefined,
    item_status: 'UNLIST',
  };

  if (models && Array.isArray(models.model_list) && models.model_list.length > 0) {
    payload.tier_variation = models.tiers;
    payload.model_list = models.model_list;
  }

  return payload;
}
