// Shopee → canonical listing adapter.
// Transforms a raw Shopee item payload (as stored in marketplace_items_raw.data)
// into NormalizedListing.

import type {
  AdapterContext,
  CanonicalAttribute,
  CanonicalFees,
  CanonicalListing,
  CanonicalMetrics,
  CanonicalPicture,
  CanonicalQuality,
  CanonicalShipping,
  CanonicalVariation,
  ListingAdapter,
  NormalizedListing,
} from './types.ts';
import { mapShopeeStatus } from './shared/statusMapping.ts';
import { mapShopeeLogistics } from './shared/logisticMapping.ts';
import { mapShopeeQuality } from './shared/qualityMapping.ts';
import { parseShopeeDimensions } from './shared/dimensionsParse.ts';
import { resolveCanonicalFees } from './shared/feesResolve.ts';

// ---------------------------------------------------------------------------
// Raw Shopee payload shapes
// ---------------------------------------------------------------------------

interface ShopeeBaseInfo {
  item_id?: number | string;
  item_name?: string;
  item_status?: string;
  item_sku?: string;
  category_id?: number | string;
  price_info?: Array<{ current_price?: number; original_price?: number; inflated_price?: number }>;
  image?: { image_url_list?: string[]; image_id_list?: string[] };
  video_info?: Array<{ video_url?: string; thumbnail_url?: string; duration?: number }>;
  attribute_list?: Array<{
    attribute_id?: number | string;
    attribute_name?: string;
    attribute_value_list?: Array<{ value_id?: number | string; original_value?: string }>;
    is_mandatory?: boolean;
    input_validation_type?: string;
  }>;
  logistic_info?: Array<{
    logistic_id?: number | string;
    logistic_name?: string;
    enabled?: boolean;
    is_free?: boolean;
    is_fulfillment_by_shopee?: boolean;
    shipping_fee?: number;
    shipping_fee_subsidy?: number;
  }>;
  dimension?: {
    package_length?: number;
    package_width?: number;
    package_height?: number;
  };
  weight?: number;    // in grams
  has_model?: boolean;
  condition?: string;
  stock_info_v2?: { seller_stock?: Array<{ stock?: number }>; summary_info?: { total_available_stock?: number } };
  commission_fee?: number;
  commission_rate?: number;
}

interface ShopeeExtraInfo {
  views?: number;
  likes?: number;
  sale?: number;
  comment_count?: number;
  rating_star?: number;
}

interface ShopeeContentDiagnosis {
  quality_level?: string;
  unfinished_task?: unknown[];
  missing_mandatory?: string[];
}

interface ShopeeModel {
  model_id?: number | string;
  model_sku?: string;
  price_info?: Array<{ current_price?: number; original_price?: number }>;
  stock_info_v2?: {
    seller_stock?: Array<{ stock?: number }>;
    summary_info?: { total_available_stock?: number };
  };
  tier_variation_index?: number[];
  image?: { image_url?: string };
}

