// SIZE EXCEPTION (§1 ENGINEERING_STANDARDS.md): VariationItem interface + formatVariationData + two SKU helpers form a single cohesive unit; 4 lines over 150 limit.
export interface VariationItem {
  id: string | number;
  sku: string;
  available_quantity: number;
  seller_stock_total: number;
  types: Array<{ name: string; value: string }>;
  price: number;
  current_price?: number;
  original_price?: number;
  image: string;
}

export function formatVariationData(variations: any[], itemRow?: any): VariationItem[] {
  if (!Array.isArray(variations) || variations.length === 0) return [];
  const picsArr = Array.isArray(itemRow?.pictures) ? itemRow.pictures : [];
  const fallbackImage =
    picsArr.length > 0
      ? typeof picsArr[0] === "string"
        ? picsArr[0]
        : picsArr[0]?.url || "/placeholder.svg"
      : itemRow?.thumbnail || "/placeholder.svg";

  return variations.map((variation, index) => {
    const attributes = Array.isArray(variation.attribute_combinations)
      ? variation.attribute_combinations
      : Array.isArray(variation.attributes)
      ? variation.attributes.map((a: any) => ({
          id: a.id ?? a.attribute_id,
          name: a.name ?? a.attribute_name,
          value_name: a.value_name ?? a.value,
        }))
      : [];
    const types =
      attributes.length > 0
        ? attributes.map((attr: any) => ({
            name: attr.name || attr.id || "Tipo",
            value: attr.value_name || attr.value || "N/A",
          }))
        : (() => {
            const vname = String(variation?.model_name || variation?.name || "").trim();
            return vname ? [{ name: "Variação", value: vname }] : [];
          })();

    let imageUrl: string | null = variation?.image_url ?? null;
    const pictureIds = Array.isArray(variation?.picture_ids)
      ? variation.picture_ids
      : variation?.picture_id
      ? [variation.picture_id]
      : [];
    if (pictureIds.length > 0) {
      const pid = pictureIds[0];
      const match = picsArr.find(
        (p: any) => typeof p !== "string" && String(p?.id || p?.picture_id) === String(pid),
      );
      imageUrl = typeof match === "string" ? match : match?.url || match?.secure_url || null;
    }
    if (!imageUrl) imageUrl = fallbackImage;

    const pi0 = Array.isArray((variation as any)?.price_info) ? (variation as any).price_info[0] : null;
    const cpCandidate = Number(
      pi0?.current_price ??
        pi0?.inflated_price_of_current_price ??
        (variation as any)?.current_price ??
        NaN,
    );
    const opCandidate = Number(
      pi0?.original_price ??
        pi0?.inflated_price_of_original_price ??
        (variation as any)?.original_price ??
        NaN,
    );
    const cp = Number.isFinite(cpCandidate) ? cpCandidate : undefined;
    const op = Number.isFinite(opCandidate) ? opCandidate : undefined;
    const priceFallback =
      typeof (variation as any)?.price === "number" ? (variation as any).price : undefined;

    const availSummary = Number(
      (variation as any)?.stock_info_v2?.summary_info?.total_available_stock ?? NaN,
    );
    const availableQty = Number.isFinite(availSummary)
      ? availSummary
      : Number((variation as any)?.available_quantity) || 0;

    let sellerTotal: number | null = null;
    const sellerInfoList = Array.isArray((variation as any)?.stock_info_v2?.seller_stock)
      ? (variation as any).stock_info_v2.seller_stock
      : null;
    if (sellerInfoList) {
      sellerTotal = sellerInfoList.reduce(
        (acc: number, it: any) => acc + (Number(it?.stock || 0) || 0),
        0,
      );
    }
    const sellerStockRaw = (variation as any)?.seller_stock;
    if (typeof sellerStockRaw === "number" && Number.isFinite(sellerStockRaw)) {
      sellerTotal = Number(sellerStockRaw);
    } else if (Array.isArray(sellerStockRaw)) {
      sellerTotal = sellerStockRaw.reduce((acc: number, it: any) => {
        const val = typeof it === "number" ? it : Number(it?.stock || 0);
        return acc + (Number.isFinite(val) ? val : 0);
      }, 0);
    } else if (typeof (variation as any)?.stock === "object" && (variation as any).stock) {
      const s = (variation as any).stock;
      if (typeof s?.seller_stock === "number" && Number.isFinite(s?.seller_stock))
        sellerTotal = Number(s.seller_stock);
      else if (Array.isArray(s?.seller_stock))
        sellerTotal = s.seller_stock.reduce(
          (acc: number, it: any) => acc + (Number(it?.stock || 0) || 0),
          0,
        );
      else if (Array.isArray(s?.seller_stock_list))
        sellerTotal = s.seller_stock_list.reduce(
          (acc: number, it: any) => acc + (Number(it?.stock || 0) || 0),
          0,
        );
    }

    return {
      id: variation.model_id || variation.variation_id || variation.id || `var-${index}`,
      sku: variation.model_sku || variation.seller_sku || variation.sku || "N/A",
      available_quantity: availableQty,
      seller_stock_total: Number.isFinite(Number(sellerTotal)) ? Number(sellerTotal) : availableQty,
      types,
      price: cp ?? op ?? priceFallback ?? 0,
      current_price: cp ?? priceFallback,
      original_price: op,
      image: imageUrl || fallbackImage,
    };
  });
}

/** Variation SKU from raw item row (same ids as formatVariationData) for LinkPicker Auto-Match */
export function getVariationSkuFromItemRow(itemRow: any, variationId?: string): string | undefined {
  if (!variationId || !itemRow) return undefined;
  const vars = formatVariationData(
    Array.isArray(itemRow.variations) ? itemRow.variations : [],
    itemRow,
  );
  const row = vars.find((x) => String(x.id) === String(variationId));
  const sku = row?.sku;
  if (!sku || sku === "N/A") return undefined;
  return String(sku).trim();
}

/** Attribute values for name-based Auto-Match hints */
export function getVariationMatchHintsFromItemRow(itemRow: any, variationId?: string): string[] {
  if (!variationId || !itemRow) return [];
  const vars = formatVariationData(
    Array.isArray(itemRow.variations) ? itemRow.variations : [],
    itemRow,
  );
  const row = vars.find((x) => String(x.id) === String(variationId));
  return row?.types?.map((t) => String(t.value || "").trim()).filter(Boolean) || [];
}
