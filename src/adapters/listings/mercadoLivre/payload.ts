import type { NormalizedDraft } from '../types';
import { parsePriceToNumber } from '../shared/priceParse';

// ─── Build ML publish payload ─────────────────────────────────────────────────

export function buildMLPublishPayload(draft: NormalizedDraft): any {
  const priceNum = parsePriceToNumber(draft.price);
  const hasVariations = (draft.variations || []).length > 0;

  // Build sanitized variations
  const sanitizedVariations = hasVariations
    ? draft.variations.map((v) => {
        let combos = Array.isArray(v.attribute_combinations)
          ? v.attribute_combinations.filter((c) => !!c?.id && (!!c?.value_id || !!c?.value_name))
          : [];
        // Category MLB33388 (Tênis) — filter noisy attributes from combinations
        if (String(draft.categoryId).toUpperCase() === 'MLB33388') {
          const bad = new Set(['GTIN', 'DETAILED_MODEL', 'MAIN_COLOR', 'SELLER_SKU']);
          combos = combos.filter((c) => !bad.has(String(c?.id || '').toUpperCase()));
        }
        const qty = Number(v.available_quantity) || 0;
        const obj: any = { attribute_combinations: combos, available_quantity: qty };
        if (priceNum) obj.price = priceNum;
        const varAttrs = Array.isArray(v.attributes)
          ? v.attributes.filter(
              (a) =>
                !!a?.id &&
                (!!a?.value_id || !!a?.value_name || !!a?.value_struct) &&
                String(a?.id || '').toUpperCase() !== 'MAIN_COLOR',
            )
          : [];
        if (varAttrs.length > 0) obj.attributes = varAttrs;
        return obj;
      })
    : [];

  // Normalize ITEM_CONDITION to ML accepted values
  const condAttr = (draft.attributes || []).find((x) => String(x?.id || '').toUpperCase() === 'ITEM_CONDITION');
  let normalizedCondition: string | undefined;
  if (condAttr) {
    const vid = String(condAttr?.value_id || '');
    const vname = String(condAttr?.value_name || '').toLowerCase();
    if (vid === '2230284' || /\bnovo\b|\bnew\b/.test(vname)) normalizedCondition = 'new';
    else if (vid === '2230581' || /\busado\b|\bused\b/.test(vname)) normalizedCondition = 'used';
    else if (vid === '2230580' || /\bn[aã]o\s*especificado\b|\bnot\s*specified\b/.test(vname)) normalizedCondition = 'not_specified';
    else if (/\brecondicionad[oa]\b|\brefurbished\b/.test(vname)) normalizedCondition = 'refurbished';
  }

  const payload: any = {
    site_id: draft.siteId,
    title: draft.title,
    category_id: draft.categoryId,
    currency_id: draft.currencyId,
    pictures: (draft.pictures as string[]).slice(0, 6).map((url) => ({ source: url })),
  };

  const supportedConditions = new Set(['new', 'used', 'not_specified', 'refurbished']);
  if (normalizedCondition && supportedConditions.has(normalizedCondition)) {
    payload.condition = normalizedCondition;
    payload.attributes = draft.attributes.filter((x) => String(x?.id || '').toUpperCase() !== 'ITEM_CONDITION');
  } else {
    payload.attributes = [...draft.attributes];
  }

  if (sanitizedVariations.length > 0) payload.variations = sanitizedVariations;
  if (!hasVariations && draft.availableQuantity) payload.available_quantity = draft.availableQuantity;
  if (!hasVariations && priceNum) payload.price = priceNum;
  if (draft.listingTypeId) payload.listing_type_id = draft.listingTypeId;

  // Shipping: include dimensions as ME2 requires integer cm/g
  if (draft.shipping && Object.keys(draft.shipping).length > 0) {
    const dimsObj = draft.shipping?.dimensions || null;
    const w = dimsObj?.width || 0;
    const h = dimsObj?.height || 0;
    const l = dimsObj?.length || 0;
    const weight = draft.shipping?.weight || 0;
    const ih = Math.round(h), il = Math.round(l), iw = Math.round(w), ig = Math.round(weight);

    const sellerAttrs: any[] = [];
    if (ih > 0) sellerAttrs.push({ id: 'SELLER_PACKAGE_HEIGHT', value_name: `${ih} cm` });
    if (il > 0) sellerAttrs.push({ id: 'SELLER_PACKAGE_LENGTH', value_name: `${il} cm` });
    if (iw > 0) sellerAttrs.push({ id: 'SELLER_PACKAGE_WIDTH', value_name: `${iw} cm` });
    if (ig > 0) sellerAttrs.push({ id: 'SELLER_PACKAGE_WEIGHT', value_name: `${ig} g` });

    if (sellerAttrs.length > 0) {
      const baseAttrs = (payload.attributes || []).filter(
        (x: any) =>
          !/^(SELLER_PACKAGE_HEIGHT|SELLER_PACKAGE_LENGTH|SELLER_PACKAGE_WIDTH|SELLER_PACKAGE_WEIGHT)$/i.test(
            String(x?.id || ''),
          ),
      );
      payload.attributes = [...baseAttrs, ...sellerAttrs];
    }

    const dimsStr = il && ih && iw && ig ? `${il}x${ih}x${iw},${ig}` : undefined;
    const ship: any = {};
    if (draft.shipping?.mode) ship.mode = draft.shipping.mode;
    if (typeof draft.shipping?.local_pick_up !== 'undefined') ship.local_pick_up = !!draft.shipping.local_pick_up;
    if (typeof draft.shipping?.free_shipping !== 'undefined') ship.free_shipping = !!draft.shipping.free_shipping;
    if (dimsStr) ship.dimensions = dimsStr;

    // Validate mode against available modes
    if (ship.mode && Array.isArray(draft.shippingModesAvailable) && draft.shippingModesAvailable.length > 0) {
      const mm = String(ship.mode || '').toLowerCase();
      const avail = draft.shippingModesAvailable.map((m) => String(m).toLowerCase());
      if (!avail.includes(mm)) ship.mode = avail.includes('me2') ? 'me2' : draft.shippingModesAvailable[0];
    }
    payload.shipping = ship;
  }

  if (draft.saleTerms.length > 0) payload.sale_terms = draft.saleTerms;
  if (draft.preferFlex) payload.sellerShippingPreferences = { prefer_flex: true };

  return payload;
}