interface ShopeePayload {
  base_info?: ShopeeBaseInfo;
  extra_info?: ShopeeExtraInfo;
  content_diagnosis_result?: ShopeeContentDiagnosis;
  item_promotion?: unknown;
  model_list?: ShopeeModel[];
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

function normalizeShopeeItem(payload: unknown, ctx: AdapterContext): NormalizedListing {
  const raw = payload as Record<string, unknown>;

  // The payload may be nested under raw.data (from marketplace_items_raw)
  const shopee: ShopeePayload =
    (raw['data'] as ShopeePayload) ?? (raw as unknown as ShopeePayload);

  const base = shopee.base_info ?? {};
  const extra = shopee.extra_info ?? {};
  const diagnosis = shopee.content_diagnosis_result ?? {};
  const models = shopee.model_list ?? [];

  const itemId = String(base.item_id ?? raw['marketplace_item_id'] ?? '');

  // -------------------------------------------------------------------------
  // Price — use base price_info, fall back to first model
  // -------------------------------------------------------------------------
  const priceInfo = Array.isArray(base.price_info) ? base.price_info[0] : null;
  const price = priceInfo?.current_price ?? models[0]?.price_info?.[0]?.current_price ?? null;
  const originalPrice =
    priceInfo?.original_price ?? models[0]?.price_info?.[0]?.original_price ?? null;

  // -------------------------------------------------------------------------
  // Stock
  // -------------------------------------------------------------------------
  const totalStock =
    base.stock_info_v2?.summary_info?.total_available_stock ??
    (base.stock_info_v2?.seller_stock ?? []).reduce((acc, s) => acc + (s.stock ?? 0), 0) ??
    0;

  // -------------------------------------------------------------------------
  // Listing core
  // -------------------------------------------------------------------------
  const thumbnail = base.image?.image_url_list?.[0] ?? null;

  const listing: CanonicalListing = {
    marketplace_name: 'Shopee',
    marketplace_item_id: itemId,
    title: base.item_name ?? '',
    sku: base.item_sku ?? null,
    category_id: base.category_id != null ? String(base.category_id) : null,
    category_path: null,
    permalink: null,
    thumbnail_url: thumbnail,
    has_variations: base.has_model === true && models.length > 0,
    condition: normalizeShopeeCondition(base.condition),

    status: mapShopeeStatus(base.item_status),
    status_raw: base.item_status ?? '',
    sub_status: [],
    pause_reason: null,

    price: price ?? null,
    original_price: originalPrice ?? null,
    promo_price: null,
    currency: 'BRL',

    available_quantity: totalStock,
    sold_quantity: extra.sale ?? 0,

    listing_type_id: null,
    catalog_listing: null,
    catalog_product_id: null,

    marketplace_created_at: null,
    marketplace_updated_at: raw['updated_at'] as string ?? null,
  };

  // -------------------------------------------------------------------------
  // Variations
  // -------------------------------------------------------------------------
  const variations: CanonicalVariation[] = models.map((m, i) => {
    const varStock =
      m.stock_info_v2?.summary_info?.total_available_stock ??
      (m.stock_info_v2?.seller_stock ?? []).reduce((acc, s) => acc + (s.stock ?? 0), 0) ??
      0;

    return {
      variation_id: String(m.model_id ?? i),
      sku: m.model_sku ?? null,
      price: m.price_info?.[0]?.current_price ?? null,
      original_price: m.price_info?.[0]?.original_price ?? null,
      promo_price: null,
      available_quantity: varStock,
      sold_quantity: 0,
      image_url: m.image?.image_url ?? null,
      attributes: [],  // tier variation names resolved at display layer
      primary_for_listing: i === 0,
    };
  });

  // -------------------------------------------------------------------------
  // Pictures
  // -------------------------------------------------------------------------
  const pictures: CanonicalPicture[] = (base.image?.image_url_list ?? []).map((url, idx) => ({
    external_picture_id: base.image?.image_id_list?.[idx] ?? null,
    url,
    secure_url: null,
    position: idx,
    is_video: false,
    video_url: null,
    variation_id: null,
  }));

  // Videos
  for (const v of base.video_info ?? []) {
    if (v.video_url) {
      pictures.push({
        external_picture_id: null,
        url: v.thumbnail_url ?? v.video_url,
        secure_url: null,
        position: pictures.length,
        is_video: true,
        video_url: v.video_url,
        variation_id: null,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Attributes
  // -------------------------------------------------------------------------
  const attributes: CanonicalAttribute[] = (base.attribute_list ?? []).map((a) => {
    const firstVal = a.attribute_value_list?.[0];
    return {
      attribute_id: String(a.attribute_id ?? ''),
      attribute_name: a.attribute_name ?? null,
      value_id: firstVal?.value_id != null ? String(firstVal.value_id) : null,
      value_name: firstVal?.original_value ?? null,
      value_struct: null,
      is_required: a.is_mandatory ?? null,
      is_variation_attr: false,
    };
  });

  // -------------------------------------------------------------------------
  // Shipping
  // -------------------------------------------------------------------------
  const dims = parseShopeeDimensions(base.dimension, base.weight);
  const { logisticType, logisticTypes } = mapShopeeLogistics(
    base.logistic_info as Parameters<typeof mapShopeeLogistics>[0],
  );

  const hasFreeShipping = (base.logistic_info ?? []).some((l) => l.is_free);

  const shipping: CanonicalShipping = {
    logistic_type: logisticType,
    logistic_types: logisticTypes,
    shipping_mode: 'shopee_logistics',
    free_shipping: hasFreeShipping,
    mandatory_free_shipping: false,
    local_pick_up: (base.logistic_info ?? []).some((l) =>
      (l.logistic_name ?? '').toLowerCase().includes('retire') ||
      (l.logistic_name ?? '').toLowerCase().includes('retirada'),
    ),
    package_length_cm: dims.length_cm,
    package_width_cm: dims.width_cm,
    package_height_cm: dims.height_cm,
    package_weight_g: dims.weight_g,
  };

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------
  const views = extra.views ?? 0;
  const sales = extra.sale ?? 0;
  const conversionRate = views > 0 ? sales / views : 0;

  const metrics: CanonicalMetrics = {
    visits_total: views,
    visits_last_30_days: views,   // Shopee exposes only a running total
    impressions: null,
    sales_total: sales,
    sales_last_30_days: null,
    conversion_rate: conversionRate,
    likes_total: extra.likes ?? 0,
    comments_total: extra.comment_count ?? 0,
    rating_average: extra.rating_star ?? null,
    reviews_count: extra.comment_count ?? 0,
  };

  // -------------------------------------------------------------------------
  // Quality
  // -------------------------------------------------------------------------
  const quality: CanonicalQuality = {
    quality_score: null,
    quality_level: mapShopeeQuality(diagnosis.quality_level),
    missing_attributes: diagnosis.missing_mandatory ?? [],
    unfinished_tasks: diagnosis.unfinished_task ?? [],
  };

  // -------------------------------------------------------------------------
  // Fees (universal resolver: payload + category rules + order history)
  // -------------------------------------------------------------------------
  const fees: CanonicalFees = resolveCanonicalFees({
    marketplaceName: 'Shopee',
    salePrice: price ?? null,
    payloadVersion: ctx.payloadVersion ?? null,
    shopeePayload: {
      commission_fee: base.commission_fee ?? null,
      commission_rate: base.commission_rate ?? null,
      logistic_info: base.logistic_info,
    },
    feeRule: ctx.extra?.feeRule ?? null,
    observedAvgCommissionAmount: ctx.extra?.observedAvgCommissionAmount ?? null,
    observedAvgCommissionPercentage: ctx.extra?.observedAvgCommissionPercentage ?? null,
  });

  return { listing, variations, pictures, attributes, shipping, metrics, quality, fees };
}

function normalizeShopeeCondition(raw?: string): 'new' | 'used' | 'refurbished' | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r === 'new' || r === 'NEW') return 'new';
  if (r === 'used' || r === 'USED') return 'used';
  return null;
}

export const shopeeAdapter: ListingAdapter = {
  channel: 'shopee',
  normalize: normalizeShopeeItem,
};
