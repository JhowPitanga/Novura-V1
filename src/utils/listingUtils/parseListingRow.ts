// SIZE EXCEPTION (§1 ENGINEERING_STANDARDS.md): This module intentionally
// exceeds the 200-line limit. It holds the full listing row parser which cannot
// be split without losing the canonical/legacy dispatch logic and helper
// functions (isCanonicalListingRow, qualityLevelToPercent, canonicalLogisticToTag,
// parseCanonicalListingRow) that are tightly coupled to parseListingRow.
import type { ListingItem, ShippingCaps } from "@/types/listings";
import { resolveShippingTags } from "./shipping";
import { translatePauseReason, toPublicationLabel } from "./translations";
import { qualityLevelForGauge } from "./quality";

export interface ParseListingRowContext {
  metricsByItemId: Record<string, { quality_level?: string | null; performance_data?: any }>;
  listingTypeByItemId: Record<string, string | null>;
  shippingTypesByItemId: Record<string, string[]>;
  listingPricesByItemId: Record<string, any>;
  shippingCaps: ShippingCaps | null;
}

function isCanonicalListingRow(row: any): boolean {
  return (
    row != null &&
    typeof row === "object" &&
    row.marketplace_item_id != null &&
    (row.shipping != null || row.metrics != null || row.quality != null)
  );
}

function canonicalLogisticToTag(t: string): string {
  const x = String(t || "").toLowerCase();
  if (x === "shopee_xpress") return "xpress";
  return x;
}

function qualityLevelToPercent(
  level: string | null | undefined,
  score: number | null | undefined,
): number {
  if (score != null && Number.isFinite(Number(score))) {
    const n = Number(score);
    return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
  }
  const map: Record<string, number> = {
    excellent: 100,
    good: 76,
    medium: 50,
    low: 25,
    incomplete: 10,
    unknown: 0,
  };
  return map[String(level || "").toLowerCase()] ?? 0;
}

function parseCanonicalListingRow(row: any, ctx: ParseListingRowContext): ListingItem {
  const idVal = String(row?.marketplace_item_id || row?.id || "");
  const shipping = row?.shipping ?? {};
  const metrics = row?.metrics ?? {};
  const quality = row?.quality ?? {};
  const fees = row?.fees ?? {};

  const pics = Array.isArray(row?.pictures) ? row.pictures : [];
  const firstPic =
    row?.thumbnail_url || (pics[0]?.secure_url || pics[0]?.url) || "/placeholder.svg";

  const priceNum = typeof row?.price === "number" ? row.price : Number(row?.price) || 0;
  const originalPrice = row?.original_price != null ? Number(row.original_price) : null;
  const promoPrice = row?.promo_price != null ? Number(row.promo_price) : null;

  let shippingTags: string[] = [];
  if (Array.isArray(shipping?.logistic_types) && shipping.logistic_types.length) {
    shippingTags = shipping.logistic_types.map((t: string) => canonicalLogisticToTag(t));
  } else if (shipping?.logistic_type) {
    shippingTags = [canonicalLogisticToTag(shipping.logistic_type)];
  }
  if (ctx.shippingCaps && shippingTags.length) {
    const has = (v?: boolean) => v === undefined || v === true;
    shippingTags = shippingTags.filter((t) => {
      if (t === "full") return has(ctx.shippingCaps!.full);
      if (t === "flex") return has(ctx.shippingCaps!.flex);
      if (t === "envios") return has(ctx.shippingCaps!.envios);
      if (t === "correios") return has(ctx.shippingCaps!.correios);
      return true;
    });
  }

  const listingTypeId = row?.listing_type_id ? String(row.listing_type_id) : null;
  const publicationTypeLabel = toPublicationLabel(listingTypeId);

  const commission = Number(fees?.commission_amount ?? fees?.total_fees_estimated ?? 0);
  const shippingSubsidy = Number(fees?.shipping_subsidy ?? 0);
  const publicationCosts = {
    currency: String(fees?.currency || "BRL"),
    commission,
    shippingCost: shippingSubsidy,
    tax: 0,
    total: commission + shippingSubsidy,
  };
  const publicationFeeDetails = {
    currency: String(fees?.currency || "BRL"),
    percentage: fees?.commission_percentage ?? null,
    fixedFee: fees?.commission_fixed_fee ?? null,
    grossAmount: fees?.total_fees_estimated ?? null,
  };

  const qualityPercent = qualityLevelToPercent(quality?.quality_level, quality?.quality_score);
  const persistedLevel =
    qualityLevelForGauge(quality?.quality_level, row?.marketplace_name) ??
    quality?.quality_level ??
    null;

  const visitsVal = Number(metrics?.visits_total ?? 0);
  const salesVal = Number(metrics?.sales_total ?? row?.sold_quantity ?? 0);
  const likesVal = Number(metrics?.likes_total ?? 0);
  const stockVal = Number(row?.available_quantity ?? 0);

  const displayStatus = String(row?.status_raw || row?.status || "");

  const convRaw = Number(metrics?.conversion_rate ?? 0);
  const conversionPct =
    convRaw > 0 && convRaw <= 1
      ? convRaw * 100
      : convRaw > 1
      ? convRaw
      : visitsVal > 0
      ? (salesVal / visitsVal) * 100
      : 0;

  return {
    id: idVal,
    title: row?.title || "Sem título",
    sku: row?.sku || "",
    marketplace: String(row?.marketplace_name || "Mercado Livre"),
    price: priceNum,
    originalPrice: originalPrice && originalPrice > priceNum ? originalPrice : null,
    promoPrice: promoPrice ?? (originalPrice && originalPrice > priceNum ? priceNum : null),
    status: displayStatus,
    visits: visitsVal,
    questions: 0,
    sales: salesVal,
    likes: likesVal,
    stock: stockVal,
    marketplaceId: idVal,
    integrationId: row?.integration_id ?? null,
    image: firstPic,
    shippingTags,
    quality: Math.round(qualityPercent),
    qualityLevel: persistedLevel,
    performanceData: {
      quality_level: persistedLevel,
      unfinished_tasks: quality?.unfinished_tasks,
    },
    conversion: conversionPct,
    pauseReason: row?.pause_reason ? translatePauseReason(String(row.pause_reason)) : null,
    publicationType: publicationTypeLabel,
    publicationCosts,
    publicationFeeDetails,
    permalink: row?.permalink || null,
    fulfillmentQty: null,
    fulfillmentWarehouseName: null,
  };
}

/** Transform a raw DB row into an enriched ListingItem for display. */
export function parseListingRow(row: any, ctx: ParseListingRowContext): ListingItem {
  if (isCanonicalListingRow(row)) {
    return parseCanonicalListingRow(row, ctx);
  }
  const idVal = String(row?.marketplace_item_id || row?.id || "");
  const mktLower = String(row?.marketplace_name || "").toLowerCase();

  // Image
  const pics = Array.isArray(row?.pictures) ? row.pictures : [];
  const firstPic =
    pics.length > 0
      ? typeof pics[0] === "string"
        ? pics[0]
        : pics[0]?.url || "/placeholder.svg"
      : row?.thumbnail || "/placeholder.svg";

  // SKU
  let derivedSku = row?.sku || "";
  if (!derivedSku && Array.isArray(row?.variations) && row.variations.length > 0) {
    const bySellerSku = row.variations.find((v: any) => v?.seller_sku);
    if (bySellerSku?.seller_sku) {
      derivedSku = bySellerSku.seller_sku;
    } else {
      const withAttr = row.variations.find((v: any) => Array.isArray(v?.attribute_combinations));
      const skuAttr = withAttr?.attribute_combinations?.find(
        (a: any) => a?.id === "SELLER_SKU" || a?.name?.toUpperCase() === "SKU",
      );
      if (skuAttr?.value_name) derivedSku = skuAttr.value_name;
    }
  }

  // Price
  const priceNum = typeof row?.price === "number" ? row.price : Number(row?.price) || 0;
  let originalPrice: number | null = null;
  let promoPrice: number | null = null;
  if (mktLower === "shopee") {
    const pp = typeof (row as any)?.promotion_price === "number" ? (row as any).promotion_price : null;
    promoPrice = pp;
    originalPrice = pp != null ? priceNum : null;
  } else {
    const op = Number((row as any)?.original_price) || null;
    const hasPromo = !!op && op > priceNum;
    originalPrice = hasPromo ? op : null;
    promoPrice = hasPromo ? priceNum : null;
  }

  // Shipping tags
  let shippingTags = resolveShippingTags(row, ctx.shippingCaps);
  if (mktLower === "shopee") {
    const st = ctx.shippingTypesByItemId[idVal] || [];
    if (Array.isArray(st) && st.length) {
      shippingTags = Array.from(new Set(st));
    }
  }

  // Publication type
  const listingTypeIdForItem = ctx.listingTypeByItemId[idVal] || null;
  const publicationTypeLabel = toPublicationLabel(listingTypeIdForItem);

  // Publication costs
  const publicationCosts = {
    currency: String((row as any)?.publication_currency || "BRL"),
    commission: Number((row as any)?.total_fare || 0),
    shippingCost: Number((row as any)?.publication_shipping_cost || 0),
    tax: 0,
    total:
      Number((row as any)?.total_fare || 0) + Number((row as any)?.publication_shipping_cost || 0),
  };
  const publicationFeeDetails = {
    currency: String((row as any)?.publication_currency || "BRL"),
    percentage: (row as any)?.percentage_fee ?? null,
    fixedFee: (row as any)?.fixed_fee ?? null,
    grossAmount: (row as any)?.gross_amount ?? null,
  };

  // Quality
  const metricsForItem = ctx.metricsByItemId[idVal] || {};
  const pd = metricsForItem?.performance_data;
  let qualityPercent = 0;
  let persistedLevel = row?.quality_level ?? metricsForItem?.quality_level ?? null;

  if (mktLower === "shopee") {
    const rawLevel = pd?.quality_level ?? persistedLevel ?? null;
    const numLevel = typeof rawLevel === "number" ? rawLevel : Number(rawLevel);
    persistedLevel = Number.isFinite(numLevel) ? numLevel : null;
    qualityPercent = numLevel === 1 ? 50 : numLevel === 2 ? 76 : numLevel === 3 ? 100 : 0;
  } else {
    const scoreRaw = pd && !isNaN(Number(pd?.score)) ? Number(pd.score) : null;
    const rawCandidates = [
      scoreRaw,
      pd?.quality_score,
      pd?.listing_quality_percentage,
      pd?.listing_quality,
      row?.listing_quality,
      row?.quality_score,
    ];
    for (const v of rawCandidates) {
      const num = Number(v);
      if (!isNaN(num) && num >= 0) {
        qualityPercent = num <= 1 ? num * 100 : num;
        break;
      }
    }
    qualityPercent = Math.max(0, Math.min(100, qualityPercent));
  }

  // Pause reason
  let pauseReason: string | null = null;
  const dataRaw: any = row?.data;
  if (dataRaw && dataRaw.sub_status !== undefined && mktLower !== "shopee") {
    const first = Array.isArray(dataRaw.sub_status) ? dataRaw.sub_status[0] : dataRaw.sub_status;
    pauseReason = translatePauseReason(String(first));
  } else if (Array.isArray(row?.tags)) {
    const tag = (row.tags as any[]).find((t) => {
      const s = String(t || "").toLowerCase();
      return s.includes("paused") || s.includes("under_review") || s.includes("out_of_stock");
    });
    if (tag) pauseReason = translatePauseReason(String(tag));
  }

  // Metrics
  let visitsVal = Number(row?.visits_total ?? row?.visits ?? 0);
  let salesVal = Number(row?.sold_quantity ?? 0);
  let likesVal = 0;
  let stockVal = Number(row?.available_quantity ?? 0);

  if (mktLower === "shopee") {
    const ip = (row as any)?.item_perfomance || {}; // intentional typo: item_perfomance
    visitsVal = Number(ip?.views || 0);
    salesVal = Number(ip?.sale || 0);
    likesVal = Number(ip?.liked_count || ip?.like_count || ip?.likes || 0);
    if (Array.isArray(row?.variations) && row.variations.length > 0) {
      stockVal = row.variations.reduce((acc: number, v: any) => {
        const sellerInfoList = Array.isArray((v as any)?.stock_info_v2?.seller_stock)
          ? (v as any).stock_info_v2.seller_stock
          : null;
        if (sellerInfoList)
          return (
            acc + sellerInfoList.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0)
          );
        const raw = (v as any)?.seller_stock;
        if (typeof raw === "number" && Number.isFinite(raw)) return acc + Number(raw);
        if (Array.isArray(raw))
          return (
            acc +
            raw.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0)
          );
        if (typeof (v as any)?.stock === "object" && (v as any)?.stock) {
          const sv = (v as any).stock;
          if (typeof sv?.seller_stock === "number") return acc + Number(sv.seller_stock);
          if (Array.isArray(sv?.seller_stock))
            return (
              acc +
              sv.seller_stock.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0)
            );
          if (Array.isArray(sv?.seller_stock_list))
            return (
              acc +
              sv.seller_stock_list.reduce(
                (a: number, it: any) => a + (Number(it?.stock || 0) || 0),
                0,
              )
            );
        }
        const availSummary = Number(
          (v as any)?.stock_info_v2?.summary_info?.total_available_stock ?? NaN,
        );
        return acc + (Number.isFinite(availSummary) ? availSummary : Number((v as any)?.available_quantity) || 0);
      }, 0);
    }
  }

  return {
    id: idVal,
    title: row?.title || "Sem título",
    sku: derivedSku,
    marketplace: String(row?.marketplace_name || "Mercado Livre"),
    price: priceNum,
    originalPrice,
    promoPrice,
    status: row?.status || "",
    visits: visitsVal,
    questions: Number(row?.questions_total ?? row?.questions ?? 0),
    sales: salesVal,
    likes: likesVal,
    stock: stockVal,
    marketplaceId: row?.marketplace_item_id || "",
    integrationId: row?.integration_id ?? null,
    image: firstPic || "/placeholder.svg",
    shippingTags,
    quality: Math.round(qualityPercent),
    qualityLevel: persistedLevel,
    performanceData: pd,
    conversion: visitsVal > 0 ? (salesVal / visitsVal) * 100 : 0,
    pauseReason,
    publicationType: publicationTypeLabel,
    publicationCosts,
    publicationFeeDetails,
    permalink: row?.permalink || null,
    fulfillmentQty: null,
    fulfillmentWarehouseName: null,
  };
}

